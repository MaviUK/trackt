import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { formatDate } from "../lib/date";
import "./Dashboard.css";

const DASHBOARD_CACHE_PREFIX = "trackt_dashboard_cache_v3_RENDERED_ONLY";
const DASHBOARD_CACHE_DURATION = 1000 * 60 * 60 * 24; // 24 hours
const DASHBOARD_PUBLIC_CACHE_KEY = `${DASHBOARD_CACHE_PREFIX}:public`;
const DASHBOARD_LAST_CACHE_KEY = `${DASHBOARD_CACHE_PREFIX}:last`;

let dashboardMemoryCache = null;

function getDashboardCacheKey(userId) {
  return userId ? `${DASHBOARD_CACHE_PREFIX}:${userId}` : DASHBOARD_PUBLIC_CACHE_KEY;
}

function isValidCachePayload(payload) {
  if (!payload?.savedAt || !payload?.data) return false;
  return Date.now() - Number(payload.savedAt) < DASHBOARD_CACHE_DURATION;
}

function readLastDashboardCache() {
  if (dashboardMemoryCache && isValidCachePayload(dashboardMemoryCache)) {
    return dashboardMemoryCache.data;
  }

  if (typeof window === "undefined") return null;

  try {
    const lastKey = window.localStorage.getItem(DASHBOARD_LAST_CACHE_KEY);
    if (!lastKey) return null;

    const raw = window.localStorage.getItem(lastKey);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!isValidCachePayload(parsed)) return null;

    dashboardMemoryCache = parsed;
    return parsed.data;
  } catch (error) {
    console.warn("Failed reading dashboard cache:", error);
    return null;
  }
}

function readDashboardCache(userId) {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(getDashboardCacheKey(userId));
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!isValidCachePayload(parsed)) return null;

    dashboardMemoryCache = parsed;
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

  dashboardMemoryCache = payload;

  try {
    const cacheKey = getDashboardCacheKey(userId);
    window.localStorage.setItem(cacheKey, JSON.stringify(payload));
    window.localStorage.setItem(DASHBOARD_LAST_CACHE_KEY, cacheKey);
  } catch (error) {
    console.warn("Failed writing dashboard cache:", error);
  }
}

