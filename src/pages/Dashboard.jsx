import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { getCachedEpisodes } from "../lib/episodesCache";
import { formatDate } from "../lib/date";

function isAired(dateStr) {
  if (!dateStr) return false;

  const airDate = new Date(dateStr);
  const now = new Date();

  return !isNaN(airDate.getTime()) && airDate <= now;
}

function isFuture(dateStr) {
  if (!dateStr) return false;

  const airDate = new Date(dateStr);
  const now = new Date();

  return !isNaN(airDate.getTime()) && airDate > now;
}

function getDisplayEpisodeCode(ep) {
  return `S${String(ep.seasonNumber).padStart(2, "0")}E${String(
    ep.number
  ).padStart(2, "0")}`;
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
        watchedLookup[row.show_tvdb_id].add(String(row.episode_id));
      }

      const episodesLookup = {};
      await Promise.all(
        (userShows || []).map(async (show) => {
          try {
            const eps = await getCachedEpisodes(show.tvdb_id);
            episodesLookup[show.tvdb_id] = (eps || []).filter(
              (ep) => ep.seasonNumber > 0
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
    const continueWatching = [];
    const readyToWatch = [];
    const airingSoon = [];

    let completedCount = 0;
    let inProgressCount = 0;

    for (const show of shows) {
      const episodes = episodesByShow[show.tvdb_id] || [];
      const watchedSet = watchedMap[show.tvdb_id] || new Set();

      const validEpisodes = episodes.filter((ep) => ep.seasonNumber > 0);
      const airedEpisodes = validEpisodes.filter((ep) => isAired(ep.aired));
      const futureEpisodes = validEpisodes.filter((ep) => isFuture(ep.aired));

      const watchedCount = validEpisodes.filter((ep) =>
        watchedSet.has(String(ep.id))
      ).length;

      if (validEpisodes.length > 0 && watchedCount === validEpisodes.length) {
        completedCount += 1;
      } else if (watchedCount > 0 || validEpisodes.length > 0) {
        inProgressCount += 1;
      }

      const nextAiredUnwatched = airedEpisodes.find(
        (ep) => !watchedSet.has(String(ep.id))
      );

      if (nextAiredUnwatched) {
        continueWatching.push({
          show,
          episode: nextAiredUnwatched,
        });

        readyToWatch.push({
          show,
          episode: nextAiredUnwatched,
        });
      }

      const nextUpcoming = futureEpisodes[0];
      if (nextUpcoming) {
        airingSoon.push({
          show,
          episode: nextUpcoming,
        });
      }
    }

    continueWatching.sort((a, b) => {
      const aDate = new Date(a.episode.aired || 0).getTime();
      const bDate = new Date(b.episode.aired || 0).getTime();
      return bDate - aDate;
    });

    readyToWatch.sort((a, b) => {
      const aDate = new Date(a.episode.aired || 0).getTime();
      const bDate = new Date(b.episode.aired || 0).getTime();
      return bDate - aDate;
    });

    airingSoon.sort((a, b) => {
      const aDate = new Date(a.episode.aired || 0).getTime();
      const bDate = new Date(b.episode.aired || 0).getTime();
      return aDate - bDate;
    });

    return {
      totalShows: shows.length,
      completedCount,
      inProgressCount,
      continueWatching: continueWatching.slice(0, 6),
      readyToWatch: readyToWatch.slice(0, 6),
      airingSoon: airingSoon.slice(0, 6),
      recentlyAdded: shows.slice(0, 6),
    };
  }, [shows, watchedMap, episodesByShow]);

  if (loading) {
    return <div className="page"><p>Loading dashboard...</p></div>;
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
            <h2>Continue Watching</h2>
            <Link to="/ready-to-watch">View all</Link>
          </div>

          {dashboardData.continueWatching.length === 0 ? (
            <p className="empty-state">No shows ready to continue.</p>
          ) : (
            <div className="dashboard-list">
              {dashboardData.continueWatching.map(({ show, episode }) => (
                <Link
                  key={`${show.tvdb_id}-${episode.id}`}
                  to={`/my-shows/${show.tvdb_id}`}
                  className="dashboard-item"
                >
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
                    <small>Aired: {formatDate(episode.aired)}</small>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="dashboard-card">
          <div className="card-header">
            <h2>Ready To Watch</h2>
            <Link to="/ready-to-watch">View all</Link>
          </div>

          {dashboardData.readyToWatch.length === 0 ? (
            <p className="empty-state">No unwatched aired episodes.</p>
          ) : (
            <div className="dashboard-list">
              {dashboardData.readyToWatch.map(({ show, episode }) => (
                <Link
                  key={`${show.tvdb_id}-${episode.id}`}
                  to={`/my-shows/${show.tvdb_id}`}
                  className="dashboard-item"
                >
                  <div className="dashboard-item-info">
                    <strong>{show.show_name}</strong>
                    <span>
                      {getDisplayEpisodeCode(episode)} - {episode.name}
                    </span>
                    <small>Aired: {formatDate(episode.aired)}</small>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="dashboard-card">
          <div className="card-header">
            <h2>Airing Soon</h2>
            <Link to="/airing-next">View all</Link>
          </div>

          {dashboardData.airingSoon.length === 0 ? (
            <p className="empty-state">No upcoming episodes found.</p>
          ) : (
            <div className="dashboard-list">
              {dashboardData.airingSoon.map(({ show, episode }) => (
                <Link
                  key={`${show.tvdb_id}-${episode.id}`}
                  to={`/my-shows/${show.tvdb_id}`}
                  className="dashboard-item"
                >
                  <div className="dashboard-item-info">
                    <strong>{show.show_name}</strong>
                    <span>
                      {getDisplayEpisodeCode(episode)} - {episode.name}
                    </span>
                    <small>Airs: {formatDate(episode.aired)}</small>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="dashboard-card">
          <div className="card-header">
            <h2>Recently Added</h2>
            <Link to="/my-shows">View all</Link>
          </div>

          {dashboardData.recentlyAdded.length === 0 ? (
            <p className="empty-state">No shows added yet.</p>
          ) : (
            <div className="dashboard-list">
              {dashboardData.recentlyAdded.map((show) => (
                <Link
                  key={show.tvdb_id}
                  to={`/my-shows/${show.tvdb_id}`}
                  className="dashboard-item"
                >
                  <img
                    src={show.poster_url}
                    alt={show.show_name}
                    className="dashboard-poster"
                  />
                  <div className="dashboard-item-info">
                    <strong>{show.show_name}</strong>
                    <small>Added: {formatDate(show.added_at)}</small>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
