import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
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

function getEpisodeCodeKey(ep) {
  return `S${String(ep.seasonNumber).padStart(2, "0")}E${String(
    ep.number
  ).padStart(2, "0")}`;
}

function createEmptyWatchedLookup() {
  return {
    episodeRowIds: new Set(),
    episodeCodes: new Set(),
    seasonEpisodeKeys: new Set(),
  };
}

function isEpisodeWatched(ep, watchedLookup) {
  const byRowId =
    ep.id != null && watchedLookup.episodeRowIds.has(String(ep.id).trim());

  const byCode = watchedLookup.episodeCodes.has(getEpisodeCodeKey(ep));

  const bySeasonEpisode = watchedLookup.seasonEpisodeKeys.has(
    `${ep.seasonNumber}-${ep.number}`
  );

  return byRowId || byCode || bySeasonEpisode;
}

export default function ReadyToWatchPage() {
  const [loading, setLoading] = useState(true);
  const [shows, setShows] = useState([]);
  const [episodesByShow, setEpisodesByShow] = useState({});
  const [watchedMap, setWatchedMap] = useState({});
  const [expandedShows, setExpandedShows] = useState({});

  async function fetchWatchedLookup(userId, showId) {
    const { data: watchedRows, error: watchedError } = await supabase
      .from("watched_episodes")
      .select(
        "episode_row_id, season_number, episode_number, episode_code"
      )
      .eq("user_id", userId)
      .eq("show_tvdb_id", showId);

    if (watchedError) {
      throw watchedError;
    }

    const lookup = createEmptyWatchedLookup();

    for (const row of watchedRows || []) {
      if (row.episode_row_id != null) {
        lookup.episodeRowIds.add(String(row.episode_row_id).trim());
      }

      if (row.episode_code) {
        lookup.episodeCodes.add(String(row.episode_code).trim());
      }

      if (row.season_number != null && row.episode_number != null) {
        lookup.seasonEpisodeKeys.add(
          `${row.season_number}-${row.episode_number}`
        );
      }
    }

    return lookup;
  }

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

      const safeShows = userShows || [];
      const showIds = safeShows.map((show) => String(show.tvdb_id));

      let watchedRows = [];
      if (showIds.length > 0) {
        const { data: watchedData, error: watchedError } = await supabase
          .from("watched_episodes")
          .select(
            "show_tvdb_id, episode_row_id, season_number, episode_number, episode_code"
          )
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
        const showId = String(row.show_tvdb_id);

        if (!watchedLookup[showId]) {
          watchedLookup[showId] = createEmptyWatchedLookup();
        }

        if (row.episode_row_id != null) {
          watchedLookup[showId].episodeRowIds.add(
            String(row.episode_row_id).trim()
          );
        }

        if (row.episode_code) {
          watchedLookup[showId].episodeCodes.add(String(row.episode_code).trim());
        }

        if (row.season_number != null && row.episode_number != null) {
          watchedLookup[showId].seasonEpisodeKeys.add(
            `${row.season_number}-${row.episode_number}`
          );
        }
      }

      const episodeLookup = {};
      if (showIds.length > 0) {
        const { data: episodeRows, error: episodesError } = await supabase
          .from("episodes")
          .select("*")
          .in("show_tvdb_id", showIds)
          .order("season_number", { ascending: true })
          .order("episode_number", { ascending: true });

        if (episodesError) {
          console.error("Failed to load episodes:", episodesError);
        } else {
          for (const row of episodeRows || []) {
            const showId = String(row.show_tvdb_id);

            if (!episodeLookup[showId]) {
              episodeLookup[showId] = [];
            }

            episodeLookup[showId].push({
              id: row.id,
              show_tvdb_id: row.show_tvdb_id,
              seasonNumber: row.season_number,
              number: row.episode_number,
              name: row.episode_name,
              aired: row.aired,
              overview: row.overview,
              image: row.image_url,
              episodeCode: row.episode_code,
            });
          }
        }
      }

      setShows(safeShows);
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
        const watchedLookup = watchedMap[showId] || createEmptyWatchedLookup();

        const readyEpisodes = episodes
          .filter((ep) => isAired(ep.aired))
          .filter((ep) => !isEpisodeWatched(ep, watchedLookup))
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
      .filter((group) => group.readyCount > 0)
      .sort((a, b) => b.readyCount - a.readyCount);
  }, [shows, episodesByShow, watchedMap]);

  function toggleExpanded(tvdbId) {
    setExpandedShows((prev) => ({
      ...prev,
      [tvdbId]: !prev[tvdbId],
    }));
  }

  async function handleMarkWatched(showTvdbId, ep) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    try {
      const showId = String(showTvdbId);
      const episodeCode = getEpisodeCodeKey(ep);

      const payload = {
        user_id: user.id,
        show_tvdb_id: showId,
        episode_row_id: ep.id,
        season_number: ep.seasonNumber,
        episode_number: ep.number,
        episode_code: episodeCode,
      };

      const { error: upsertError } = await supabase
        .from("watched_episodes")
        .upsert(payload, {
          onConflict: "user_id,show_tvdb_id,season_number,episode_number",
        });

      if (upsertError) throw upsertError;

      const freshWatchedLookup = await fetchWatchedLookup(user.id, showId);

      setWatchedMap((prev) => {
        const next = { ...prev };
        next[showId] = freshWatchedLookup;
        return next;
      });
    } catch (error) {
      console.error("Failed to mark watched:", error);
      alert(error.message || "Failed to mark watched");
    }
  }

  async function handleWatchUpToHere(showTvdbId, targetEpisode) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    try {
      const showId = String(showTvdbId);

      const allEpisodes = (episodesByShow[showId] || [])
        .filter((ep) => ep.seasonNumber > 0)
        .sort((a, b) => {
          if (a.seasonNumber !== b.seasonNumber) {
            return a.seasonNumber - b.seasonNumber;
          }
          return a.number - b.number;
        });

      const airedEpisodes = allEpisodes.filter((ep) => isAired(ep.aired));

      const episodesToBeWatched = airedEpisodes.filter((ep) => {
        if (ep.seasonNumber < targetEpisode.seasonNumber) return true;
        if (
          ep.seasonNumber === targetEpisode.seasonNumber &&
          ep.number <= targetEpisode.number
        ) {
          return true;
        }
        return false;
      });

      const { error: deleteError } = await supabase
        .from("watched_episodes")
        .delete()
        .eq("user_id", user.id)
        .eq("show_tvdb_id", showId);

      if (deleteError) throw deleteError;

      const rowsToUpsert = episodesToBeWatched.map((ep) => ({
        user_id: user.id,
        show_tvdb_id: showId,
        episode_row_id: ep.id,
        season_number: ep.seasonNumber,
        episode_number: ep.number,
        episode_code: getEpisodeCodeKey(ep),
      }));

      if (rowsToUpsert.length > 0) {
        const { error: upsertError } = await supabase
          .from("watched_episodes")
          .upsert(rowsToUpsert, {
            onConflict: "user_id,show_tvdb_id,season_number,episode_number",
          });

        if (upsertError) throw upsertError;
      }

      const freshWatchedLookup = await fetchWatchedLookup(user.id, showId);

      setWatchedMap((prev) => {
        const next = { ...prev };
        next[showId] = freshWatchedLookup;
        return next;
      });
    } catch (error) {
      console.error("Failed watch up to here:", error);
      alert(error.message || "Failed watch up to here");
    }
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

                          {episode.overview ? (
                            <p className="rtw-episode-overview">
                              {episode.overview}
                            </p>
                          ) : null}

                          <div className="rtw-actions">
                            <button
                              type="button"
                              className="rtw-mark-btn"
                              onClick={() => handleMarkWatched(showId, episode)}
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
