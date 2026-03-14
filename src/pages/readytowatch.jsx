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

      const showIds = (userShows || []).map((show) => String(show.tvdb_id));

      let watchedRows = [];
      if (showIds.length > 0) {
        const { data: watchedData } = await supabase
          .from("watched_episodes")
          .select("show_tvdb_id, episode_id")
          .eq("user_id", user.id)
          .in("show_tvdb_id", showIds);

        watchedRows = watchedData || [];
      }

      const watchedLookup = {};
      for (const row of watchedRows) {
        const showId = String(row.show_tvdb_id);
        if (!watchedLookup[showId]) watchedLookup[showId] = new Set();
        watchedLookup[showId].add(String(row.episode_id));
      }

      const episodeLookup = {};

      await Promise.all(
        (userShows || []).map(async (show) => {
          const eps = await getCachedEpisodes(show.tvdb_id);
          episodeLookup[String(show.tvdb_id)] = (eps || []).filter(
            (ep) => ep.seasonNumber > 0
          );
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
        const showId = String(show.tvdb_id);
        const episodes = episodesByShow[showId] || [];
        const watchedSet = watchedMap[showId] || new Set();

        const readyEpisodes = episodes
          .filter((ep) => isAired(ep.aired))
          .filter((ep) => !watchedSet.has(String(ep.id)))
          .sort((a, b) => {
            if (a.seasonNumber !== b.seasonNumber) {
              return a.seasonNumber - b.seasonNumber;
            }
            return a.number - b.number;
          });

        return {
          show,
          episodes: readyEpisodes,
          readyCount: readyEpisodes.length,
        };
      })
      .filter((g) => g.readyCount > 0)
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

    const showId = String(showTvdbId);
    const episodeIdStr = String(episodeId);

    await supabase.from("watched_episodes").upsert(
      {
        user_id: user.id,
        show_tvdb_id: showId,
        episode_id: episodeIdStr,
      },
      { onConflict: "user_id,show_tvdb_id,episode_id" }
    );

    setWatchedMap((prev) => {
      const next = { ...prev };
      const set = new Set(next[showId] || []);
      set.add(episodeIdStr);
      next[showId] = set;
      return next;
    });
  }

  async function handleWatchUpToHere(showTvdbId, targetEpisode) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    const showId = String(showTvdbId);

    const allEpisodes = (episodesByShow[showId] || [])
      .filter((ep) => ep.seasonNumber > 0)
      .sort((a, b) => {
        if (a.seasonNumber !== b.seasonNumber)
          return a.seasonNumber - b.seasonNumber;
        return a.number - b.number;
      });

    const airedEpisodes = allEpisodes.filter((ep) => isAired(ep.aired));

    const episodesToWatch = airedEpisodes.filter((ep) => {
      if (ep.seasonNumber < targetEpisode.seasonNumber) return true;
      if (
        ep.seasonNumber === targetEpisode.seasonNumber &&
        ep.number <= targetEpisode.number
      )
        return true;
      return false;
    });

    const newIds = new Set(episodesToWatch.map((ep) => String(ep.id)));

    const allIds = airedEpisodes.map((ep) => String(ep.id));

    const idsToDelete = allIds.filter((id) => !newIds.has(id));

    if (idsToDelete.length) {
      await supabase
        .from("watched_episodes")
        .delete()
        .eq("user_id", user.id)
        .eq("show_tvdb_id", showId)
        .in("episode_id", idsToDelete);
    }

    const rows = episodesToWatch.map((ep) => ({
      user_id: user.id,
      show_tvdb_id: showId,
      episode_id: String(ep.id),
    }));

    if (rows.length) {
      await supabase
        .from("watched_episodes")
        .upsert(rows, { onConflict: "user_id,show_tvdb_id,episode_id" });
    }

    setWatchedMap((prev) => {
      const next = { ...prev };
      next[showId] = newIds;
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
              const showId = String(show.tvdb_id);
              const isExpanded = expandedShows[showId] ?? true;

              return (
                <section key={showId} className="rtw-group-card">
                  <div className="rtw-show-row">
                    <Link
                      to={`/my-shows/${showId}`}
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
                        to={`/my-shows/${showId}`}
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
                        onClick={() => toggleExpanded(showId)}
                      >
                        {isExpanded ? "Hide episodes ▲" : "Show episodes ▼"}
                      </button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="rtw-episode-list">
                      {episodes.map((episode) => (
                        <div
                          key={`${showId}-${episode.id}`}
                          className="rtw-episode-card"
                        >
                          <div className="rtw-episode-title">
                            {getEpisodeCode(episode)} - {episode.name}
                          </div>

                          <div className="rtw-episode-date">
                            Air date: {formatDate(episode.aired)}
                          </div>

                          {episode.overview && (
                            <p className="rtw-episode-overview">
                              {episode.overview}
                            </p>
                          )}

                          <div className="rtw-actions">
                            <button
                              type="button"
                              className="rtw-mark-btn"
                              onClick={() =>
                                handleMarkWatched(showId, episode.id)
                              }
                            >
                              Mark Watched
                            </button>

                            <button
                              type="button"
                              className="rtw-secondary-btn"
                              onClick={() =>
                                handleWatchUpToHere(showId, episode)
                              }
                            >
                              Watch up to here
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
