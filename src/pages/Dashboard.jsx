import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { getCachedEpisodes } from "../lib/episodesCache";
import { formatDate } from "../lib/date";

function parseDate(dateStr) {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  return Number.isNaN(date.getTime()) ? null : date;
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
  const date = parseDate(dateStr);
  if (!date) return false;

  const todayStart = startOfDay(new Date());
  const todayEnd = endOfDay(new Date());

  return date >= todayStart && date <= todayEnd;
}

function isBeforeToday(dateStr) {
  const date = parseDate(dateStr);
  if (!date) return false;
  return date < startOfDay(new Date());
}

function isWithinLastDays(dateStr, days, { includeToday = true } = {}) {
  const date = parseDate(dateStr);
  if (!date) return false;

  const now = new Date();
  const todayStart = startOfDay(now);
  const rangeStart = new Date(todayStart);
  rangeStart.setDate(rangeStart.getDate() - days);

  if (includeToday) {
    return date >= rangeStart && date <= endOfDay(now);
  }

  return date >= rangeStart && date < todayStart;
}

function isWithinLastMonth(dateStr) {
  const date = parseDate(dateStr);
  if (!date) return false;

  const now = new Date();
  const monthAgo = startOfDay(new Date(now));
  monthAgo.setMonth(monthAgo.getMonth() - 1);

  return date >= monthAgo && date <= endOfDay(now);
}

function getDisplayEpisodeCode(ep) {
  return `S${String(ep.seasonNumber).padStart(2, "0")}E${String(
    ep.number
  ).padStart(2, "0")}`;
}

function sortEpisodes(episodes) {
  return [...episodes].sort((a, b) => {
    const seasonDiff = Number(a.seasonNumber || 0) - Number(b.seasonNumber || 0);
    if (seasonDiff !== 0) return seasonDiff;

    const episodeDiff = Number(a.number || 0) - Number(b.number || 0);
    if (episodeDiff !== 0) return episodeDiff;

    const aTime = parseDate(a.aired)?.getTime() ?? 0;
    const bTime = parseDate(b.aired)?.getTime() ?? 0;
    return aTime - bTime;
  });
}