function makeEmptyDashboardView() {
  return {
    savedShows: [],
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
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
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

async function fetchPremieringSoonShows(existingTmdbIds = []) {
  const response = await fetch("/.netlify/functions/getPremieringSoonShows");
  const payload = await response.json();

  if (!response.ok) throw new Error(payload?.message || "Failed to load premiering soon shows");

  const existingSet = new Set((existingTmdbIds || []).map((id) => String(id)).filter(Boolean));

  return (payload?.shows || [])
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
      if (showTmdbId && savedTmdbId && String(showTmdbId) === String(savedTmdbId)) return true;
      if (showTvdbId && savedTvdbId && String(showTvdbId) === String(savedTvdbId)) return true;
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

function buildDashboardStats(normalizedShows, allEpisodes, watchedRows) {
  const watchedEpisodeIds = new Set(
    (watchedRows || []).map((row) => row.episode_id).filter(Boolean).map(String)
  );

  const episodesByShow = {};
  for (const row of allEpisodes || []) {
    if (!episodesByShow[row.show_id]) episodesByShow[row.show_id] = [];
    episodesByShow[row.show_id].push({
      id: row.id,
      show_id: row.show_id,
      seasonNumber: row.season_number,
      number: row.episode_number,
      episodeNumber: row.episode_number,
      name: row.name || "Untitled episode",
      aired: row.aired_date,
      runtime_minutes: Number(row.runtime_minutes) || 0,
    });
  }

  let completedCount = 0;
  let inProgressCount = 0;
  let watchedMinutes = 0;

  for (const show of normalizedShows) {
    const isArchived = isArchivedStatus(show.watch_status);
    const episodes = episodesByShow[show.show_id] || [];
    const mainEpisodes = episodes.filter((ep) => Number(ep.seasonNumber ?? 0) !== 0);
    const watchedMainEpisodes = mainEpisodes.filter((ep) => isEpisodeWatched(ep, watchedEpisodeIds));

    for (const watchedEp of watchedMainEpisodes) {
      watchedMinutes += Number(watchedEp.runtime_minutes) || 0;
    }

    const watchedMainCount = watchedMainEpisodes.length;
    const totalMainEpisodes = mainEpisodes.length;

    if (totalMainEpisodes > 0 && watchedMainCount >= totalMainEpisodes && !isArchived) {
      completedCount += 1;
    }

    if (watchedMainCount > 0 && watchedMainCount < totalMainEpisodes && !isArchived) {
      inProgressCount += 1;
    }
  }

  const showLookup = {};
  for (const show of normalizedShows) showLookup[show.show_id] = show;

  const today = startOfToday();
  const nextWeek = new Date(today);
  nextWeek.setDate(today.getDate() + 7);
  const upcomingByShow = {};

  for (const row of allEpisodes || []) {
    const show = showLookup[row.show_id];
    if (!show || !row.aired_date) continue;

    const airDate = new Date(row.aired_date);
    if (Number.isNaN(airDate.getTime())) continue;

    const airDay = new Date(airDate);
    airDay.setHours(0, 0, 0, 0);
    if (airDay < today || airDay >= nextWeek) continue;

    if (!upcomingByShow[row.show_id]) upcomingByShow[row.show_id] = [];

    upcomingByShow[row.show_id].push({
      show: {
        tvdb_id: String(show.tvdb_id),
        show_name: show.show_name,
        poster_url: show.poster_url,
      },
      episode: {
        id: row.id,
        show_id: row.show_id,
        seasonNumber: row.season_number,
        number: row.episode_number,
        episodeNumber: row.episode_number,
        name: row.name || "Untitled episode",
        aired: row.aired_date,
      },
      watchStatus: show.watch_status,
    });
  }

  const airingThisWeek = [];

  Object.values(upcomingByShow).forEach((showEpisodes) => {
    if (!showEpisodes.length) return;
    showEpisodes.sort((a, b) => new Date(a.episode.aired) - new Date(b.episode.aired));

    const firstUpcomingEpisode = showEpisodes[0];
    const status = normalizeStatus(firstUpcomingEpisode.watchStatus);

    if (isArchivedStatus(status)) return;
    if (isWatchlistStatus(status) && !isFirstEpisode(firstUpcomingEpisode.episode)) return;

    airingThisWeek.push(...showEpisodes.map(({ show, episode }) => ({ show, episode })));
  });

  airingThisWeek.sort((a, b) => new Date(a.episode.aired) - new Date(b.episode.aired));

  return {
    totalShows: normalizedShows.length,
    completedCount,
    inProgressCount,
    watchedMinutes,
    airingThisWeek,
  };
}

function DashboardEpisodeItem({ show, episode, dateLabel = "Airs", dateValue }) {
  return (
    <Link to={`/my-shows/${show.tvdb_id}?episode=${episode.id}`} className="dashboard-item">
      {show.poster_url ? (
        <img
          src={show.poster_url}
          alt={show.show_name}
          className="dashboard-poster"
          loading="lazy"
          decoding="async"
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
  const initialDashboardView = useMemo(() => readLastDashboardCache(), []);
  const [dashboardView, setDashboardView] = useState(() => initialDashboardView || makeEmptyDashboardView());
  const [loading, setLoading] = useState(() => !initialDashboardView);

  useEffect(() => {
    let cancelled = false;

    async function loadDashboard() {
      const instantCache = readLastDashboardCache();
      if (instantCache) {
        setDashboardView(instantCache);
        setLoading(false);
        return;
      }

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
            fetchPremieringSoonShows([]),
          ]);

          const publicView = {
            savedShows: [],
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

        const existingTmdbIds = normalizedShows.map((show) => show.tmdb_id).filter(Boolean);
        const showIds = normalizedShows.map((show) => show.show_id).filter(Boolean);

        const [watchedRows, allEpisodes, trending, premieringSoon] = await Promise.all([
          showIds.length ? fetchAllWatchedEpisodeRows(user.id) : Promise.resolve([]),
          showIds.length ? fetchEpisodesForShowIds(showIds) : Promise.resolve([]),
          fetchTrendingShows().catch((error) => {
            console.error("Error loading trending shows:", error);
            return [];
          }),
          fetchPremieringSoonShows(existingTmdbIds).catch((error) => {
            console.error("Error loading premiering soon shows:", error);
            return [];
          }),
        ]);

        const freshDashboardView = {
          savedShows: normalizedShows.map((show) => ({
            show_id: show.show_id,
            tvdb_id: show.tvdb_id,
            tmdb_id: show.tmdb_id,
            show_name: show.show_name,
            poster_url: show.poster_url,
            watch_status: show.watch_status,
          })),
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
