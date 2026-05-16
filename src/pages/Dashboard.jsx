import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { formatDate } from "../lib/date";
import "./Dashboard.css";

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function getDisplayEpisodeCode(ep) {
  return `S${String(ep.seasonNumber).padStart(2, "0")}E${String(
    ep.number
  ).padStart(2, "0")}`;
}

function isEpisodeWatched(ep, watchedEpisodeIds) {
  if (!ep?.id) return false;
  return watchedEpisodeIds.has(String(ep.id));
}

function isFirstEpisode(ep) {
  return Number(ep?.seasonNumber) === 1 && Number(ep?.episodeNumber) === 1;
}

function normalizeStatus(value) {
  if (!value) return "";
  return String(value).trim().toLowerCase();
}

function isArchivedStatus(value) {
  const status = normalizeStatus(value);
  return status === "archived" || status === "archive";
}

function isWatchlistStatus(value) {
  const status = normalizeStatus(value);
  return status === "watchlist" || status === "plan_to_watch";
}

function formatMinutes(totalMinutes) {
  const minutes = Number(totalMinutes) || 0;

  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;

  return `${days}d ${hours}h ${mins}m`;
}

function chunkArray(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

const DASHBOARD_CACHE_TTL = 1000 * 60 * 20;

function readSessionCache(key) {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.savedAt || Date.now() - parsed.savedAt > DASHBOARD_CACHE_TTL) {
      return null;
    }
    return parsed.value || null;
  } catch {
    return null;
  }
}

function writeSessionCache(key, value) {
  try {
    sessionStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), value }));
  } catch {
    // Ignore cache write failures.
  }
}

function normalizeDateOnly(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function getShowPremiereDate(show) {
  return (
    normalizeDateOnly(show?.first_air_date) ||
    normalizeDateOnly(show?.firstAired) ||
    normalizeDateOnly(show?.premiere_date) ||
    normalizeDateOnly(show?.premiereDate) ||
    normalizeDateOnly(show?.aired_date) ||
    normalizeDateOnly(show?.air_date) ||
    normalizeDateOnly(show?.release_date) ||
    null
  );
}

function isDateWithinNextDays(dateValue, daysAhead = 10) {
  const normalized = normalizeDateOnly(dateValue);
  if (!normalized) return false;

  const today = startOfToday();
  const end = new Date(today);
  end.setDate(end.getDate() + daysAhead);

  const target = new Date(`${normalized}T00:00:00`);
  return target >= today && target <= end;
}

async function fetchUpcomingEpisodesForShowIds(showIds) {
  if (!showIds.length) return [];

  const todayIso = startOfToday().toISOString().slice(0, 10);
  const batches = chunkArray(showIds, 25);
  const allEpisodes = [];

  await Promise.all(
    batches.map(async (batch) => {
      const { data, error } = await supabase
        .from("episodes")
        .select(`
          id,
          show_id,
          season_number,
          episode_number,
          name,
          aired_date
        `)
        .in("show_id", batch)
        .gte("aired_date", todayIso)
        .order("aired_date", { ascending: true })
        .limit(80);

      if (error) throw error;
      allEpisodes.push(...(data || []));
    })
  );

  return allEpisodes;
}

async function fetchWatchedRuntimeRows(userId) {
  const pageSize = 1000;
  let from = 0;
  let done = false;
  const allRows = [];

  while (!done) {
    const to = from + pageSize - 1;

    const { data, error } = await supabase
      .from("watched_episodes")
      .select(`
        episode_id,
        episodes!inner(
          show_id,
          season_number,
          runtime_minutes
        )
      `)
      .eq("user_id", userId)
      .range(from, to);

    if (error) throw error;

    const rows = data || [];
    allRows.push(...rows);

    if (rows.length < pageSize) done = true;
    else from += pageSize;
  }

  return allRows;
}

async function fetchEpisodeCountsForShowIds(showIds) {
  if (!showIds.length) return {};

  const batches = chunkArray(showIds, 25);
  const counts = {};

  await Promise.all(
    batches.map(async (batch) => {
      const { data, error } = await supabase
        .from("episodes")
        .select("show_id")
        .in("show_id", batch)
        .neq("season_number", 0);

      if (error) throw error;

      for (const row of data || []) {
        counts[row.show_id] = (counts[row.show_id] || 0) + 1;
      }
    })
  );

  return counts;
}

async function fetchTrendingShows() {
  const cacheKey = "dashboard:trendingShows";
  const cached = readSessionCache(cacheKey);
  if (cached) return cached;

  const response = await fetch("/.netlify/functions/getTrendingShows");
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload?.message || "Failed to load trending shows");
  }

  const shows = (payload?.shows || []).filter((show) => show?.tmdb_id || show?.tvdb_id);
  writeSessionCache(cacheKey, shows);
  return shows;
}

