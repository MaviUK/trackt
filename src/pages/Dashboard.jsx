import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { formatDate } from "../lib/date";
import "./Dashboard.css";

const DASHBOARD_CACHE_PREFIX = "trackt_dashboard_cache_v5_TMDB_RESOLVER_LINKS";
const DASHBOARD_CACHE_DURATION = 1000 * 60 * 60 * 24; // 24 hours
const DASHBOARD_PUBLIC_CACHE_KEY = `${DASHBOARD_CACHE_PREFIX}:public`;

function getDashboardCacheKey(userId) {
  return userId ? `${DASHBOARD_CACHE_PREFIX}:${userId}` : DASHBOARD_PUBLIC_CACHE_KEY;
}

function isValidCachePayload(payload) {
  if (!payload?.savedAt || !payload?.data) return false;
  return Date.now() - Number(payload.savedAt) < DASHBOARD_CACHE_DURATION;
}

function readDashboardCache(userId) {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(getDashboardCacheKey(userId));
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!isValidCachePayload(parsed)) return null;

    return parsed.data;
  } catch (error) {
    console.warn("Failed reading dashboard cache:", error);
    return null;
  }
}

function writeDashboardCache(userId, data) {
  if (typeof window === "undefined") return;

  const payload = {
    savedAt: Date.now(),
    data,
  };

  try {
    const cacheKey = getDashboardCacheKey(userId);
    window.localStorage.setItem(cacheKey, JSON.stringify(payload));
  } catch (error) {
    console.warn("Failed writing dashboard cache:", error);
  }
}

function makeEmptyDashboardView() {
  return {
    savedShows: [],
    databaseShows: [],
    trendingShows: [],
    premieringSoonShows: [],
    stats: {
      totalShows: 0,
      inProgressCount: 0,
      completedCount: 0,
      watchedMinutes: 0,
      airingThisWeek: [],
    },
  };
}

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
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, size + i));
  return chunks;
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

async function fetchEpisodesForShowIds(showIds) {
  if (!showIds.length) return [];

  const batches = chunkArray(showIds, 4);
  const allEpisodes = [];
  const pageSize = 1000;

  for (const batch of batches) {
    let from = 0;
    let done = false;

    while (!done) {
      const to = from + pageSize - 1;

      const { data, error } = await supabase
        .from("episodes")
        .select(`
          id,
          show_id,
          season_number,
          episode_number,
          name,
          aired_date,
          runtime_minutes
        `)
        .in("show_id", batch)
        .order("show_id", { ascending: true })
        .order("season_number", { ascending: true })
        .order("episode_number", { ascending: true })
        .range(from, to);

      if (error) throw error;

      const rows = data || [];
      allEpisodes.push(...rows);
      done = rows.length < pageSize;
      from += pageSize;
    }
  }

  return allEpisodes;
}

async function fetchAllWatchedEpisodeRows(userId) {
  const pageSize = 1000;
  let from = 0;
  let done = false;
  const allRows = [];

  while (!done) {
    const to = from + pageSize - 1;

    const { data, error } = await supabase
      .from("watched_episodes")
      .select("episode_id")
      .eq("user_id", userId)
      .range(from, to);

    if (error) throw error;

    const rows = data || [];
    allRows.push(...rows);
    done = rows.length < pageSize;
    from += pageSize;
  }

  return allRows;
}

async function fetchTrendingShows() {
  const response = await fetch("/.netlify/functions/getTrendingShows");
  const payload = await response.json();

  if (!response.ok) throw new Error(payload?.message || "Failed to load trending shows");
  return (payload?.shows || []).filter((show) => show?.tmdb_id || show?.tvdb_id);
}

async function fetchPremieringSoonShows() {
  const response = await fetch("/.netlify/functions/getPremieringSoon");
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload?.message || "Failed to load premiering soon shows");
  }

  return (payload?.shows || payload?.items || []).filter((show) => {
    const date = getShowPremiereDate(show);
    return date && isDateWithinNextDays(date, 10);
  });
}

async function fetchDatabaseShowMatches(externalShows) {
  const tmdbIds = Array.from(
    new Set(
      (externalShows || [])
        .map((show) => show?.tmdb_id || show?.id)
        .filter(Boolean)
        .map(String)
    )
  );

  const tvdbIds = Array.from(
    new Set(
      (externalShows || [])
        .map((show) => show?.tvdb_id)
        .filter(Boolean)
        .map(String)
    )
  );

  const databaseShows = [];

  if (tmdbIds.length) {
    const { data, error } = await supabase
      .from("shows")
      .select("id, tvdb_id, tmdb_id, name, poster_url")
      .in("tmdb_id", tmdbIds);

    if (error) throw error;
    databaseShows.push(...(data || []));
  }

  if (tvdbIds.length) {
    const { data, error } = await supabase
      .from("shows")
      .select("id, tvdb_id, tmdb_id, name, poster_url")
      .in("tvdb_id", tvdbIds);

    if (error) throw error;
    databaseShows.push(...(data || []));
  }

  const unique = new Map();
  databaseShows.forEach((show) => {
    if (show?.id) unique.set(String(show.id), show);
  });

  return Array.from(unique.values());
}

