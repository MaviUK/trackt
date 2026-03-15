import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { formatDate } from "../lib/date";
import { supabase } from "../lib/supabase";
import { getCachedEpisodes } from "../lib/episodesCache";
import { getShowStatus } from "../lib/showStatus";
import {
  buildWatchedSets,
  isEpisodeWatched,
} from "../lib/episodeHelpers";

export default function MyShows() {
  const [shows, setShows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState("airingnext");
  const [filterBy, setFilterBy] = useState("all");

  useEffect(() => {
    async function loadShows() {
      setLoading(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setShows([]);
        setLoading(false);
        return;
      }

      const { data: userShows, error: showsError } = await supabase
        .from("user_shows")
        .select("*")
        .eq("user_id", user.id);

      if (showsError) {
        console.error("Failed loading shows:", showsError);
        setShows([]);
        setLoading(false);
        return;
      }

      const { data: watchedRows, error: watchedError } = await supabase
        .from("watched_episodes")
        .select("show_tvdb_id, episode_id, episode_code")
        .eq("user_id", user.id);

      if (watchedError) {
        console.error("Failed loading watched rows:", watchedError);
      }

      const watchedByShow = {};
      for (const row of watchedRows || []) {
        const key = String(row.show_tvdb_id);
        if (!watchedByShow[key]) watchedByShow[key] = [];
        watchedByShow[key].push(row);
      }

      const enrichedShows = await Promise.all(
        (userShows || []).map(async (show) => {
          const showId = String(show.tvdb_id);
          const episodes = (await getCachedEpisodes(showId)) || [];

          const filteredEpisodes = episodes
            .filter((ep) => ep.seasonNumber > 0)
            .sort((a, b) => {
              if (a.seasonNumber !== b.seasonNumber) {
                return a.seasonNumber - b.seasonNumber;
              }
              return a.number - b.number;
            });

          const watchedSets = buildWatchedSets(watchedByShow[showId] || []);

          const watchedCount = filteredEpisodes.filter((ep) =>
            isEpisodeWatched(ep, watchedSets)
          ).length;

          const totalEpisodes = filteredEpisodes.length;

          const nextEpisode = filteredEpisodes.find(
            (ep) => !isEpisodeWatched(ep, watchedSets)
          );

          return {
            ...show,
            watchedCount,
            totalEpisodes,
            nextEpisode,
            status: getShowStatus(show),
          };
        })
      );

      setShows(enrichedShows);
      setLoading(false);
    }

    loadShows();
  }, []);

  async function handleRemoveShow(tvdbId) {
    const confirmed = window.confirm(
      "Remove this show from My Shows?"
    );

    if (!confirmed) return;

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    const { error } = await supabase
      .from("user_shows")
      .delete()
      .eq("user_id", user.id)
      .eq("tvdb_id", tvdbId);

    if (error) {
      console.error("Failed removing show:", error);
      alert("Failed to remove show.");
      return;
    }

    setShows((prev) => prev.filter((show) => String(show.tvdb_id) !== String(tvdbId)));
  }

  const filteredAndSortedShows = useMemo(() => {
    let result = [...shows];

    if (filterBy === "completed") {
      result = result.filter(
        (show) => show.totalEpisodes > 0 && show.watchedCount === show.totalEpisodes
      );
    } else if (filterBy === "watching") {
      result = result.filter(
        (show) => show.watchedCount > 0 && show.watchedCount < show.totalEpisodes
      );
    } else if (filterBy === "notstarted") {
      result = result.filter((show) => show.watchedCount === 0);
    }

    result.sort((a, b) => {
      if (sortBy === "alphabetical") {
        return (a.show_name || "").localeCompare(b.show_name || "");
      }

      if (sortBy === "progress") {
        const aPct =
          a.totalEpisodes > 0 ? a.watchedCount / a.totalEpisodes : 0;
        const bPct =
          b.totalEpisodes > 0 ? b.watchedCount / b.totalEpisodes : 0;
        return bPct - aPct;
      }

      if (sortBy === "airingnext") {
        const aDate = a.nextEpisode?.aired ? new Date(a.nextEpisode.aired).getTime() : Infinity;
        const bDate = b.nextEpisode?.aired ? new Date(b.nextEpisode.aired).getTime() : Infinity;
        return aDate - bDate;
      }

      return 0;
    });

    return result;
  }, [shows, sortBy, filterBy]);

  if (loading) {
    return (
      <div className="page-shell">
        <div className="card">
          <p>Loading your shows...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-shell">
      <div className="page-header">
        <h1>My Shows</h1>
      </div>

      <div className="toolbar">
        <div className="tabs">
          <button
            className={filterBy === "all" ? "active" : ""}
            onClick={() => setFilterBy("all")}
          >
            All
          </button>
          <button
            className={filterBy === "watching" ? "active" : ""}
            onClick={() => setFilterBy("watching")}
          >
            Watching
          </button>
          <button
            className={filterBy === "completed" ? "active" : ""}
            onClick={() => setFilterBy("completed")}
          >
            Completed
          </button>
          <button
            className={filterBy === "notstarted" ? "active" : ""}
            onClick={() => setFilterBy("notstarted")}
          >
            Not Started
          </button>
        </div>

        <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
          <option value="airingnext">Airing Next</option>
          <option value="alphabetical">Alphabetical</option>
          <option value="progress">Progress</option>
        </select>
      </div>

      <div className="shows-list">
        {filteredAndSortedShows.length === 0 ? (
          <div className="card">
            <p>No shows found.</p>
          </div>
        ) : (
          filteredAndSortedShows.map((show) => {
            const completed =
              show.totalEpisodes > 0 && show.watchedCount === show.totalEpisodes;

            const progressPct =
              show.totalEpisodes > 0
                ? Math.round((show.watchedCount / show.totalEpisodes) * 100)
                : 0;

            return (
              <div key={show.tvdb_id} className="show-card">
                <button
                  className="remove-btn"
                  onClick={() => handleRemoveShow(show.tvdb_id)}
                >
                  Remove
                </button>

                <Link to={`/my-shows/${show.tvdb_id}`} className="show-link">
                  <div className="show-card-inner">
                    <img
                      src={show.poster_url}
                      alt={show.show_name}
                      className="show-poster"
                    />

                    <div className="show-main">
                      <div className="show-title-row">
                        <h2>{show.show_name}</h2>
                        {show.status ? (
                          <span className={`status-pill ${show.status.toLowerCase()}`}>
                            {show.status}
                          </span>
                        ) : null}
                      </div>

                      {show.first_aired ? (
                        <div className="show-meta">
                          First aired: {formatDate(show.first_aired)}
                        </div>
                      ) : null}

                      <div className="show-progress-text">
                        {show.watchedCount} / {show.totalEpisodes} watched
                      </div>

                      {completed ? (
                        <div className="completed-label">Completed</div>
                      ) : show.nextEpisode?.aired ? (
                        <div className="next-episode-label">
                          Next episode: {formatDate(show.nextEpisode.aired)}
                        </div>
                      ) : null}

                      <div className="progress-bar">
                        <div
                          className={`progress-fill ${completed ? "completed" : ""}`}
                          style={{ width: `${progressPct}%` }}
                        />
                      </div>

                      {show.overview ? (
                        <p className="show-overview">{show.overview}</p>
                      ) : null}
                    </div>
                  </div>
                </Link>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
