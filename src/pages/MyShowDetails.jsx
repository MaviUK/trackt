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

  const [watchProviders, setWatchProviders] = useState([]);
  const [cast, setCast] = useState([]);
  const [recommendedShows, setRecommendedShows] = useState([]);
  const [burgrRatings, setBurgrRatings] = useState([]);
  const [myBurgrRating, setMyBurgrRating] = useState("");

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
          setWatchProviders([]);
          setCast([]);
          setRecommendedShows([]);
          setBurgrRatings([]);
          setMyBurgrRating("");
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
          setWatchProviders([]);
          setCast([]);
          setRecommendedShows([]);
          setBurgrRatings([]);
          setMyBurgrRating("");
          return;
        }

        const showRecord = userShowRow.shows;
        const showId = showRecord.id;

        const [
          { data: episodeRows, error: episodeError },
          watchedRowsData,
          { data: providerRows, error: providerError },
          { data: castRows, error: castError },
          { data: recommendationRows, error: recommendationError },
          { data: burgrRows, error: burgrError },
        ] = await Promise.all([
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

          supabase
            .from("show_watch_providers")
            .select(`
              id,
              provider_name,
              provider_url,
              provider_type
            `)
            .eq("show_id", showId)
            .order("provider_name", { ascending: true }),

          supabase
            .from("show_cast")
            .select(`
              id,
              person_name,
              character_name,
              profile_url,
              sort_order
            `)
            .eq("show_id", showId)
            .order("sort_order", { ascending: true })
            .limit(12),

          supabase
            .from("show_recommendations")
            .select(`
              id,
              recommended_show_id,
              shows!show_recommendations_recommended_show_id_fkey(
                id,
                tvdb_id,
                name,
                poster_url,
                first_aired
              )
            `)
            .eq("show_id", showId)
            .limit(12),

          supabase
            .from("burgr_ratings")
            .select("user_id, show_id, rating")
            .eq("show_id", showId),
        ]);

        if (episodeError) throw episodeError;
        if (providerError) throw providerError;
        if (castError) throw castError;
        if (recommendationError) throw recommendationError;
        if (burgrError) throw burgrError;

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

        const mappedRecommendations = (recommendationRows || [])
          .map((row) => row.shows)
          .filter(Boolean);

        const mine = (burgrRows || []).find((row) => row.user_id === user.id);

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
        setWatchProviders(providerRows || []);
        setCast(castRows || []);
        setRecommendedShows(mappedRecommendations);
        setBurgrRatings(burgrRows || []);
        setMyBurgrRating(mine ? String(mine.rating) : "");
      } catch (error) {
        console.error("Failed loading show:", error);
        setShow(null);
        setEpisodes([]);
        setWatchedRows([]);
        setWatchProviders([]);
        setCast([]);
        setRecommendedShows([]);
        setBurgrRatings([]);
        setMyBurgrRating("");
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

  const burgrStats = useMemo(() => {
    const ratings = burgrRatings
      .map((r) => Number(r.rating))
      .filter((n) => !Number.isNaN(n));

    const avg =
      ratings.length > 0
        ? (ratings.reduce((sum, n) => sum + n, 0) / ratings.length).toFixed(1)
        : null;

    return {
      avg,
      count: ratings.length,
    };
  }, [burgrRatings]);

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

  async function refreshBurgrRatings(showId) {
    const { data, error } = await supabase
      .from("burgr_ratings")
      .select("user_id, show_id, rating")
      .eq("show_id", showId);

    if (error) throw error;
    setBurgrRatings(data || []);
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

  async function handleSaveBurgrRating() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user || !show?.id) return;

    const rating = Number(myBurgrRating);

    if (Number.isNaN(rating) || rating < 0 || rating > 10) {
      alert("Burgr rating must be between 0 and 10");
      return;
    }

    try {
      const { error } = await supabase.from("burgr_ratings").upsert(
        {
          user_id: user.id,
          show_id: show.id,
          rating,
        },
        { onConflict: "user_id,show_id" }
      );

      if (error) throw error;

      await refreshBurgrRatings(show.id);
    } catch (error) {
      console.error("Failed saving Burgr rating:", error);
      alert(error.message || "Failed saving Burgr rating");
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

              <div className="msd-stat-box">
                <span className="msd-stat-label">Burgrs</span>
                <strong className="msd-stat-value">
                  {burgrStats.avg ? `${burgrStats.avg}/10` : "—"}
                </strong>
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

        <section className="msd-extra-grid">
          <div className="msd-panel">
            <h2 className="msd-section-title">Where to Watch</h2>

            {watchProviders.length > 0 ? (
              <div className="msd-provider-list">
                {watchProviders.map((provider) => (
                  <a
                    key={provider.id}
                    href={provider.provider_url}
                    target="_blank"
                    rel="noreferrer"
                    className="msd-provider-chip"
                  >
                    {provider.provider_name}
                    {provider.provider_type
                      ? ` (${provider.provider_type})`
                      : ""}
                  </a>
                ))}
              </div>
            ) : (
              <p className="msd-muted">No watch providers available.</p>
            )}
          </div>

          <div className="msd-panel">
            <h2 className="msd-section-title">Burgrs Rating</h2>

            <div className="msd-burgr-summary">
              <div>
                <span className="msd-stat-label">Average</span>
                <strong className="msd-stat-value">
                  {burgrStats.avg ? `${burgrStats.avg}/10` : "No ratings yet"}
                </strong>
              </div>

              <div>
                <span className="msd-stat-label">Ratings</span>
                <strong className="msd-stat-value">{burgrStats.count}</strong>
              </div>
            </div>

            <div className="msd-burgr-form">
              <label htmlFor="burgr-rating" className="msd-stat-label">
                Your Burgrs
              </label>

              <div className="msd-burgr-controls">
                <input
                  id="burgr-rating"
                  type="number"
                  min="0"
                  max="10"
                  step="1"
                  value={myBurgrRating}
                  onChange={(e) => setMyBurgrRating(e.target.value)}
                  className="msd-rating-input"
                  placeholder="0-10"
                />

                <button
                  type="button"
                  className="msd-btn msd-btn-primary"
                  onClick={handleSaveBurgrRating}
                >
                  Save Rating
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="msd-panel">
          <h2 className="msd-section-title">Cast</h2>

          {cast.length > 0 ? (
            <div className="msd-cast-grid">
              {cast.map((member) => (
                <div key={member.id} className="msd-cast-card">
                  {member.profile_url ? (
                    <img
                      src={member.profile_url}
                      alt={member.person_name}
                      className="msd-cast-image"
                    />
                  ) : null}

                  <div className="msd-cast-name">{member.person_name}</div>
                  <div className="msd-cast-role">
                    {member.character_name || "Cast"}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="msd-muted">No cast available.</p>
          )}
        </section>

        <section className="msd-panel">
          <h2 className="msd-section-title">Recommended Shows</h2>

          {recommendedShows.length > 0 ? (
            <div className="msd-recommended-grid">
              {recommendedShows.map((rec) => (
                <Link
                  key={rec.id}
                  to={`/my-shows/${rec.tvdb_id}`}
                  className="msd-rec-card"
                >
                  {rec.poster_url ? (
                    <img
                      src={rec.poster_url}
                      alt={rec.name}
                      className="msd-rec-poster"
                    />
                  ) : null}

                  <div className="msd-rec-title">{rec.name}</div>

                  {rec.first_aired ? (
                    <div className="msd-rec-date">
                      {formatDate(rec.first_aired)}
                    </div>
                  ) : null}
                </Link>
              ))}
            </div>
          ) : (
            <p className="msd-muted">No recommendations yet.</p>
          )}
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