async function fetchPremieringSoonShows(existingTmdbIds = []) {
  const cacheKey = "dashboard:premieringSoonShows";
  const cached = readSessionCache(cacheKey);
  let sourceShows = cached;

  if (!sourceShows) {
    const response = await fetch("/.netlify/functions/getPremieringSoonShows");
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload?.message || "Failed to load premiering soon shows");
    }

    sourceShows = payload?.shows || [];
    writeSessionCache(cacheKey, sourceShows);
  }

  const existingSet = new Set(
    (existingTmdbIds || []).map((id) => String(id)).filter(Boolean)
  );

  return (sourceShows || [])
    .filter((show) => show?.tmdb_id && !existingSet.has(String(show.tmdb_id)))
    .filter((show) => isDateWithinNextDays(getShowPremiereDate(show), 10))
    .sort((a, b) => {
      const aDate = getShowPremiereDate(a) || "9999-12-31";
      const bDate = getShowPremiereDate(b) || "9999-12-31";
      return aDate.localeCompare(bDate);
    });
}

function findSavedShowMatch(show, savedShows) {
  if (!show || !Array.isArray(savedShows)) return null;

  const showTmdbId = show?.tmdb_id ?? show?.tmdbId ?? show?.id ?? null;
  const showTvdbId = show?.tvdb_id ?? show?.tvdbId ?? show?.resolved_tvdb_id ?? null;

  return (
    savedShows.find((saved) => {
      const savedTmdbId = saved?.tmdb_id ?? null;
      const savedTvdbId = saved?.tvdb_id ?? null;

      if (showTmdbId && savedTmdbId && String(showTmdbId) === String(savedTmdbId)) {
        return true;
      }

      if (showTvdbId && savedTvdbId && String(showTvdbId) === String(savedTvdbId)) {
        return true;
      }

      return false;
    }) || null
  );
}

function getExternalShowLink(show, savedShows) {
  const savedShow = findSavedShowMatch(show, savedShows);

  if (savedShow?.tvdb_id) return `/my-shows/${savedShow.tvdb_id}`;
  if (savedShow?.tmdb_id) return `/my-shows/tmdb/${savedShow.tmdb_id}`;

  const tvdbId = show?.tvdb_id ?? show?.tvdbId ?? show?.resolved_tvdb_id ?? null;
  const tmdbId = show?.tmdb_id ?? show?.tmdbId ?? show?.id ?? null;

  if (tvdbId) return `/show/${tvdbId}`;
  if (tmdbId) return `/show/tmdb/${tmdbId}`;

  return null;
}

function DashboardEpisodeItem({
  show,
  episode,
  dateLabel = "Airs",
  dateValue,
}) {
  return (
    <Link
      to={`/my-shows/${show.tvdb_id}?episode=${episode.id}`}
      className="dashboard-item"
    >
      {show.poster_url ? (
        <img
          src={show.poster_url}
          alt={show.show_name}
          className="dashboard-poster"
          loading="lazy"
        />
      ) : (
        <div className="dashboard-poster" />
      )}

      <div className="dashboard-item-info">
        <strong>{show.show_name}</strong>
        <span>
          {getDisplayEpisodeCode(episode)} - {episode.name}
        </span>
        <small>
          {dateLabel}: {formatDate(dateValue || episode.aired)}
        </small>
      </div>
    </Link>
  );
}