function getExternalShowLink(show, savedShows, databaseShows) {
  if (!show) return null;

  const tmdbId = show.tmdb_id || show.id || null;
  const tvdbId = show.tvdb_id || null;

  const saved = (savedShows || []).find((item) => {
    return (
      (tmdbId && String(item.tmdb_id) === String(tmdbId)) ||
      (tvdbId && String(item.tvdb_id) === String(tvdbId))
    );
  });

  if (saved?.show_id) return `/my-shows/${saved.show_id}`;

  const database = (databaseShows || []).find((item) => {
    return (
      (tmdbId && String(item.tmdb_id) === String(tmdbId)) ||
      (tvdbId && String(item.tvdb_id) === String(tvdbId))
    );
  });

  if (database?.tmdb_id) return `/show/tmdb/${database.tmdb_id}`;
  if (database?.tvdb_id) return `/show/${database.tvdb_id}`;
  if (tmdbId) return `/show/tmdb/${tmdbId}`;
  if (tvdbId) return `/show/${tvdbId}`;
  return null;
}

function getEpisodeDate(episode) {
  return normalizeDateOnly(episode?.aired_date || episode?.aired || episode?.air_date);
}

function normalizeEpisode(ep) {
  const seasonNumber = Number(ep.season_number ?? ep.seasonNumber ?? 0);
  const episodeNumber = Number(ep.episode_number ?? ep.episodeNumber ?? 0);

  return {
    id: ep.id,
    show_id: ep.show_id,
    seasonNumber,
    episodeNumber,
    number: episodeNumber,
    name: ep.name || `Episode ${episodeNumber || ""}`.trim(),
    aired: getEpisodeDate(ep),
    runtime_minutes: Number(ep.runtime_minutes || 0),
  };
}

function buildDashboardStats(savedShows, episodes, watchedEpisodeRows) {
  const watchedEpisodeIds = new Set(
    (watchedEpisodeRows || []).map((row) => String(row.episode_id)).filter(Boolean)
  );

  const visibleShows = (savedShows || []).filter(
    (show) => !isArchivedStatus(show.watch_status)
  );

  const inProgressCount = visibleShows.filter((show) =>
    normalizeStatus(show.watch_status) === "watching"
  ).length;

  const completedCount = visibleShows.filter((show) =>
    normalizeStatus(show.watch_status) === "completed"
  ).length;

  const visibleShowIds = new Set(visibleShows.map((show) => String(show.show_id)));

  const upcomingEpisodes = (episodes || [])
    .map(normalizeEpisode)
    .filter((episode) => {
      if (!visibleShowIds.has(String(episode.show_id))) return false;
      if (!episode.aired) return false;
      if (!isDateWithinNextDays(episode.aired, 7)) return false;
      return !isEpisodeWatched(episode, watchedEpisodeIds);
    })
    .sort((a, b) => {
      if (a.aired !== b.aired) return a.aired.localeCompare(b.aired);
      if (a.seasonNumber !== b.seasonNumber) return a.seasonNumber - b.seasonNumber;
      return a.episodeNumber - b.episodeNumber;
    });

  const showsById = new Map(visibleShows.map((show) => [String(show.show_id), show]));
  const runtimeByShowId = new Map();

  (episodes || []).forEach((episode) => {
    if (isEpisodeWatched(episode, watchedEpisodeIds)) {
      const key = String(episode.show_id);
      runtimeByShowId.set(
        key,
        (runtimeByShowId.get(key) || 0) + Number(episode.runtime_minutes || 0)
      );
    }
  });

  return {
    totalShows: visibleShows.length,
    inProgressCount,
    completedCount,
    watchedMinutes: Array.from(runtimeByShowId.values()).reduce(
      (total, minutes) => total + minutes,
      0
    ),
    airingThisWeek: upcomingEpisodes.slice(0, 6).map((episode) => ({
      show: showsById.get(String(episode.show_id)),
      episode,
    })),
  };
}

function DashboardEpisodeItem({ show, episode, dateLabel, dateValue }) {
  if (!show || !episode) return null;

  return (
    <Link to={`/my-shows/${show.show_id}`} className="dashboard-list-item dashboard-episode-item">
      {show.poster_url ? (
        <img src={show.poster_url} alt="" className="dashboard-list-poster" />
      ) : (
        <div className="dashboard-list-poster dashboard-list-poster-placeholder">?</div>
      )}
      <div className="dashboard-list-copy">
        <strong>{show.show_name || "Unknown show"}</strong>
        <span>
          {getDisplayEpisodeCode(episode)} · {episode.name || "New episode"}
        </span>
        <small>
          {dateLabel}: {formatDate(dateValue || episode.aired)}
        </small>
      </div>
    </Link>
  );
}

