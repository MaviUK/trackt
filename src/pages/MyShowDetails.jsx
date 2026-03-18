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

async function fetchBurgrRatings(showId) {
  const { data, error } = await supabase
    .from("burgr_ratings")
    .select("user_id, show_id, rating")
    .eq("show_id", showId);

  if (error) {
    console.warn("burgr_ratings load failed:", error);
    return [];
  }

  return data || [];
}

export default function MyShowDetails() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const targetEpisodeId = searchParams.get("episode");

  const [loading, setLoading] = useState(true);
  const [extrasLoading, setExtrasLoading] = useState(false);
  const [savingBurgr, setSavingBurgr] = useState(false);

  const [show, setShow] = useState(null);
  const [episodes, setEpisodes] = useState([]);
  const [watchedRows, setWatchedRows] = useState([]);
  const [expandedSeasons, setExpandedSeasons] = useState({});

  const [cast, setCast] = useState([]);
  const [recommendedShows, setRecommendedShows] = useState([]);

  const [burgrRatings, setBurgrRatings] = useState([]);
  const [myBurgrRating, setMyBurgrRating] = useState("");
  const [hoverBurgrRating, setHoverBurgrRating] = useState(0);

  const watchedEpisodeIds = useMemo(
    () => buildWatchedEpisodeIdSet(watchedRows),
    [watchedRows]
  );

  useEffect(() => {
    async function loadShow() {
      setLoading(true);
      setExtrasLoading(false);

      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          setShow(null);
          setEpisodes([]);
          setWatchedRows([]);
          setExpandedSeasons({});
          setCast([]);
          setRecommendedShows([]);
          setBurgrRatings([]);
          setMyBurgrRating("");
          return;
        }

        const tvdbId = Number(id);

        if (Number.isNaN(tvdbId)) {
          setShow(null);
          setEpisodes([]);
          setWatchedRows([]);
          setExpandedSeasons({});
          setCast([]);
          setRecommendedShows([]);
          setBurgrRatings([]);
          setMyBurgrRating("");
          return;
        }

        let userShowRow = null;
        let showRecord = null;

        const { data: userShowData, error: userShowError } = await supabase
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
              first_aired,
              network,
              genres
            )
          `)
          .eq("user_id", user.id)
          .eq("shows.tvdb_id", tvdbId)
          .maybeSingle();

        if (userShowError) {
          console.warn("user show fetch failed", userShowError);
        }

        if (userShowData?.shows) {
          userShowRow = userShowData;
          showRecord = userShowData.shows;
        } else {
          const { data: showData, error: showError } = await supabase
            .from("shows")
            .select(`
              id,
              tvdb_id,
              name,
              overview,
              status,
              poster_url,
              first_aired,
              network,
              genres
            `)
            .eq("tvdb_id", tvdbId)
            .maybeSingle();

          if (showError) throw showError;

          if (!showData) {
            setShow(null);
            setEpisodes([]);
            setWatchedRows([]);
            setExpandedSeasons({});
            setCast([]);
            setRecommendedShows([]);
            setBurgrRatings([]);
            setMyBurgrRating("");
            return;
          }

          showRecord = showData;
        }

        const showId = showRecord.id;

        const [episodeRes, watchedRowsData, burgrRows] = await Promise.all([
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
          fetchBurgrRatings(showId),
        ]);

        const { data: episodeRows, error: episodeError } = episodeRes;
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

        const mine = (burgrRows || []).find((row) => row.user_id === user.id);

        setShow({
          id: showRecord.id,
          tvdb_id: showRecord.tvdb_id,
          show_name: showRecord.name || "Unknown title",
          overview: showRecord.overview || "",
          poster_url: showRecord.poster_url || null,
          first_aired: showRecord.first_aired || null,
          status: showRecord.status || null,
          network: showRecord.network || "",
          genres: Array.isArray(showRecord.genres) ? showRecord.genres : [],
          watch_status: userShowRow?.watch_status || "not_added",
          added_at: userShowRow?.added_at || null,
          created_at: userShowRow?.created_at || null,
        });

        setEpisodes(normalizedEpisodes);
        setWatchedRows(watchedRowsData || []);
        setExpandedSeasons(seasonMap);
        setBurgrRatings(burgrRows || []);
        setMyBurgrRating(mine ? String(mine.rating) : "");

        setCast([]);
        setRecommendedShows([]);

        try {
          setExtrasLoading(true);

          const extrasRes = await fetch(
            `/.netlify/functions/getShowExtras?tvdbId=${showRecord.tvdb_id}`
          );

          if (!extrasRes.ok) {
            throw new Error(`Failed to load show extras (${extrasRes.status})`);
          }

          const extras = await extrasRes.json();

          setCast(Array.isArray(extras.cast) ? extras.cast : []);
          setRecommendedShows(
            Array.isArray(extras.recommendations)
              ? extras.recommendations
              : []
          );
        } catch (extrasError) {
          console.error("Failed loading TVDB extras:", extrasError);
          setCast([]);
          setRecommendedShows([]);
        } finally {
          setExtrasLoading(false);
        }
      } catch (error) {
        console.error("Failed loading show:", error);
        setShow(null);
        setEpisodes([]);
        setWatchedRows([]);
        setExpandedSeasons({});
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

  async function refreshBurgrRatings(showId, userId) {
    const fresh = await fetchBurgrRatings(showId);
    setBurgrRatings(fresh);

    const mine = (fresh || []).find((row) => row.user_id === userId);
    setMyBurgrRating(mine ? String(mine.rating) : "");
  }

  async function handleMarkWatched(ep) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    try {
      const { error } = await supabase
        .from("watched_episodes")
        .upsert(
          {
            user_id: user.id,
            episode_id: ep.id,
          },
          { onConflict: "user_id,episode_id" }
        );

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

  async function handleSelectBurgrRating(value) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user || !show?.id || savingBurgr) return;

    const rating = Number(value);

    if (Number.isNaN(rating) || rating < 1 || rating > 10) {
      return;
    }

    const previousRating = myBurgrRating;
    setMyBurgrRating(String(rating));
    setSavingBurgr(true);

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

      await refreshBurgrRatings(show.id, user.id);
    } catch (error) {
      console.error("Failed saving Burgr rating:", error);
      setMyBurgrRating(previousRating);
      alert(error.message || "Failed saving Burgr rating");
    } finally {
      setSavingBurgr(false);
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

  const activeBurgrRating = hoverBurgrRating || Number(myBurgrRating || 0);

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

              {show.status ? <div>Status: {show.status}</div> : null}
            </div>

            <div className="msd-stats-row msd-stats-row-top">
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

            <div className="msd-stat-box msd-stat-box-full">
              <span className="msd-stat-label">Your Burgr Rating</span>

              <div className="msd-burgr-form msd-burgr-form-compact">
                <div className="msd-burgr-picker msd-burgr-picker-compact">
                  {Array.from({ length: 10 }, (_, index) => {
                    const value = index + 1;
                    const filled = value <= activeBurgrRating;

                    return (
                      <button
                        key={value}
                        type="button"
                        className={`msd-burger-btn ${
                          filled ? "is-filled" : "is-empty"
                        }`}
                        onMouseEnter={() => setHoverBurgrRating(value)}
                        onMouseLeave={() => setHoverBurgrRating(0)}
                        onClick={() => handleSelectBurgrRating(value)}
                        aria-label={`Rate ${value} out of 10 burgers`}
                        title={`${value}/10`}
                        disabled={savingBurgr}
                      >
                        <img
                          src="/burger-rating.png"
                          alt=""
                          className="msd-burger-icon msd-burger-icon-small"
                        />
                      </button>
                    );
                  })}
                </div>

                <div className="msd-burgr-picker-footer msd-burgr-picker-footer-compact">
                  <span className="msd-burgr-current">
                    {savingBurgr
                      ? "Saving..."
                      : myBurgrRating
                      ? `${myBurgrRating}/10`
                      : "Select"}
                  </span>
                </div>
              </div>
            </div>

            <div className="msd-stats-row msd-stats-row-rest">
              <div className="msd-stat-box">
                <span className="msd-stat-label">Average Burgrs</span>
                <strong className="msd-stat-value">
                  {burgrStats.avg ? `${burgrStats.avg}/10` : "—"}
                </strong>
              </div>

              <div className="msd-stat-box">
                <span className="msd-stat-label">Network</span>
                <strong className="msd-stat-value">
                  {show.network ? (
                    <Link
                      to={`/search?network=${encodeURIComponent(show.network)}`}
                      className="msd-link"
                    >
                      {show.network}
                    </Link>
                  ) : (
                    "—"
                  )}
                </strong>
              </div>

              <div className="msd-stat-box">
                <span className="msd-stat-label">Genre</span>
                <strong className="msd-stat-value">
                  {show.genres?.length > 0
                    ? show.genres.map((genre, index) => (
                        <span key={genre}>
                          <Link
                            to={`/search?genre=${encodeURIComponent(genre)}`}
                            className="msd-link"
                          >
                            {genre}
                          </Link>
                          {index < show.genres.length - 1 ? ", " : ""}
                        </span>
                      ))
                    : "—"}
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

        <section className="msd-panel">
          <h2 className="msd-section-title">Cast</h2>

          {extrasLoading ? (
            <p className="msd-muted">Loading cast...</p>
          ) : cast.length > 0 ? (
            <div className="msd-cast-grid">
              {cast.map((member, index) => (
                <div
                  key={member.id || `${member.personName}-${index}`}
                  className="msd-cast-card"
                >
                  {member.image ? (
                    <img
                      src={member.image}
                      alt={member.personName || "Cast member"}
                      className="msd-cast-image"
                    />
                  ) : null}

                  <div className="msd-cast-name">
                    {member.personName || "Unknown actor"}
                  </div>
                  <div className="msd-cast-role">
                    {member.characterName || "Cast"}
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

          {extrasLoading ? (
            <p className="msd-muted">Loading recommendations...</p>
          ) : recommendedShows.length > 0 ? (
            <div className="msd-recommended-grid">
              {recommendedShows.map((rec, index) => {
                const hasTvdbId = rec.tvdb_id || rec.tvdbId;
                const linkTarget = hasTvdbId
                  ? `/my-shows/${rec.tvdb_id || rec.tvdbId}`
                  : "#";

                const content = (
                  <>
                    {rec.poster_url || rec.posterUrl ? (
                      <img
                        src={rec.poster_url || rec.posterUrl}
                        alt={rec.name || "Recommended show"}
                        className="msd-rec-poster"
                      />
                    ) : null}

                    <div className="msd-rec-title">
                      {rec.name || "Unknown show"}
                    </div>

                    {rec.first_aired || rec.firstAired ? (
                      <div className="msd-rec-date">
                        {formatDate(rec.first_aired || rec.firstAired)}
                      </div>
                    ) : null}
                  </>
                );

                if (hasTvdbId) {
                  return (
                    <Link
                      key={rec.id || `${rec.name}-${index}`}
                      to={linkTarget}
                      className="msd-rec-card"
                    >
                      {content}
                    </Link>
                  );
                }

                return (
                  <div
                    key={rec.id || `${rec.name}-${index}`}
                    className="msd-rec-card"
                  >
                    {content}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="msd-muted">No recommendations yet.</p>
          )}
        </section>
      </div>
    </div>
  );
}