function ExternalShowCard({ show, savedShows }) {
  const linkTarget = getExternalShowLink(show, savedShows);
  const showName = show?.name || show?.title || "Unknown show";
  const imageSrc =
    show?.image ||
    show?.poster_url ||
    show?.posterUrl ||
    show?.image_url ||
    (show?.poster_path ? `https://image.tmdb.org/t/p/w500${show.poster_path}` : "");

  const cardContent = imageSrc ? (
    <img
      src={imageSrc}
      alt={showName}
      className="trending-card-image"
      loading="lazy"
    />
  ) : (
    <div className="trending-card-image trending-card-image-placeholder">?</div>
  );

  if (!linkTarget) {
    return <div className="trending-card">{cardContent}</div>;
  }

  return (
    <Link to={linkTarget} className="trending-card">
      {cardContent}
    </Link>
  );
}

function StatCard({ label, value, to = null }) {
  const content = (
    <>
      <span className="stat-label">{label}</span>
      <strong className="stat-value">{value}</strong>
    </>
  );

  if (to) {
    return (
      <Link to={to} className="stat-card stat-card-link">
        {content}
      </Link>
    );
  }

  return <div className="stat-card">{content}</div>;
}

export default function Dashboard() {
  const [profile, setProfile] = useState(null);
  const [shows, setShows] = useState([]);
  const [watchedEpisodeIds, setWatchedEpisodeIds] = useState(new Set());
  const [episodesByShow, setEpisodesByShow] = useState({});
  const [upcomingItems, setUpcomingItems] = useState([]);
  const [trendingShows, setTrendingShows] = useState([]);
  const [premieringSoonShows, setPremieringSoonShows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadDashboard() {
      setLoading(true);

      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          setProfile(null);
          setShows([]);
          setWatchedEpisodeIds(new Set());
          setEpisodesByShow({});
          setUpcomingItems([]);

          try {
            const [trending, premieringSoon] = await Promise.all([
              fetchTrendingShows(),
              fetchPremieringSoonShows([]),
            ]);
            setTrendingShows(trending);
            setPremieringSoonShows(premieringSoon);
          } catch (error) {
            console.error("Error loading external dashboard sections:", error);
            setTrendingShows([]);
            setPremieringSoonShows([]);
          }

          setLoading(false);
          return;
        }

        const [profileResp, showsResp] = await Promise.all([
          supabase
            .from("profiles")
            .select(`
              id,
              username,
              full_name,
              avatar_url,
              dob,
              gender,
              country,
              bio,
              instagram_url,
              x_url,
              tiktok_url,
              youtube_url,
              website_url
            `)
            .eq("id", user.id)
            .maybeSingle(),

          supabase
            .from("user_shows_new")
            .select(`
              id,
              user_id,
              show_id,
              watch_status,
              archived_at,
              added_at,
              created_at,
              shows!inner(
                id,
                tvdb_id,
                tmdb_id,
                name,
                overview,
                status,
                poster_url,
                first_aired
              )
            `)
            .eq("user_id", user.id),
        ]);

        if (profileResp.error) {
          console.error("Error loading profile:", profileResp.error);
        }

        if (showsResp.error) {
          throw showsResp.error;
        }

        const normalizedShows = (showsResp.data || []).map((row) => ({
          id: row.id,
          user_id: row.user_id,
          show_id: row.show_id,
          watch_status: row.watch_status || "watching",
          archived_at: row.archived_at || null,
          added_at: row.added_at,
          created_at: row.created_at,
          tvdb_id: row.shows.tvdb_id,
          tmdb_id: row.shows.tmdb_id,
          show_name: row.shows.name || "Unknown title",
          overview: row.shows.overview || "",
          status: row.shows.status || null,
          poster_url: row.shows.poster_url || null,
          first_aired: row.shows.first_aired || null,
        }));

        const existingTmdbIds = normalizedShows.map((show) => show.tmdb_id);

        const showIds = normalizedShows
          .map((show) => show.show_id)
          .filter(Boolean);

        let watchedIds = new Set();
        let episodesLookup = {};
        let collectedUpcoming = [];

        if (showIds.length) {
          const [watchedRows, upcomingEpisodes, episodeCounts] = await Promise.all([
            fetchWatchedRuntimeRows(user.id),
            fetchUpcomingEpisodesForShowIds(showIds),
            fetchEpisodeCountsForShowIds(showIds),
          ]);

          watchedIds = new Set(
            (watchedRows || [])
              .map((row) => row.episode_id)
              .filter(Boolean)
              .map(String)
          );

          for (const showId of showIds) {
            episodesLookup[showId] = {
              totalMainEpisodes: episodeCounts[showId] || 0,
              watchedMainCount: 0,
              watchedMinutes: 0,
            };
          }

          for (const row of watchedRows || []) {
            const ep = row.episodes;
            if (!ep || Number(ep.season_number ?? 0) === 0) continue;

            if (!episodesLookup[ep.show_id]) {
              episodesLookup[ep.show_id] = {
                totalMainEpisodes: episodeCounts[ep.show_id] || 0,
                watchedMainCount: 0,
                watchedMinutes: 0,
              };
            }

            episodesLookup[ep.show_id].watchedMainCount += 1;
            episodesLookup[ep.show_id].watchedMinutes += Number(ep.runtime_minutes) || 0;
          }

          const showLookup = {};
          for (const show of normalizedShows) {
            showLookup[show.show_id] = show;
          }

          const today = startOfToday();
          const upcomingByShow = {};

          for (const row of upcomingEpisodes || []) {
            const show = showLookup[row.show_id];
            if (!show) continue;
            if (!row.aired_date) continue;

            const airDate = new Date(row.aired_date);
            if (Number.isNaN(airDate.getTime())) continue;

            const airDay = new Date(airDate);
            airDay.setHours(0, 0, 0, 0);

            if (airDay < today) continue;

            if (!upcomingByShow[row.show_id]) {
              upcomingByShow[row.show_id] = [];
            }

            upcomingByShow[row.show_id].push({
              id: row.id,
              show_id: row.show_id,
              showTvdbId: String(show.tvdb_id),
              showName: show.show_name,
              posterUrl: show.poster_url,
              watchStatus: show.watch_status,
              seasonNumber: row.season_number,
              episodeNumber: row.episode_number,
              name: row.name || "Untitled episode",
              aired: row.aired_date,
            });
          }

          Object.values(upcomingByShow).forEach((showEpisodes) => {
            if (!showEpisodes.length) return;

            showEpisodes.sort((a, b) => new Date(a.aired) - new Date(b.aired));

            const firstUpcomingEpisode = showEpisodes[0];
            const status = normalizeStatus(firstUpcomingEpisode.watchStatus);

            if (isArchivedStatus(status)) {
              return;
            }

            if (
              isWatchlistStatus(status) &&
              !isFirstEpisode(firstUpcomingEpisode)
            ) {
              return;
            }

            collectedUpcoming.push(
              ...showEpisodes.map((ep) => ({
                show: {
                  tvdb_id: ep.showTvdbId,
                  show_name: ep.showName,
                  poster_url: ep.posterUrl,
                },
                episode: {
                  id: ep.id,
                  show_id: ep.show_id,
                  seasonNumber: ep.seasonNumber,
                  number: ep.episodeNumber,
                  episodeNumber: ep.episodeNumber,
                  name: ep.name,
                  aired: ep.aired,
                },
              }))
            );
          });

          collectedUpcoming.sort(
            (a, b) => new Date(a.episode.aired) - new Date(b.episode.aired)
          );
        }

        let trending = [];
        let premieringSoon = [];

        try {
          [trending, premieringSoon] = await Promise.all([
            fetchTrendingShows(),
            fetchPremieringSoonShows(existingTmdbIds),
          ]);
        } catch (error) {
          console.error("Error loading external dashboard sections:", error);
        }

        setProfile(profileResp.data || null);
        setShows(normalizedShows);
        setWatchedEpisodeIds(watchedIds);
        setEpisodesByShow(episodesLookup);
        setUpcomingItems(collectedUpcoming);
        setTrendingShows(trending);
        setPremieringSoonShows(premieringSoon);
      } catch (error) {
        console.error("Error loading dashboard:", error);
        setProfile(null);
        setShows([]);
        setWatchedEpisodeIds(new Set());
        setEpisodesByShow({});
        setUpcomingItems([]);
        setTrendingShows([]);
        setPremieringSoonShows([]);
      } finally {
        setLoading(false);
      }
    }

    loadDashboard();
  }, []);

  const dashboardData = useMemo(() => {
    let completedCount = 0;
    let inProgressCount = 0;
    let watchedMinutes = 0;

    for (const show of shows) {
      const isArchived = isArchivedStatus(show.watch_status);
      const progress = episodesByShow[show.show_id] || {};
      const watchedMainCount = Number(progress.watchedMainCount) || 0;
      const totalMainEpisodes = Number(progress.totalMainEpisodes) || 0;
      watchedMinutes += Number(progress.watchedMinutes) || 0;

      const isCompleted =
        totalMainEpisodes > 0 &&
        watchedMainCount >= totalMainEpisodes &&
        !isArchived;

      const isInProgress =
        watchedMainCount > 0 &&
        watchedMainCount < totalMainEpisodes &&
        !isArchived;

      if (isCompleted) completedCount += 1;
      if (isInProgress) inProgressCount += 1;
    }

    const today = startOfToday();
    const end = new Date(today);
    end.setDate(today.getDate() + 7);

    const airingThisWeek = upcomingItems.filter((item) => {
      const d = new Date(item.episode.aired);
      return d >= today && d < end;
    });

    return {
      totalShows: shows.length,
      completedCount,
      inProgressCount,
      watchedMinutes,
      airingThisWeek,
    };
  }, [shows, episodesByShow, upcomingItems]);

  if (loading) {
    return (
      <div className="page">
        <p>Loading dashboard...</p>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>Dashboard</h1>
        <p>Your TV tracking at a glance.</p>
      </div>

      <section className="trending-section">
        <div className="card-header trending-header">
          <h2>Trending Shows</h2>
        </div>

        {trendingShows.length === 0 ? (
          <p className="empty-state">No trending shows available right now.</p>
        ) : (
          <div className="trending-row">
            {trendingShows.map((show) => (
              <ExternalShowCard
                key={`trending-${show.tmdb_id || show.tvdb_id || show.id}`}
                show={show}
                savedShows={shows}
              />
            ))}
          </div>
        )}
      </section>

      <section className="trending-section">
        <div className="card-header trending-header">
          <h2>Premiering Soon</h2>
        </div>

        {premieringSoonShows.length === 0 ? (
          <p className="empty-state">No new shows premiering soon.</p>
        ) : (
          <div className="trending-row">
            {premieringSoonShows.map((show) => (
              <ExternalShowCard
                key={`premiering-${show.tmdb_id || show.tvdb_id || show.id}`}
                show={show}
                savedShows={shows}
              />
            ))}
          </div>
        )}
      </section>

      <div className="stats-scroll-row stats-scroll-row-with-gap">
        <div className="stats-grid stats-grid-scroll">
          <StatCard
            label="Total Shows"
            value={dashboardData.totalShows}
            to="/my-shows"
          />
          <StatCard
            label="In Progress"
            value={dashboardData.inProgressCount}
          />
          <StatCard
            label="Completed"
            value={dashboardData.completedCount}
          />
          <StatCard
            label="Time Watched"
            value={formatMinutes(dashboardData.watchedMinutes)}
          />
        </div>
      </div>

      <div className="dashboard-grid">
        <section className="dashboard-card">
          <div className="card-header">
            <h2>Airing This Week</h2>
          </div>

          {dashboardData.airingThisWeek.length === 0 ? (
            <p className="empty-state">No episodes airing in this range.</p>
          ) : (
            <div className="dashboard-list">
              {dashboardData.airingThisWeek.map(({ show, episode }) => (
                <DashboardEpisodeItem
                  key={`${show.tvdb_id}-${episode.id}-week`}
                  show={show}
                  episode={episode}
                  dateLabel="Airs"
                  dateValue={episode.aired}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
