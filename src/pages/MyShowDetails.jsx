import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { getCachedEpisodes } from "../lib/episodesCache";
import { formatDate } from "../lib/date";
import "./MyShowDetails.css";

function getEpisodeCode(ep) {
  return `S${String(ep.seasonNumber).padStart(2, "0")}E${String(
    ep.number
  ).padStart(2, "0")}`;
}

function isFuture(dateString) {
  if (!dateString) return false;
  const d = new Date(dateString);
  return !Number.isNaN(d.getTime()) && d > new Date();
}

function getDaysUntil(dateString) {
  if (!dateString) return null;

  const now = new Date();
  const target = new Date(dateString);

  if (Number.isNaN(target.getTime())) return null;

  const nowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const targetStart = new Date(
    target.getFullYear(),
    target.getMonth(),
    target.getDate()
  );

  const diffMs = targetStart.getTime() - nowStart.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

export default function MyShowDetails() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const targetEpisodeId = searchParams.get("episode");

  const [loading, setLoading] = useState(true);
  const [show, setShow] = useState(null);
  const [episodes, setEpisodes] = useState([]);
  const [watchedSet, setWatchedSet] = useState(new Set());
  const [expandedSeasons, setExpandedSeasons] = useState({});

  useEffect(() => {
    async function loadShow() {
      setLoading(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setLoading(false);
        return;
      }

      const { data: showData, error: showError } = await supabase
        .from("user_shows")
        .select("*")
        .eq("user_id", user.id)
        .eq("tvdb_id", id)
        .single();

      if (showError) {
        console.error("Failed loading show:", showError);
        setLoading(false);
        return;
      }

      const eps = await getCachedEpisodes(id);
      const filteredEpisodes = (eps || [])
        .filter((ep) => ep.seasonNumber > 0)
        .sort((a, b) => {
          if (a.seasonNumber !== b.seasonNumber) {
            return a.seasonNumber - b.seasonNumber;
          }
          return a.number - b.number;
        });

      const { data: watchedRows, error: watchedError } = await supabase
        .from("watched_episodes")
        .select("episode_id")
        .eq("user_id", user.id)
        .eq("show_tvdb_id", id);

      if (watchedError) {
        console.error("Failed loading watched episodes:", watchedError);
      }

      const watchedIds = new Set(
        (watchedRows || []).map((r) => String(r.episode_id))
      );

      const seasonMap = {};
      filteredEpisodes.forEach((ep) => {
        if (!(ep.seasonNumber in seasonMap)) {
          seasonMap[ep.seasonNumber] = false;
        }
      });

      if (targetEpisodeId) {
        const targetEpisode = filteredEpisodes.find(
          (ep) => String(ep.id) === String(targetEpisodeId)
        );

        if (targetEpisode) {
          seasonMap[targetEpisode.seasonNumber] = true;
        }
      }

      setShow(showData);
      setEpisodes(filteredEpisodes);
      setWatchedSet(watchedIds);
      setExpandedSeasons(seasonMap);
      setLoading(false);
    }

    loadShow();
  }, [id, targetEpisodeId]);

  useEffect(() => {
    if (!targetEpisodeId || loading) return;

    const timer = setTimeout(() => {
      const el = document.getElementById(`episode-${targetEpisodeId}`);
      if (!el) return;

      el.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });

      el.classList.add("episode-highlight");

      const removeTimer = setTimeout(() => {
        el.classList.remove("episode-highlight");
      }, 2500);

      return () => clearTimeout(removeTimer);
    }, 300);

    return () => clearTimeout(timer);
  }, [episodes, expandedSeasons, targetEpisodeId, loading]);

  const groupedSeasons = useMemo(() => {
    const grouped = {};

    for (const ep of episodes) {
      if (!grouped[ep.seasonNumber]) grouped[ep.seasonNumber] = [];
      grouped[ep.seasonNumber].push(ep);
    }

    return Object.entries(grouped)
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([seasonNumber, seasonEpisodes]) => {
        const watchedCount = seasonEpisodes.filter((ep) =>
          watchedSet.has(String(ep.id))
        ).length;

        return {
          seasonNumber: Number(seasonNumber),
          episodes: seasonEpisodes,
          watchedCount,
          totalCount: seasonEpisodes.length,
          complete:
            seasonEpisodes.length > 0 && watchedCount === seasonEpisodes.length,
        };
      });
  }, [episodes, watchedSet]);

  const stats = useMemo(() => {
    const total = episodes.length;
    const watched = episodes.filter((ep) =>
      watchedSet.has(String(ep.id))
    ).length;
    const pct = total > 0 ? Math.round((watched / total) * 100) : 0;

    const nextEpisode = episodes.find(
      (ep) => !watchedSet.has(String(ep.id)) && isFuture(ep.aired)
    );

    return {
      total,
      watched,
      pct,
      nextEpisode,
    };
  }, [episodes, watchedSet]);

  function toggleSeason(seasonNumber) {
    setExpandedSeasons((prev) => ({
      ...prev,
      [seasonNumber]: !prev[seasonNumber],
    }));
  }

