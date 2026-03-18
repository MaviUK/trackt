import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { formatDate } from "../lib/date";
import "./MyShowDetails.css";

function makeEpisodeCode(ep) {
  if (!ep?.seasonNumber || !ep?.number) return "Episode";
  return `S${String(ep.seasonNumber).padStart(2, "0")}E${String(
    ep.number
  ).padStart(2, "0")}`;
}

function buildWatchedEpisodeIdSet(rows) {
  return new Set(
    (rows || [])
      .map((row) => row.episode_id)
      .filter(Boolean)
      .map(String)
  );
}

function isEpisodeWatched(ep, watchedEpisodeIds) {
  if (!ep?.id) return false;
  return watchedEpisodeIds.has(String(ep.id));
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

  return Math.ceil((targetStart.getTime() - nowStart.getTime()) / 86400000);
}

async function fetchWatchedRows(userId) {
  const { data, error } = await supabase
    .from("watched_episodes")
    .select("episode_id")
    .eq("user_id", userId);

  if (error) throw error;
  return data || [];
}

export default function MyShowDetails() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const targetEpisodeId = searchParams.get("episode");

  const [loading, setLoading] = useState(true);
  const [show, setShow] = useState(null);
  const [episodes, setEpisodes] = useState([]);
  const [watchedRows, setWatchedRows] = useState([]);
  const [expandedSeasons, setExpandedSeasons] = useState({});

  const watchedEpisodeIds = useMemo(
    () => buildWatchedEpisodeIdSet(watchedRows),
    [watchedRows]
  );

  useEffect(() => {
    async function loadShow() {
      setLoading(true);

      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          setShow(null);
          setEpisodes([]);
          setWatchedRows([]);
          return;
        }

        const tvdbId = Number(id);

        const { data: userShowRow, error: userShowError } = await supabase
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
          .eq("shows.tvdb_id", tvdbId)
          .single();

        if (userShowError) throw userShowError;
        if (!userShowRow?.shows) {
          setShow(null);
          setEpisodes([]);
          setWatchedRows([]);
          return;
        }

        const showRecord = userShowRow.shows;
        const showId = showRecord.id;

        const [{ data: episodeRows, error: episodeError }, watchedRowsData] =
          await Promise.all([
            supabase
              .from("episodes")
              .select(`
                id,
                tvdb_id,
                show_id,
                season_number,
                episode_number,
                episode_code,
                name,
                overview,
                aired_date,
                image_url
              `)
              .eq("show_id", showId)
              .order("season_number", { ascending: true })
              .order("episode_number", { ascending: true }),
            fetchWatchedRows(user.id),
          ]);

        if (episodeError) throw episodeError;

        const normalizedEpisodes = (episodeRows || []).map((row) => ({
          id: row.id,
          tvdb_episode_id: row.tvdb_id,
          seasonNumber: row.season_number,
          number: row.episode_number,
          aired: row.aired_date,
          airDate: row.aired_date,
          name: row.name || "Untitled episode",
          overview: row.overview || "",
          image: row.image_url || null,
          episode_code: row.episode_code,
        }));

        const seasonMap = {};
        normalizedEpisodes.forEach((ep) => {
          if (!(ep.seasonNumber in seasonMap)) {
            seasonMap[ep.seasonNumber] = false;
          }
        });

        if (targetEpisodeId) {
          const targetEpisode = normalizedEpisodes.find(
            (ep) => String(ep.id) === String(targetEpisodeId)
          );
          if (targetEpisode) {
            seasonMap[targetEpisode.seasonNumber] = true;
          }
        }

        setShow({
          id: showRecord.id,
          tvdb_id: showRecord.tvdb_id,
          show_name: showRecord.name || "Unknown title",
          overview: showRecord.overview || "",
          poster_url: showRecord.poster_url || null,
          first_aired: showRecord.first_aired || null,
          status: showRecord.status || null,
          watch_status: userShowRow.watch_status || "watching",
          added_at: userShowRow.added_at,
          created_at: userShowRow.created_at,
        });

        setEpisodes(normalizedEpisodes);
        setWatchedRows(watchedRowsData);
        setExpandedSeasons(seasonMap);
      } catch (error) {
        console.error("Failed loading show:", error);
        setShow(null);
        setEpisodes([]);
        setWatchedRows([]);
      } finally {
        setLoading(false);
      }
    }

    loadShow();
  }, [id, targetEpisodeId]);

  useEffect(() => {
    if (!targetEpisodeId || loading) return;

    const timer = setTimeout(() => {
      const el = document.getElementById(`episode-${targetEpisodeId}`);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("episode-highlight");
      setTimeout(() => el.classList.remove("episode-highlight"), 2500);
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
          isEpisodeWatched(ep, watchedEpisodeIds)
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
  }, [episodes, watchedEpisodeIds]);

  const stats = useMemo(() => {
    const total = episodes.length;
    const watched = episodes.filter((ep) =>
      isEpisodeWatched(ep, watchedEpisodeIds)
    ).length;
    const pct = total > 0 ? Math.round((watched / total) * 100) : 0;

    const nextEpisode = episodes.find(
      (ep) => !isEpisodeWatched(ep, watchedEpisodeIds) && isFuture(ep.aired)
    );

    return { total, watched, pct, nextEpisode };
  }, [episodes, watchedEpisodeIds]);

  function toggleSeason(seasonNumber) {
    setExpandedSeasons((prev) => ({
      ...prev,
      [seasonNumber]: !prev[seasonNumber],
    }));
  }

  async function refreshWatched(userId) {
    const fresh = await fetchWatchedRows(userId);
    setWatchedRows(fresh);
  }

  async function handleMarkWatched(ep) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    try {
      const payload = {
        user_id: user.id,
        episode_id: ep.id,
      };

      const { error } = await supabase
        .from("watched_episodes")
        .upsert(payload, { onConflict: "user_id,episode_id" });

      if (error) throw error;

      await refreshWatched(user.id);
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
      const episodesToBeWatched = episodes.filter((ep) => {
        if (ep.seasonNumber < targetEpisode.seasonNumber) return true;
        return (
          ep.seasonNumber === targetEpisode.seasonNumber &&
          ep.number <= targetEpisode.number
        );
      });

      if (episodesToBeWatched.length === 0) return;

      const rows = episodesToBeWatched.map((ep) => ({
        user_id: user.id,
        episode_id: ep.id,
      }));

      const { error } = await supabase
        .from("watched_episodes")
        .upsert(rows, { onConflict: "user_id,episode_id" });

      if (error) throw error;

      await refreshWatched(user.id);
    } catch (error) {
      console.error("Failed watch up to here:", error);
      alert(error.message || "Failed watch up to here");
    }
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
          {show.poster_url ? (
            <img
              src={show.poster_url}
              alt={show.show_name}
              className="msd-poster"
            />
          ) : null}

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
                      const watched = isEpisodeWatched(ep, watchedEpisodeIds);

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
                                {makeEpisodeCode(ep)} - {ep.name}
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
                              onClick={() => handleMarkWatched(ep)}
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