function dedupeEpisodes(episodes) {
  const seen = new Set();
  const result = [];

  for (const ep of episodes) {
    const key = `${ep.seasonNumber}-${ep.number}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(ep);
  }

  return result;
}

function isEpisodeWatched(ep, watchedSet) {
  return watchedSet.has(String(ep.id).trim());
}

function getSequentialProgressInfo(episodes, watchedSet) {
  const airedBeforeToday = episodes.filter((ep) => isBeforeToday(ep.aired));
  const watchedCount = airedBeforeToday.filter((ep) =>
    isEpisodeWatched(ep, watchedSet)
  ).length;

  const firstUnwatchedIndex = airedBeforeToday.findIndex(
    (ep) => !isEpisodeWatched(ep, watchedSet)
  );

  if (airedBeforeToday.length === 0) {
    return {
      airedBeforeToday,
      watchedCount,
      firstUnwatchedIndex: -1,
      nextContinueEpisode: null,
      isComplete: false,
      hasWatchedAfterGap: false,
    };
  }

  if (firstUnwatchedIndex === -1) {
    return {
      airedBeforeToday,
      watchedCount,
      firstUnwatchedIndex,
      nextContinueEpisode: null,
      isComplete: true,
      hasWatchedAfterGap: false,
    };
  }

  const hasWatchedAfterGap = airedBeforeToday
    .slice(firstUnwatchedIndex + 1)
    .some((ep) => isEpisodeWatched(ep, watchedSet));

  const nextContinueEpisode = hasWatchedAfterGap
    ? null
    : airedBeforeToday[firstUnwatchedIndex];

  return {
    airedBeforeToday,
    watchedCount,
    firstUnwatchedIndex,
    nextContinueEpisode,
    isComplete: false,
    hasWatchedAfterGap,
  };
}

function DashboardEpisodeItem({ show, episode, dateLabel = "Aired" }) {
  return (
    <Link to={`/my-shows/${show.tvdb_id}`} className="dashboard-item">
      <img
        src={show.poster_url}
        alt={show.show_name}
        className="dashboard-poster"
      />
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
  const [watchedMap, setWatchedMap] = useState({});
  const [episodesByShow, setEpisodesByShow] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadDashboard() {
      setLoading(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setShows([]);
        setWatchedMap({});
        setEpisodesByShow({});
        setLoading(false);
        return;
      }

      const { data: userShows, error: showsError } = await supabase
        .from("user_shows")
        .select("*")
        .eq("user_id", user.id)
        .order("added_at", { ascending: false });

      if (showsError) {
        console.error("Error loading user shows:", showsError);
        setLoading(false);
        return;
      }

      const tvdbIds = (userShows || []).map((show) => show.tvdb_id);

      let watchedRows = [];
      if (tvdbIds.length > 0) {
        const { data: watchedData, error: watchedError } = await supabase
          .from("watched_episodes")
          .select("show_tvdb_id, episode_id")
          .eq("user_id", user.id)
          .in("show_tvdb_id", tvdbIds);

        if (watchedError) {
          console.error("Error loading watched episodes:", watchedError);
        } else {
          watchedRows = watchedData || [];
        }
      }

      const watchedLookup = {};
      for (const row of watchedRows) {
        if (!watchedLookup[row.show_tvdb_id]) {
          watchedLookup[row.show_tvdb_id] = new Set();
        }
        watchedLookup[row.show_tvdb_id].add(String(row.episode_id).trim());
      }

      const episodesLookup = {};
      await Promise.all(
        (userShows || []).map(async (show) => {
          try {
            const eps = await getCachedEpisodes(show.tvdb_id);
            episodesLookup[show.tvdb_id] = dedupeEpisodes(
              sortEpisodes(
                (eps || []).filter(
                  (ep) =>
                    Number(ep.seasonNumber) > 0 &&
                    Number(ep.number) > 0
                )
              )
            );
          } catch (err) {
            console.error(`Failed to load episodes for ${show.show_name}:`, err);
            episodesLookup[show.tvdb_id] = [];
          }
        })
      );

      setShows(userShows || []);
      setWatchedMap(watchedLookup);
      setEpisodesByShow(episodesLookup);
      setLoading(false);
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
      const episodes = episodesByShow[show.tvdb_id] || [];
      const watchedSet = watchedMap[show.tvdb_id] || new Set();

      const todayEpisodes = episodes.filter((ep) => isToday(ep.aired));

      const recentUnwatchedEpisodes = episodes.filter(
        (ep) =>
          isWithinLastDays(ep.aired, 7, { includeToday: false }) &&
          !isEpisodeWatched(ep, watchedSet)
      );

      const latestRecentUnwatchedEpisode =
        [...episodes]
          .filter(
            (ep) =>
              isWithinLastMonth(ep.aired) &&
              !isEpisodeWatched(ep, watchedSet)
          )
          .sort((a, b) => {
            const aTime = parseDate(a.aired)?.getTime() ?? 0;
            const bTime = parseDate(b.aired)?.getTime() ?? 0;
            return bTime - aTime;
          })[0] || null;

      const progress = getSequentialProgressInfo(episodes, watchedSet);

      if (progress.isComplete) {
        completedCount += 1;
      } else if (
        progress.watchedCount > 0 &&
        progress.nextContinueEpisode &&
        !progress.hasWatchedAfterGap
      ) {
        inProgressCount += 1;
      }

      for (const episode of todayEpisodes) {
        airingToday.push({ show, episode });
      }

      for (const episode of recentUnwatchedEpisodes) {
        recentlyAired.push({ show, episode });
      }

      if (
        progress.watchedCount > 0 &&
        progress.nextContinueEpisode &&
        !progress.isComplete &&
        !progress.hasWatchedAfterGap
      ) {
        continueWatching.push({
          show,
          episode: progress.nextContinueEpisode,
        });
      }

      if (latestRecentUnwatchedEpisode) {
        recentlyAdded.push({
          show,
          episode: latestRecentUnwatchedEpisode,
        });
      }
    }

    airingToday.sort((a, b) => {
      const aDate = parseDate(a.episode.aired)?.getTime() ?? 0;
      const bDate = parseDate(b.episode.aired)?.getTime() ?? 0;
      return aDate - bDate;
    });

    recentlyAired.sort((a, b) => {
      const aDate = parseDate(a.episode.aired)?.getTime() ?? 0;
      const bDate = parseDate(b.episode.aired)?.getTime() ?? 0;
      return bDate - aDate;
    });

    continueWatching.sort((a, b) => {
      const aDate = parseDate(a.episode.aired)?.getTime() ?? 0;
      const bDate = parseDate(b.episode.aired)?.getTime() ?? 0;
      return bDate - aDate;
    });

    recentlyAdded.sort((a, b) => {
      const aDate = parseDate(a.episode.aired)?.getTime() ?? 0;
      const bDate = parseDate(b.episode.aired)?.getTime() ?? 0;
      return bDate - aDate;
    });

    return {
      totalShows: shows.length,
      completedCount,
      inProgressCount,
      airingToday: airingToday.slice(0, 12),
      recentlyAired: recentlyAired.slice(0, 12),
      continueWatching: continueWatching.slice(0, 12),
      recentlyAdded: recentlyAdded.slice(0, 12),
    };
  }, [shows, watchedMap, episodesByShow]);

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