async function handleMarkWatched(episodeId) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return;

  try {
    const showTvdbId = Number(id);
    const episodeIdStr = Number(episodeId);

    const { data: existing, error: existingError } = await supabase
      .from("watched_episodes")
      .select("episode_id")
      .eq("user_id", user.id)
      .eq("show_tvdb_id", showTvdbId)
      .eq("episode_id", episodeIdStr)
      .maybeSingle();

    if (existingError) {
      throw existingError;
    }

    if (!existing) {
      const { error: insertError } = await supabase
        .from("watched_episodes")
        .insert({
          user_id: user.id,
          show_tvdb_id: showTvdbId,
          episode_id: episodeIdStr,
        });

      if (insertError) {
        throw insertError;
      }
    }

    setWatchedSet((prev) => {
      const next = new Set(prev);
      next.add(episodeIdStr);
      return next;
    });
  } catch (error) {
    console.error("Failed marking watched:", error);
    alert(error.message || "Failed marking watched");
  }
}

async function handleWatchUpToHere(targetEpisode) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return;

  try {
    const showTvdbId = String(id);

    const episodesToMark = episodes.filter((ep) => {
      if (ep.seasonNumber < targetEpisode.seasonNumber) return true;
      if (
        ep.seasonNumber === targetEpisode.seasonNumber &&
        ep.number <= targetEpisode.number
      ) {
        return true;
      }
      return false;
    });

    const episodeIdsToMark = episodesToMark.map((ep) => String(ep.id));

    const { data: existingRows, error: existingError } = await supabase
      .from("watched_episodes")
      .select("episode_id")
      .eq("user_id", user.id)
      .eq("show_tvdb_id", showTvdbId)
      .in("episode_id", episodeIdsToMark);

    if (existingError) {
      throw existingError;
    }

    const existingIds = new Set(
      (existingRows || []).map((row) => String(row.episode_id))
    );

    const rowsToInsert = episodesToMark
      .filter((ep) => !existingIds.has(String(ep.id)))
      .map((ep) => ({
        user_id: user.id,
        show_tvdb_id: showTvdbId,
        episode_id: String(ep.id),
      }));

    if (rowsToInsert.length > 0) {
      const { error: insertError } = await supabase
        .from("watched_episodes")
        .insert(rowsToInsert);

      if (insertError) {
        throw insertError;
      }
    }

    setWatchedSet((prev) => {
      const next = new Set(prev);
      episodesToMark.forEach((ep) => next.add(String(ep.id)));
      return next;
    });
  } catch (error) {
    console.error("Failed watch up to here:", error);
    alert(error.message || "Failed watch up to here");
  }
}

  async function handleWatchUpToHere(targetEpisode) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    const episodesToMark = episodes.filter((ep) => {
      if (ep.seasonNumber < targetEpisode.seasonNumber) return true;
      if (
        ep.seasonNumber === targetEpisode.seasonNumber &&
        ep.number <= targetEpisode.number
      ) {
        return true;
      }
      return false;
    });

    const rows = episodesToMark.map((ep) => ({
      user_id: user.id,
      show_tvdb_id: id,
      episode_id: String(ep.id),
    }));

    const { error } = await supabase
      .from("watched_episodes")
      .upsert(rows, { onConflict: "user_id,show_tvdb_id,episode_id" });

    if (error) {
      console.error("Failed watch up to here:", error);
      return;
    }

    setWatchedSet((prev) => {
      const next = new Set(prev);
      episodesToMark.forEach((ep) => next.add(String(ep.id)));
      return next;
    });
  }

  if (loading) {
    return (
      <div className="msd-page">
        <div className="msd-shell">
          <div className="msd-loading">Loading show...</div>
        </div>
      </div>
    );
  }

  if (!show) {
    return (
      <div className="msd-page">
        <div className="msd-shell">
          <div className="msd-empty">
            <p>Show not found.</p>
            <Link to="/my-shows" className="msd-back-link">
              Back to My Shows
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="msd-page">
      <div className="msd-shell">
        <Link to="/my-shows" className="msd-back-link">
          ← Back to My Shows
        </Link>

        <section className="msd-hero">
          <img
            src={show.poster_url}
            alt={show.show_name}
            className="msd-poster"
          />

          <div className="msd-hero-main">
            <h1 className="msd-title">{show.show_name}</h1>

            {show.overview ? (
              <p className="msd-overview">{show.overview}</p>
            ) : null}

            <div className="msd-meta">
              {show.first_aired ? (
                <div>First aired: {formatDate(show.first_aired)}</div>
              ) : null}

              {stats.nextEpisode ? (
                <div>
                  Next episode: {formatDate(stats.nextEpisode.aired)} (
                  {getDaysUntil(stats.nextEpisode.aired) === 0
                    ? "TODAY"
                    : getDaysUntil(stats.nextEpisode.aired) === 1
                    ? "IN 1 DAY"
                    : `IN ${getDaysUntil(stats.nextEpisode.aired)} DAYS`}
                  )
                </div>
              ) : null}
            </div>

            <div className="msd-stats-row">
              <div className="msd-stat-box">
                <span className="msd-stat-label">Watched</span>
                <strong className="msd-stat-value">{stats.watched}</strong>
              </div>
              <div className="msd-stat-box">
                <span className="msd-stat-label">Total</span>
                <strong className="msd-stat-value">{stats.total}</strong>
              </div>
              <div className="msd-stat-box">
                <span className="msd-stat-label">Progress</span>
                <strong className="msd-stat-value">{stats.pct}%</strong>
              </div>
            </div>

            <div className="msd-progress">
              <div
                className="msd-progress-fill"
                style={{ width: `${stats.pct}%` }}
              />
            </div>
          </div>
        </section>

        <section className="msd-episodes-section">
          <h2 className="msd-section-title">Episodes</h2>

          <div className="msd-seasons">
            {groupedSeasons.map((season) => (
              <section
                key={season.seasonNumber}
                className={`msd-season-card ${
                  season.complete ? "msd-season-complete" : ""
                }`}
              >
                <button
                  type="button"
                  className="msd-season-toggle"
                  onClick={() => toggleSeason(season.seasonNumber)}
                >
                  <div>
                    <div className="msd-season-title">
                      Season {season.seasonNumber}
                    </div>
                    <div className="msd-season-subtitle">
                      {season.watchedCount}/{season.totalCount} watched
                    </div>
                  </div>

                  <div className="msd-season-toggle-right">
                    {season.complete ? (
                      <span className="msd-season-badge">Completed</span>
                    ) : null}
                    <span className="msd-season-chevron">
                      {expandedSeasons[season.seasonNumber] ? "▲" : "▼"}
                    </span>
                  </div>
                </button>

                {expandedSeasons[season.seasonNumber] && (
                  <div className="msd-episode-list">
                    {season.episodes.map((ep) => {
                      const watched = watchedSet.has(String(ep.id));

                      return (
                        <article
                          id={`episode-${ep.id}`}
                          key={ep.id}
                          className={`msd-episode-card ${
                            watched ? "msd-episode-watched" : ""
                          }`}
                        >
                          <div className="msd-episode-top">
                            <div>
                              <h3 className="msd-episode-title">
                                {getEpisodeCode(ep)} - {ep.name}
                              </h3>
                              <div className="msd-episode-date">
                                Air date: {formatDate(ep.aired)}
                              </div>
                            </div>

                            {watched ? (
                              <span className="msd-watched-pill">Watched</span>
                            ) : null}
                          </div>

                          {ep.overview ? (
                            <p className="msd-episode-overview">{ep.overview}</p>
                          ) : null}

                          <div className="msd-actions">
                            <button
                              type="button"
                              className={`msd-btn ${
                                watched ? "msd-btn-success" : "msd-btn-primary"
                              }`}
                              onClick={() => handleMarkWatched(ep.id)}
                              disabled={watched}
                            >
                              {watched ? "Watched" : "Mark Watched"}
                            </button>

                            <button
                              type="button"
                              className="msd-btn msd-btn-secondary"
                              onClick={() => handleWatchUpToHere(ep)}
                            >
                              Watch up to here
                            </button>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
