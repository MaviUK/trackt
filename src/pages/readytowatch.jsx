import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { getCachedEpisodes } from "../lib/episodesCache";
import { formatDate } from "../lib/date";
import "./ReadyToWatchPage.css";

function isAired(dateString) {
  if (!dateString) return false;
  const airDate = new Date(dateString);
  const now = new Date();
  return !Number.isNaN(airDate.getTime()) && airDate <= now;
}

function getEpisodeCode(ep) {
  return `S${String(ep.seasonNumber).padStart(2, "0")}E${String(
    ep.number
  ).padStart(2, "0")}`;
}

export default function ReadyToWatchPage() {
  const [loading, setLoading] = useState(true);
  const [shows, setShows] = useState([]);
  const [episodesByShow, setEpisodesByShow] = useState({});
  const [watchedMap, setWatchedMap] = useState({});
  const [expandedShows, setExpandedShows] = useState({});

  useEffect(() => {
    async function loadData() {
      setLoading(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setShows([]);
        setEpisodesByShow({});
        setWatchedMap({});
        setLoading(false);
        return;
      }

      const { data: userShows, error: showsError } = await supabase
        .from("user_shows")
        .select("*")
        .eq("user_id", user.id)
        .order("show_name", { ascending: true });

      if (showsError) {
        console.error("Failed to load user shows:", showsError);
        setLoading(false);
        return;
      }

      const showIds = (userShows || []).map((show) => show.tvdb_id);

      let watchedRows = [];
      if (showIds.length > 0) {
        const { data: watchedData, error: watchedError } = await supabase
          .from("watched_episodes")
          .select("show_tvdb_id, episode_id")
          .eq("user_id", user.id)
          .in("show_tvdb_id", showIds);

        if (watchedError) {
          console.error("Failed to load watched episodes:", watchedError);
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

      const episodeLookup = {};
      await Promise.all(
        (userShows || []).map(async (show) => {
          try {
            const episodes = await getCachedEpisodes(show.tvdb_id);
            episodeLookup[show.tvdb_id] = (episodes || []).filter(
              (ep) => ep.seasonNumber > 0
            );
          } catch (err) {
            console.error(`Failed to load episodes for ${show.show_name}:`, err);
            episodeLookup[show.tvdb_id] = [];
          }
        })
      );

      setShows(userShows || []);
      setEpisodesByShow(episodeLookup);
      setWatchedMap(watchedLookup);
      setLoading(false);
    }

    loadData();
  }, []);

  const readyGroups = useMemo(() => {
    return shows
      .map((show) => {
        const episodes = episodesByShow[show.tvdb_id] || [];
        const watchedSet = watchedMap[show.tvdb_id] || new Set();

        const readyEpisodes = episodes
          .filter((ep) => isAired(ep.aired))
          .filter((ep) => !watchedSet.has(String(ep.id)))
          .sort((a, b) => new Date(a.aired) - new Date(b.aired));

        return {
          show,
          episodes: readyEpisodes,
          readyCount: readyEpisodes.length,
        };
      })
      .filter((group) => group.readyCount > 0)
      .sort((a, b) => b.readyCount - a.readyCount);
  }, [shows, episodesByShow, watchedMap]);

  function toggleExpanded(tvdbId) {
    setExpandedShows((prev) => ({
      ...prev,
      [tvdbId]: !prev[tvdbId],
    }));
  }

  async function handleMarkWatched(showTvdbId, episodeId) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    const { error } = await supabase.from("watched_episodes").insert({
      user_id: user.id,
      show_tvdb_id: showTvdbId,
      episode_id: String(episodeId),
    });

    if (error) {
      console.error("Failed to mark watched:", error);
      return;
    }

    setWatchedMap((prev) => {
      const next = { ...prev };
      const current = new Set(next[showTvdbId] || []);
      current.add(String(episodeId));
      next[showTvdbId] = current;
      return next;
    });
  }

  if (loading) {
    return (
      <div className="rtw-page">
        <div className="rtw-shell">
          <div className="rtw-header">
            <h1>Ready to Watch</h1>
            <p>Loading your unwatched aired episodes...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rtw-page">
      <div className="rtw-shell">
        <div className="rtw-header">
          <h1>Ready to Watch</h1>
          <p>Aired episodes you have not watched yet.</p>
        </div>

        {readyGroups.length === 0 ? (
          <div className="rtw-empty">
            <p>No episodes ready to watch right now.</p>
          </div>
        ) : (
          <div className="rtw-groups">
            {readyGroups.map(({ show, episodes, readyCount }) => {
              const isExpanded = expandedShows[show.tvdb_id] ?? true;

              return (
                <section key={show.tvdb_id} className="rtw-group-card">
                  <div className="rtw-show-row">
                    <Link
                      to={`/my-shows/${show.tvdb_id}`}
                      className="rtw-show-link"
                    >
                      <img
                        src={show.poster_url}
                        alt={show.show_name}
                        className="rtw-poster"
                      />
                    </Link>

                    <div className="rtw-show-meta">
                      <Link
                        to={`/my-shows/${show.tvdb_id}`}
                        className="rtw-show-title-link"
                      >
                        <h2 className="rtw-show-title">{show.show_name}</h2>
                      </Link>

                      <div className="rtw-show-count">
                        {readyCount} {readyCount === 1 ? "episode" : "episodes"} ready
                        to watch
                      </div>

                      <button
                        type="button"
                        className="rtw-toggle-btn"
                        onClick={() => toggleExpanded(show.tvdb_id)}
                      >
                        {isExpanded ? "Hide episodes ▲" : "Show episodes ▼"}
                      </button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="rtw-episode-list">
                      {episodes.map((episode) => (
                        <div
                          key={`${show.tvdb_id}-${episode.id}`}
                          className="rtw-episode-card"
                        >
                          <div className="rtw-episode-title">
                            {getEpisodeCode(episode)} - {episode.name}
                          </div>

                          <div className="rtw-episode-date">
                            Air date: {formatDate(episode.aired)}
                          </div>

                          {episode.overview ? (
                            <p className="rtw-episode-overview">
                              {episode.overview}
                            </p>
                          ) : null}

                          <div className="rtw-actions">
                            <button
                              type="button"
                              className="rtw-mark-btn"
                              onClick={() =>
                                handleMarkWatched(show.tvdb_id, episode.id)
                              }
                            >
                              Mark Watched
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
