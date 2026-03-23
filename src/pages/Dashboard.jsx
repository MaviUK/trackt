import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { formatDate } from "../lib/date";

function parseDate(value) {
  if (!value) return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function pad(num) {
  return String(num).padStart(2, "0");
}

function toLocalDateKey(date) {
  if (!date) return null;
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate()
  )}`;
}

function getTodayKey() {
  return toLocalDateKey(new Date());
}

function getStoredDateKey(value) {
  if (!value) return null;

  if (typeof value === "string") {
    const trimmed = value.trim();

    // Handles both:
    // 2026-03-23
    // 2026-03-23T00:00:00+00:00
    const match = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
  }

  const parsed = parseDate(value);
  return parsed ? toLocalDateKey(parsed) : null;
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function isAired(dateStr) {
  const date = parseDate(dateStr);
  return !!date && date <= new Date();
}

function isToday(dateStr) {
  const key = getStoredDateKey(dateStr);
  return !!key && key === getTodayKey();
}

function isBeforeToday(dateStr) {
  const key = getStoredDateKey(dateStr);
  const todayKey = getTodayKey();

  if (!key) return false;
  return key < todayKey;
}

function isWithinLastDays(dateStr, days, { includeToday = true } = {}) {
  const key = getStoredDateKey(dateStr);
  if (!key) return false;

  const now = new Date();
  const todayStart = startOfDay(now);
  const rangeStart = new Date(todayStart);
  rangeStart.setDate(rangeStart.getDate() - days);

  const rangeStartKey = toLocalDateKey(rangeStart);
  const todayKey = toLocalDateKey(todayStart);

  if (includeToday) {
    return key >= rangeStartKey && key <= todayKey;
  }

  return key >= rangeStartKey && key < todayKey;
}

function isWithinLastMonth(dateStr) {
  const key = getStoredDateKey(dateStr);
  if (!key) return false;

  const now = new Date();
  const monthAgo = startOfDay(new Date(now));
  monthAgo.setMonth(monthAgo.getMonth() - 1);

  const monthAgoKey = toLocalDateKey(monthAgo);
  const todayKey = toLocalDateKey(now);

  return key >= monthAgoKey && key <= todayKey;
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

function getEpisodeSortTime(episode) {
  const parsed = parseDate(episode?.aired);
  return parsed?.getTime() ?? 0;
}

function DashboardEpisodeItem({ show, episode, dateLabel = "Aired" }) {
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
          {dateLabel}: {formatDate(episode.aired)}
        </small>
      </div>
    </Link>
  );
}

export default function Dashboard() {
  const [shows, setShows] = useState([]);
  const [watchedEpisodeIds, setWatchedEpisodeIds] = useState(new Set());
  const [episodesByShow, setEpisodesByShow] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadDashboard() {
      setLoading(true);

      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          setShows([]);
          setWatchedEpisodeIds(new Set());
          setEpisodesByShow({});
          setLoading(false);
          return;
        }

        const { data: userShows, error: showsError } = await supabase
          .from("user_shows_new")
          .select(`
            id,
            user_id,
            show_id,
            watch_status,
            added_at,
            created_at,
            shows!inner(
              id,
              tvdb_id,
              name,
              overview,
              status,
              poster_url,
              first_aired
            )
          `)
          .eq("user_id", user.id)
          .order("added_at", { ascending: false });

        if (showsError) {
          console.error("Error loading user shows:", showsError);
          setLoading(false);
          return;
        }

        const safeShows = (userShows || []).map((row) => ({
          id: row.id,
          user_id: row.user_id,
          show_id: row.show_id,
          watch_status: row.watch_status || "watching",
          added_at: row.added_at,
          created_at: row.created_at,
          tvdb_id: row.shows.tvdb_id,
          show_name: row.shows.name || "Unknown title",
          overview: row.shows.overview || "",
          status: row.shows.status || null,
          poster_url: row.shows.poster_url || null,
          first_aired: row.shows.first_aired || null,
        }));

        const showIds = safeShows.map((show) => show.show_id).filter(Boolean);

        const [watchedResp, episodesResp] = await Promise.all([
          supabase
            .from("watched_episodes")
            .select("episode_id")
            .eq("user_id", user.id),

          showIds.length
            ? supabase
                .from("episodes")
                .select(`
                  id,
                  show_id,
                  season_number,
                  episode_number,
                  name,
                  aired_date,
                  overview,
                  image_url,
                  episode_code
                `)
                .in("show_id", showIds)
                .order("show_id", { ascending: true })
                .order("season_number", { ascending: true })
                .order("episode_number", { ascending: true })
            : Promise.resolve({ data: [], error: null }),
        ]);

        if (watchedResp.error) {
          console.error("Error loading watched episodes:", watchedResp.error);
        }

        if (episodesResp.error) {
          console.error("Error loading episodes:", episodesResp.error);
        }

        const watchedIds = new Set(
          (watchedResp.data || [])
            .map((row) => row.episode_id)
            .filter(Boolean)
            .map(String)
        );

        const episodesLookup = {};
        for (const row of episodesResp.data || []) {
          const showId = row.show_id;

          if (!episodesLookup[showId]) {
            episodesLookup[showId] = [];
          }

          episodesLookup[showId].push({
            id: row.id,
            show_id: row.show_id,
            seasonNumber: row.season_number,
            number: row.episode_number,
            name: row.name || "Untitled episode",
            aired: row.aired_date,
            overview: row.overview || "",
            image: row.image_url || null,
            episodeCode: row.episode_code || null,
          });
        }

        setShows(safeShows);
        setWatchedEpisodeIds(watchedIds);
        setEpisodesByShow(episodesLookup);
      } catch (error) {
        console.error("Error loading dashboard:", error);
        setShows([]);
        setWatchedEpisodeIds(new Set());
        setEpisodesByShow({});
      } finally {
        setLoading(false);
      }
    }

    loadDashboard();
  }, []);

  const dashboardData = useMemo(() => {
    const airingToday = [];
    const recentlyAired = [];
    const continueWatching = [];
    const recentlyAdded = [];

    let completedCount = 0;
    let inProgressCount = 0;

    for (const show of shows) {
      const episodes = episodesByShow[show.show_id] || [];

      const airedBeforeToday = episodes.filter((ep) => isBeforeToday(ep.aired));
      const todayEpisodes = episodes.filter((ep) => isToday(ep.aired));

      const watchedAiredBeforeToday = airedBeforeToday.filter((ep) =>
        isEpisodeWatched(ep, watchedEpisodeIds)
      );

      const watchedAiredBeforeTodayCount = watchedAiredBeforeToday.length;

      const recentUnwatchedEpisodes = episodes.filter(
        (ep) =>
          isWithinLastDays(ep.aired, 7, { includeToday: false }) &&
          !isEpisodeWatched(ep, watchedEpisodeIds)
      );

      const latestRecentUnwatchedEpisode =
        [...episodes]
          .filter(
            (ep) =>
              isWithinLastMonth(ep.aired) &&
              !isEpisodeWatched(ep, watchedEpisodeIds)
          )
          .sort((a, b) => getEpisodeSortTime(b) - getEpisodeSortTime(a))[0] ||
        null;

      const isComplete =
        airedBeforeToday.length > 0 &&
        watchedAiredBeforeTodayCount >= airedBeforeToday.length;

      const nextContinueEpisode =
        watchedAiredBeforeTodayCount > 0 && !isComplete
          ? airedBeforeToday[watchedAiredBeforeTodayCount] || null
          : null;

      if (isComplete) {
        completedCount += 1;
      } else if (watchedAiredBeforeTodayCount > 0) {
        inProgressCount += 1;
      }

      for (const episode of todayEpisodes) {
        airingToday.push({ show, episode });
      }

      for (const episode of recentUnwatchedEpisodes) {
        recentlyAired.push({ show, episode });
      }

      if (nextContinueEpisode) {
        continueWatching.push({
          show,
          episode: nextContinueEpisode,
        });
      }

      if (latestRecentUnwatchedEpisode) {
        recentlyAdded.push({
          show,
          episode: latestRecentUnwatchedEpisode,
        });
      }
    }

    airingToday.sort(
      (a, b) => getEpisodeSortTime(a.episode) - getEpisodeSortTime(b.episode)
    );

    recentlyAired.sort(
      (a, b) => getEpisodeSortTime(b.episode) - getEpisodeSortTime(a.episode)
    );

    continueWatching.sort(
      (a, b) => getEpisodeSortTime(b.episode) - getEpisodeSortTime(a.episode)
    );

    recentlyAdded.sort(
      (a, b) => getEpisodeSortTime(b.episode) - getEpisodeSortTime(a.episode)
    );

    return {
      totalShows: shows.length,
      completedCount,
      inProgressCount,
      airingToday: airingToday.slice(0, 12),
      recentlyAired: recentlyAired.slice(0, 12),
      continueWatching: continueWatching.slice(0, 12),
      recentlyAdded: recentlyAdded.slice(0, 12),
    };
  }, [shows, watchedEpisodeIds, episodesByShow]);

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

      <div className="stats-grid">
        <div className="stat-card">
          <span className="stat-label">Total Shows</span>
          <strong className="stat-value">{dashboardData.totalShows}</strong>
        </div>
        <div className="stat-card">
          <span className="stat-label">In Progress</span>
          <strong className="stat-value">{dashboardData.inProgressCount}</strong>
        </div>
        <div className="stat-card">
          <span className="stat-label">Completed</span>
          <strong className="stat-value">{dashboardData.completedCount}</strong>
        </div>
      </div>

      <div className="dashboard-grid">
        <section className="dashboard-card">
          <div className="card-header">
            <h2>Airing Today</h2>
          </div>

          {dashboardData.airingToday.length === 0 ? (
            <p className="empty-state">No episodes airing today.</p>
          ) : (
            <div className="dashboard-list">
              {dashboardData.airingToday.map(({ show, episode }) => (
                <DashboardEpisodeItem
                  key={`${show.tvdb_id}-${episode.id}-today`}
                  show={show}
                  episode={episode}
                  dateLabel="Airs"
                />
              ))}
            </div>
          )}
        </section>

        <section className="dashboard-card">
          <div className="card-header">
            <h2>Recently Aired</h2>
          </div>

          {dashboardData.recentlyAired.length === 0 ? (
            <p className="empty-state">
              No unwatched episodes aired in the last 7 days.
            </p>
          ) : (
            <div className="dashboard-list">
              {dashboardData.recentlyAired.map(({ show, episode }) => (
                <DashboardEpisodeItem
                  key={`${show.tvdb_id}-${episode.id}-recent`}
                  show={show}
                  episode={episode}
                  dateLabel="Aired"
                />
              ))}
            </div>
          )}
        </section>

        <section className="dashboard-card">
          <div className="card-header">
            <h2>Continue Watching</h2>
          </div>

          {dashboardData.continueWatching.length === 0 ? (
            <p className="empty-state">No shows ready to continue.</p>
          ) : (
            <div className="dashboard-list">
              {dashboardData.continueWatching.map(({ show, episode }) => (
                <DashboardEpisodeItem
                  key={`${show.tvdb_id}-${episode.id}-continue`}
                  show={show}
                  episode={episode}
                  dateLabel="Aired"
                />
              ))}
            </div>
          )}
        </section>

        <section className="dashboard-card">
          <div className="card-header">
            <h2>Recently Added</h2>
          </div>

          {dashboardData.recentlyAdded.length === 0 ? (
            <p className="empty-state">
              No unwatched recent episodes found in the last month.
            </p>
          ) : (
            <div className="dashboard-list">
              {dashboardData.recentlyAdded.map(({ show, episode }) => (
                <DashboardEpisodeItem
                  key={`${show.tvdb_id}-${episode.id}-added`}
                  show={show}
                  episode={episode}
                  dateLabel="Aired"
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