function ExternalShowCard({ show, savedShows, databaseShows }) {
  const linkTarget = getExternalShowLink(show, savedShows, databaseShows);
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
      decoding="async"
    />
  ) : (
    <div className="trending-card-image trending-card-image-placeholder">?</div>
  );

  if (!linkTarget) return <div className="trending-card">{cardContent}</div>;

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
  const [dashboardView, setDashboardView] = useState(() => makeEmptyDashboardView());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadDashboard() {
      setDashboardView(makeEmptyDashboardView());
      setLoading(true);

      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        const user = session?.user || null;

        if (!user) {
          const cachedPublic = readDashboardCache(null);
          if (cachedPublic) {
            if (!cancelled) {
              setDashboardView(cachedPublic);
              setLoading(false);
            }
            return;
          }

          const [trending, premieringSoon] = await Promise.all([
            fetchTrendingShows(),
            fetchPremieringSoonShows(),
          ]);

          const databaseShows = await fetchDatabaseShowMatches([
            ...trending,
            ...premieringSoon,
          ]).catch((error) => {
            console.error("Error matching public dashboard shows:", error);
            return [];
          });

          const publicView = {
            savedShows: [],
            databaseShows,
            trendingShows: trending,
            premieringSoonShows: premieringSoon,
            stats: makeEmptyDashboardView().stats,
          };

          writeDashboardCache(null, publicView);
          if (!cancelled) setDashboardView(publicView);
          return;
        }

        const cachedUser = readDashboardCache(user.id);
        if (cachedUser) {
          if (!cancelled) {
            setDashboardView(cachedUser);
            setLoading(false);
          }
          return;
        }

        const { data: showRows, error: showsError } = await supabase
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
              status,
              poster_url,
              first_aired
            )
          `)
          .eq("user_id", user.id);

        if (showsError) throw showsError;

        const normalizedShows = (showRows || []).map((row) => ({
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
          status: row.shows.status || null,
          poster_url: row.shows.poster_url || null,
          first_aired: row.shows.first_aired || null,
        }));

        const showIds = normalizedShows.map((show) => show.show_id).filter(Boolean);

        const [watchedRows, allEpisodes, trending, premieringSoon] = await Promise.all([
          showIds.length ? fetchAllWatchedEpisodeRows(user.id) : Promise.resolve([]),
          showIds.length ? fetchEpisodesForShowIds(showIds) : Promise.resolve([]),
          fetchTrendingShows().catch((error) => {
            console.error("Error loading trending shows:", error);
            return [];
          }),
          fetchPremieringSoonShows().catch((error) => {
            console.error("Error loading premiering soon shows:", error);
            return [];
          }),
        ]);

        const databaseShows = await fetchDatabaseShowMatches([
          ...trending,
          ...premieringSoon,
        ]).catch((error) => {
          console.error("Error matching dashboard shows:", error);
          return [];
        });

        const freshDashboardView = {
          savedShows: normalizedShows.map((show) => ({
            show_id: show.show_id,
            tvdb_id: show.tvdb_id,
            tmdb_id: show.tmdb_id,
            show_name: show.show_name,
            poster_url: show.poster_url,
            watch_status: show.watch_status,
          })),
          databaseShows,
          trendingShows: trending,
          premieringSoonShows: premieringSoon,
          stats: buildDashboardStats(normalizedShows, allEpisodes, watchedRows),
        };

        writeDashboardCache(user.id, freshDashboardView);
        if (!cancelled) setDashboardView(freshDashboardView);
      } catch (error) {
        console.error("Error loading dashboard:", error);
        if (!cancelled) setDashboardView(makeEmptyDashboardView());
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadDashboard();

    return () => {
      cancelled = true;
    };
  }, []);

  const savedShows = dashboardView.savedShows || [];
  const databaseShows = dashboardView.databaseShows || [];
  const trendingShows = dashboardView.trendingShows || [];
  const premieringSoonShows = dashboardView.premieringSoonShows || [];
  const dashboardData = dashboardView.stats || makeEmptyDashboardView().stats;

  if (loading) {
    return (
      <div className="page dashboard-page">
        <p>Loading dashboard...</p>
      </div>
    );
  }

  return (
    <div className="page dashboard-page">
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
                savedShows={savedShows}
                databaseShows={databaseShows}
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
                savedShows={savedShows}
                databaseShows={databaseShows}
              />
            ))}
          </div>
        )}
      </section>

      <div className="stats-scroll-row stats-scroll-row-with-gap">
        <div className="stats-grid stats-grid-scroll">
          <StatCard label="Total Shows" value={dashboardData.totalShows} to="/my-shows" />
          <StatCard label="In Progress" value={dashboardData.inProgressCount} />
          <StatCard label="Completed" value={dashboardData.completedCount} />
          <StatCard label="Time Watched" value={formatMinutes(dashboardData.watchedMinutes)} />
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
