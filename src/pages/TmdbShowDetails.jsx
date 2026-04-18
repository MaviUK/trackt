import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { addShowToUserList } from "../lib/userShows";
import { supabase } from "../lib/supabase";
import { formatDate } from "../lib/date";
import "./ShowDetails.css";

function getHeroBackdrop(show) {
  return show?.backdrop_url || show?.poster_url || "";
}

function getOverview(show) {
  return show?.overview || "No overview available.";
}

function getSeasonCount(show) {
  return Number(show?.number_of_seasons || show?.seasons?.length || 0);
}

function getEpisodeCount(show) {
  if (Number(show?.number_of_episodes || 0) > 0) {
    return Number(show.number_of_episodes);
  }

  return (show?.seasons || []).reduce(
    (total, season) => total + Number(season?.episode_count || 0),
    0
  );
}

function getNetworks(show) {
  if (!Array.isArray(show?.networks)) return [];
  return show.networks.map((item) => item?.name).filter(Boolean);
}

function getGenres(show) {
  if (!Array.isArray(show?.genres)) return [];
  return show.genres.map((item) => item?.name).filter(Boolean);
}

function getCast(show) {
  if (!Array.isArray(show?.cast)) return [];
  return show.cast;
}

function getCrew(show) {
  if (!Array.isArray(show?.crew)) return [];
  return show.crew;
}

export default function TmdbShowDetails() {
  const { tmdbId } = useParams();

  const [loading, setLoading] = useState(true);
  const [show, setShow] = useState(null);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("seasons");
  const [expandedSeasons, setExpandedSeasons] = useState({});
  const [adding, setAdding] = useState(false);
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [tmdbId]);

  useEffect(() => {
    let cancelled = false;

    async function loadShow() {
      setLoading(true);
      setError("");

      try {
        const response = await fetch(
          `/.netlify/functions/getTmdbShowDetails?tmdbId=${encodeURIComponent(
            tmdbId
          )}`
        );
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data?.message || "Failed to load show");
        }

        if (!cancelled) {
          setShow(data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err?.message || "Failed to load show");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    async function loadSavedState() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user || !tmdbId) {
        if (!cancelled) setIsSaved(false);
        return;
      }

      const { data, error } = await supabase
        .from("user_shows_new")
        .select("id, tmdb_id")
        .eq("user_id", user.id)
        .eq("tmdb_id", Number(tmdbId))
        .limit(1)
        .maybeSingle();

      if (!cancelled) {
        setIsSaved(Boolean(data) && !error);
      }
    }

    loadShow();
    loadSavedState();

    return () => {
      cancelled = true;
    };
  }, [tmdbId]);

  async function handleAddShow() {
    if (!show || adding || isSaved) return;

    setAdding(true);

    try {
      await addShowToUserList({
        id: Number(show.tmdb_id),
        tmdb_id: Number(show.tmdb_id),
        tvdb_id: show.tvdb_id ? Number(show.tvdb_id) : null,
        name: show.name || "Unknown show",
        overview: show.overview || null,
        poster_url: show.poster_url || null,
        backdrop_url: show.backdrop_url || null,
        first_air_date: show.first_air_date || null,
        first_aired: show.first_air_date || null,
        status: show.status || null,
        source: "tmdb",
      });

      setIsSaved(true);
    } catch (err) {
      console.error("Failed adding TMDB show", err);
      alert(err?.message || "Failed to add show");
    } finally {
      setAdding(false);
    }
  }

  function toggleSeason(seasonNumber) {
    setExpandedSeasons((prev) => ({
      ...prev,
      [seasonNumber]: !prev[seasonNumber],
    }));
  }

  const seasonCount = useMemo(() => getSeasonCount(show), [show]);
  const episodeCount = useMemo(() => getEpisodeCount(show), [show]);
  const networks = useMemo(() => getNetworks(show), [show]);
  const genres = useMemo(() => getGenres(show), [show]);
  const cast = useMemo(() => getCast(show), [show]);
  const crew = useMemo(() => getCrew(show), [show]);

  if (loading) {
    return (
      <div className="show-details-page">
        <div className="show-details-shell">
          <div className="show-details-empty">Loading show...</div>
        </div>
      </div>
    );
  }

  if (error || !show) {
    return (
      <div className="show-details-page">
        <div className="show-details-shell">
          <div className="show-details-empty">
            <p>{error || "Show not found."}</p>
          </div>
        </div>
      </div>
    );
  }

  const backdrop = getHeroBackdrop(show);
  const overview = getOverview(show);

  return (
    <div className="show-details-page">
      <div className="show-details-shell">
        <section
          className="show-details-hero tmdb-show-details-hero"
          style={
            backdrop
              ? {
                  backgroundImage: `linear-gradient(180deg, rgba(7,11,20,0.10) 0%, rgba(7,11,20,0.60) 52%, rgba(7,11,20,0.96) 100%), url("${backdrop}")`,
                }
              : undefined
          }
        >
          <div className="show-details-hero-inner tmdb-show-details-hero-inner">
            <div className="show-details-main tmdb-show-details-main">
              <h1 className="show-details-title">{show.name}</h1>

              {show.first_air_date ? (
                <div className="show-details-year">
                  {new Date(show.first_air_date).getFullYear()}
                </div>
              ) : null}

              {show.first_air_date ? (
                <div className="show-details-subtitle">
                  First aired: {formatDate(show.first_air_date)}
                </div>
              ) : null}

              <p className="show-details-overview tmdb-show-details-overview">
                {overview}
              </p>

              <div className="show-details-dots">• • •</div>

              <div className="show-details-stats-grid">
                <div className="show-details-stat-card">
                  <span className="show-details-stat-label">Seasons</span>
                  <strong className="show-details-stat-value">{seasonCount}</strong>
                </div>

                <div className="show-details-stat-card">
                  <span className="show-details-stat-label">Episodes</span>
                  <strong className="show-details-stat-value">{episodeCount}</strong>
                </div>

                <div className="show-details-stat-card">
                  <span className="show-details-stat-label">Rating</span>
                  <strong className="show-details-stat-value">
                    {show.vote_average
                      ? Number(show.vote_average).toFixed(1)
                      : "—"}
                  </strong>
                </div>

                <div className="show-details-stat-card">
                  <span className="show-details-stat-label">Rank'd</span>
                  <strong className="show-details-stat-value">—</strong>
                </div>
              </div>

              <div className="show-details-tabs">
                <button
                  type="button"
                  className={`show-details-tab ${
                    activeTab === "seasons" ? "is-active" : ""
                  }`}
                  onClick={() => setActiveTab("seasons")}
                >
                  Seasons
                </button>

                <button
                  type="button"
                  className={`show-details-tab ${
                    activeTab === "cast" ? "is-active" : ""
                  }`}
                  onClick={() => setActiveTab("cast")}
                >
                  Cast
                </button>

                <button
                  type="button"
                  className={`show-details-tab ${
                    activeTab === "crew" ? "is-active" : ""
                  }`}
                  onClick={() => setActiveTab("crew")}
                >
                  Crew
                </button>

                <button
                  type="button"
                  className={`show-details-tab ${
                    activeTab === "network" ? "is-active" : ""
                  }`}
                  onClick={() => setActiveTab("network")}
                >
                  Studio
                </button>

                <button
                  type="button"
                  className={`show-details-tab ${
                    activeTab === "genre" ? "is-active" : ""
                  }`}
                  onClick={() => setActiveTab("genre")}
                >
                  Genre
                </button>
              </div>
            </div>

            {show.poster_url ? (
              <div className="show-details-poster-wrap tmdb-show-details-poster-wrap">
                <img
                  src={show.poster_url}
                  alt={show.name}
                  className="show-details-poster"
                />
              </div>
            ) : null}
          </div>
        </section>

        <section className="show-details-content">
          {activeTab === "seasons" ? (
            <>
              <h2 className="show-details-section-title">Seasons</h2>

              <div className="show-details-season-list">
                {(show.seasons || []).map((season) => {
                  const seasonNumber =
                    season?.season_number ?? season?.number ?? Math.random();
                  const isExpanded = Boolean(expandedSeasons[seasonNumber]);

                  return (
                    <div
                      key={season?.id || seasonNumber}
                      className="show-details-season-item"
                    >
                      <button
                        type="button"
                        className="show-details-season-header"
                        onClick={() => toggleSeason(seasonNumber)}
                      >
                        <span>{season?.name || `Season ${seasonNumber}`}</span>
                        <span className="show-details-season-chevron">
                          {isExpanded ? "▴" : "▾"}
                        </span>
                      </button>

                      {isExpanded ? (
                        <div className="show-details-season-body">
                          {season?.air_date ? (
                            <div className="show-details-season-meta">
                              {formatDate(season.air_date)}
                            </div>
                          ) : null}

                          <div className="show-details-season-meta">
                            {season?.episode_count || 0} episodes
                          </div>

                          {season?.overview ? (
                            <p className="show-details-season-overview">
                              {season.overview}
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </>
          ) : null}

          {activeTab === "cast" ? (
            <>
              <h2 className="show-details-section-title">Cast</h2>
              <div className="show-details-pill-list">
                {cast.length ? (
                  cast.map((person) => (
                    <div
                      key={`${person?.id || person?.name}-${person?.character || ""}`}
                      className="show-details-pill"
                    >
                      {person?.name}
                      {person?.character ? ` — ${person.character}` : ""}
                    </div>
                  ))
                ) : (
                  <div className="show-details-empty">No cast data available.</div>
                )}
              </div>
            </>
          ) : null}

          {activeTab === "crew" ? (
            <>
              <h2 className="show-details-section-title">Crew</h2>
              <div className="show-details-pill-list">
                {crew.length ? (
                  crew.map((person) => (
                    <div
                      key={`${person?.id || person?.name}-${person?.job || ""}`}
                      className="show-details-pill"
                    >
                      {person?.name}
                      {person?.job ? ` — ${person.job}` : ""}
                    </div>
                  ))
                ) : (
                  <div className="show-details-empty">No crew data available.</div>
                )}
              </div>
            </>
          ) : null}

          {activeTab === "network" ? (
            <>
              <h2 className="show-details-section-title">Studio</h2>
              <div className="show-details-pill-list">
                {networks.length ? (
                  networks.map((network) => (
                    <div key={network} className="show-details-pill">
                      {network}
                    </div>
                  ))
                ) : (
                  <div className="show-details-empty">No studio data available.</div>
                )}
              </div>
            </>
          ) : null}

          {activeTab === "genre" ? (
            <>
              <h2 className="show-details-section-title">Genre</h2>
              <div className="show-details-pill-list">
                {genres.length ? (
                  genres.map((genre) => (
                    <div key={genre} className="show-details-pill">
                      {genre}
                    </div>
                  ))
                ) : (
                  <div className="show-details-empty">No genre data available.</div>
                )}
              </div>
            </>
          ) : null}
        </section>

        <div className="show-details-bottom-action">
          <button
            type="button"
            className="show-details-add-btn"
            disabled={adding || isSaved}
            onClick={handleAddShow}
          >
            {isSaved ? "Added to My Shows" : adding ? "Adding..." : "Add to My Shows"}
          </button>
        </div>
      </div>
    </div>
  );
}
