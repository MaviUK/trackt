import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { formatDate } from "../lib/date";
import { addShowToUserList } from "../lib/userShows";
import "./MyShowDetails.css";
import {
  enrichTmdbShowsWithMappings,
  getMappedShowHref,
  normalizeMappedShow,
} from "../lib/tmdbMappings";

function makeEpisodeCode(ep) {
  if (Number(ep?.seasonNumber) === 0) {
    if (!ep?.number) return "Special";
    return `Special ${ep.number}`;
  }

  if (!ep?.seasonNumber || !ep?.number) return "Episode";
  return `S${String(ep.seasonNumber).padStart(2, "0")}E${String(
    ep.number
  ).padStart(2, "0")}`;
}

function getYear(dateString) {
  if (!dateString) return "";
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return "";
  return String(d.getFullYear());
}

function sortSeasonGroups(a, b) {
  const aNum = Number(a[0]);
  const bNum = Number(b[0]);

  if (aNum === 0 && bNum !== 0) return -1;
  if (bNum === 0 && aNum !== 0) return 1;
  return aNum - bNum;
}

function getBannerFromExtras(extras) {
  if (!extras || typeof extras !== "object") return null;

  return (
    extras.backdrop_url ||
    extras.backdropUrl ||
    extras.banner_url ||
    extras.bannerUrl ||
    extras.background_url ||
    extras.backgroundUrl ||
    extras.show?.backdrop_url ||
    extras.show?.banner_url ||
    extras.show?.background_url ||
    null
  );
}

function getBackdropUrl(showData) {
  return (
    showData?.backdrop_url ||
    showData?.background_url ||
    showData?.banner_url ||
    showData?.fanart_url ||
    showData?.image_url ||
    showData?.poster_url ||
    showData?.image ||
    null
  );
}

function getSafeTmdbRating(showData, extras) {
  const candidates = [
    extras?.tmdb_vote_average,
    extras?.tmdbRating,
    extras?.show?.tmdb_vote_average,
    extras?.show?.vote_average,
    extras?.show?.tmdb_rating,
    showData?.tmdb_rating,
    showData?.tmdb_vote_average,
    showData?.vote_average,
    showData?.rating_average,
  ];

  for (const value of candidates) {
    const num = Number(value);
    if (Number.isFinite(num) && num > 0 && num <= 10) {
      return num;
    }
  }

  return null;
}

function getSafeRankdRating(showData, extras) {
  const candidates = [
    showData?.rankd_average,
    showData?.average_rankd_rating,
    extras?.rankd_average,
    extras?.average_rankd_rating,
  ];

  for (const value of candidates) {
    const num = Number(value);
    if (Number.isFinite(num) && num > 0) {
      return num;
    }
  }

  return null;
}

function normalizeShowPayload(showData, tvdbIdFallback, extras = null) {
  if (!showData) return null;

  return {
    id: showData.id ?? null,
    tvdb_id: showData.tvdb_id ?? tvdbIdFallback ?? null,
    show_name: showData.name || showData.show_name || "Unknown title",
    overview: showData.overview || "",
    poster_url:
      showData.poster_url || showData.image_url || showData.image || null,
    backdrop_url: getBackdropUrl(showData),
    first_aired:
      showData.first_aired ||
      showData.first_air_time ||
      showData.firstAired ||
      null,
    status: showData.status || null,
    network: showData.network || "",
    original_language: showData.original_language || "",
    genres: Array.isArray(showData.genres) ? showData.genres : [],
    relationship_types: Array.isArray(showData.relationship_types)
      ? showData.relationship_types
      : [],
    settings: Array.isArray(showData.settings) ? showData.settings : [],
    rating_average: getSafeTmdbRating(showData, extras),
    rating_count:
      showData.rating_count != null ? Number(showData.rating_count) : null,
    rankd_average: getSafeRankdRating(showData, extras),
  };
}

function normalizeEpisodePayload(row, index, tvdbId) {
  return {
    id:
      row.id ||
      row.tvdb_id ||
      row.tvdbId ||
      `${tvdbId}-${row.season_number ?? row.seasonNumber ?? 0}-${
        row.episode_number ?? row.number ?? 0
      }-${index}`,
    tvdb_episode_id: row.tvdb_id || row.tvdbId || null,
    seasonNumber: row.season_number ?? row.seasonNumber ?? 0,
    number: row.episode_number ?? row.number ?? 0,
    aired: row.aired_date || row.airDate || row.aired || null,
    airDate: row.aired_date || row.airDate || row.aired || null,
    name: row.name || "Untitled episode",
    overview: row.overview || "",
    image: row.image_url || row.image || row.tmdb_still_path || null,
    episode_code: row.episode_code || null,
  };
}

export default function ShowDetails() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [extrasLoading, setExtrasLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");

  const [show, setShow] = useState(null);
  const [episodes, setEpisodes] = useState([]);
  const [expandedSeasons, setExpandedSeasons] = useState({});
  const [cast, setCast] = useState([]);
  const [crew, setCrew] = useState([]);
  const [recommendedShows, setRecommendedShows] = useState([]);
  const [mobileBannerUrl, setMobileBannerUrl] = useState(null);
  const [viewer, setViewer] = useState(null);
  const [isAdded, setIsAdded] = useState(false);
  const [expandedOverview, setExpandedOverview] = useState(false);
  const [activeTab, setActiveTab] = useState("seasons");
  const [expandedEpisodeOverviewIds, setExpandedEpisodeOverviewIds] = useState(
    {}
  );

  useEffect(() => {
    async function loadShow() {
      setLoading(true);
      setExtrasLoading(false);
      setError("");

      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        setViewer(user || null);

        const tvdbId = Number(id);
        if (Number.isNaN(tvdbId)) {
          setShow(null);
          setEpisodes([]);
          setExpandedSeasons({});
          setCast([]);
          setCrew([]);
          setRecommendedShows([]);
          setMobileBannerUrl(null);
          setIsAdded(false);
          return;
        }

        let dbShow = null;
        let dbEpisodes = [];
        let extras = null;

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
            genres,
            original_language,
            relationship_types,
            settings,
            rating_average,
            rating_count
          `)
          .eq("tvdb_id", tvdbId)
          .maybeSingle();

        if (showError) throw showError;

        if (showData) {
          dbShow = showData;

          if (user) {
            const { data: userShowData, error: userShowError } = await supabase
              .from("user_shows_new")
              .select("id")
              .eq("user_id", user.id)
              .eq("show_id", showData.id)
              .maybeSingle();

            if (userShowError) {
              console.warn("user show fetch failed", userShowError);
            }

            setIsAdded(!!userShowData);
          } else {
            setIsAdded(false);
          }

          const { data: episodeRows, error: episodeError } = await supabase
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
              image_url,
              tmdb_still_path
            `)
            .eq("show_id", showData.id)
            .order("season_number", { ascending: true })
            .order("episode_number", { ascending: true });

          if (episodeError) throw episodeError;

          dbEpisodes = (episodeRows || []).map((row, index) =>
            normalizeEpisodePayload(row, index, tvdbId)
          );
        } else {
          setIsAdded(false);
        }

        try {
          setExtrasLoading(true);

          const extrasRes = await fetch(
            `/.netlify/functions/getShowExtras?tvdbId=${tvdbId}`
          );

          if (extrasRes.ok) {
            extras = await extrasRes.json();
          } else {
            console.warn(`getShowExtras returned ${extrasRes.status}`);
          }
        } catch (extrasError) {
          console.error("Failed loading TVDB extras:", extrasError);
        } finally {
          setExtrasLoading(false);
        }

        const fallbackShow =
          extras?.show || extras?.series || extras?.data || null;

        const normalizedShow = normalizeShowPayload(
          dbShow || fallbackShow,
          tvdbId,
          extras
        );

        if (!normalizedShow) {
          setShow(null);
          setEpisodes([]);
          setExpandedSeasons({});
          setCast([]);
          setCrew([]);
          setRecommendedShows([]);
          setMobileBannerUrl(null);
          setIsAdded(false);
          return;
        }

        const fallbackEpisodes = Array.isArray(extras?.episodes)
          ? extras.episodes
          : [];

        const normalizedEpisodes =
          dbEpisodes.length > 0
            ? dbEpisodes
            : fallbackEpisodes.map((row, index) =>
                normalizeEpisodePayload(row, index, tvdbId)
              );

        const seasonMap = {};
        normalizedEpisodes.forEach((ep) => {
          const seasonKey = Number(ep.seasonNumber ?? 0);
          if (seasonKey === 0) return;
          if (!(seasonKey in seasonMap)) seasonMap[seasonKey] = false;
        });

        const castRows = Array.isArray(extras?.cast) ? extras.cast : [];
        const crewRows = Array.isArray(extras?.crew) ? extras.crew : [];
        const fallbackRecommendations = Array.isArray(extras?.recommendations)
          ? extras.recommendations
          : [];
        const trailerData = extras?.trailer || null;

        setShow({
          ...normalizedShow,
          trailer: trailerData,
        });
        setEpisodes(normalizedEpisodes);
        setExpandedSeasons(seasonMap);
        setCast(castRows);
        setCrew(crewRows);
        setRecommendedShows(fallbackRecommendations);
        setMobileBannerUrl(getBannerFromExtras(extras) || null);
        setExpandedOverview(false);
        setActiveTab("seasons");
      } catch (err) {
        console.error("Failed loading show:", err);
        setError(err.message || "Failed loading show");
        setShow(null);
        setEpisodes([]);
        setExpandedSeasons({});
        setCast([]);
        setCrew([]);
        setRecommendedShows([]);
        setMobileBannerUrl(null);
        setIsAdded(false);
      } finally {
        setLoading(false);
      }
    }

    loadShow();
  }, [id]);

  const groupedSeasons = useMemo(() => {
    const grouped = {};

    for (const ep of episodes) {
      const seasonKey = Number(ep.seasonNumber ?? 0);
      if (seasonKey === 0) continue;
      if (!grouped[seasonKey]) grouped[seasonKey] = [];
      grouped[seasonKey].push(ep);
    }

    return Object.entries(grouped)
      .sort(sortSeasonGroups)
      .map(([seasonNumber, seasonEpisodes]) => ({
        seasonNumber: Number(seasonNumber),
        label: `Season ${seasonNumber}`,
        episodes: seasonEpisodes,
        totalCount: seasonEpisodes.length,
      }));
  }, [episodes]);

  const stats = useMemo(() => {
    const mainEpisodes = episodes.filter(
      (ep) => Number(ep.seasonNumber ?? 0) !== 0
    );

    return {
      total: mainEpisodes.length,
      totalSeasons: groupedSeasons.length,
    };
  }, [episodes, groupedSeasons]);

  const sourceYear = getYear(show?.first_aired);
  const sourceRating =
    show?.rating_average != null && !Number.isNaN(Number(show.rating_average))
      ? Number(show.rating_average).toFixed(1)
      : "";
  const sourceLanguage = show?.original_language || "";

  const tmdbRating =
    show?.rating_average != null && !Number.isNaN(Number(show.rating_average))
      ? Number(show.rating_average).toFixed(1)
      : "—";

  const rankdRating =
    show?.rankd_average != null && !Number.isNaN(Number(show.rankd_average))
      ? Number(show.rankd_average).toFixed(1)
      : "—";

  const baseContext = `sourceShowId=${encodeURIComponent(
    show?.tvdb_id || ""
  )}&sourceYear=${encodeURIComponent(
    sourceYear
  )}&sourceRating=${encodeURIComponent(
    sourceRating
  )}&sourceLanguage=${encodeURIComponent(sourceLanguage)}`;

  function toggleSeason(seasonNumber) {
    setExpandedSeasons((prev) => ({
      ...prev,
      [seasonNumber]: !prev[seasonNumber],
    }));
  }

  async function handleAddShow() {
    if (!viewer) {
      setError("Please log in to add this show.");
      return;
    }

    if (!show?.tvdb_id) {
      setError("This show cannot be added yet because it has no TVDB id.");
      return;
    }

    setAdding(true);
    setError("");

    try {
      await addShowToUserList({
        tvdb_id: Number(show.tvdb_id),
        name: show.show_name || "Unknown Show",
        poster_url: show.poster_url || null,
        overview: show.overview || null,
        first_air_date: show.first_aired || null,
        status: show.status || null,
      });

      setIsAdded(true);
      navigate(`/my-shows/${show.tvdb_id}`, { replace: true });
    } catch (err) {
      console.error("Failed to add show:", err);
      setError(err.message || "Failed to add show.");
    } finally {
      setAdding(false);
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
            <p>{error || "Show not found."}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="msd-page">
      <div className="msd-shell">
        <section className="msd-mobile-banner-wrap">
          <div
            className={`msd-mobile-banner ${
              mobileBannerUrl ? "" : "msd-mobile-banner-fallback"
            }`}
            style={
              mobileBannerUrl
                ? { backgroundImage: `url(${mobileBannerUrl})` }
                : undefined
            }
          />
        </section>

        <section className="msd-hero">
          <div className="msd-hero-poster-wrap">
            {show.poster_url ? (
              <img
                src={show.poster_url}
                alt={show.show_name}
                className="msd-poster"
              />
            ) : null}
          </div>

          <div className="msd-hero-main msd-hero-main-mobile">
            <div className="msd-mobile-top-row">
              <div className="msd-mobile-title-wrap">
                <h1 className="msd-title">{show.show_name}</h1>
                {show.first_aired ? (
                  <>
                    <div className="msd-mobile-year">
                      {new Date(show.first_aired).getFullYear()}
                    </div>
                    <div className="msd-mobile-first-aired">
                      First aired: {formatDate(show.first_aired)}
                    </div>
                  </>
                ) : null}
              </div>

              {show.poster_url ? (
                <img
                  src={show.poster_url}
                  alt={show.show_name}
                  className="msd-mobile-thumb"
                />
              ) : null}
            </div>

            {show.overview ? (
              <div className="msd-overview-wrapper">
                <p
                  className={`msd-overview msd-overview-mobile ${
                    expandedOverview ? "expanded" : "collapsed"
                  }`}
                >
                  {show.overview}
                </p>

                <button
                  type="button"
                  className="msd-overview-dots"
                  onClick={() => setExpandedOverview((prev) => !prev)}
                  aria-label={
                    expandedOverview ? "Collapse overview" : "Expand overview"
                  }
                >
                  •••
                </button>
              </div>
            ) : null}

            <div className="msd-stats-row msd-stats-row-top msd-stats-row-four">
              <div className="msd-stat-box">
                <span className="msd-stat-label">Seasons</span>
                <strong className="msd-stat-value">{stats.totalSeasons}</strong>
              </div>

              <div className="msd-stat-box">
                <span className="msd-stat-label">Episodes</span>
                <strong className="msd-stat-value">{stats.total}</strong>
              </div>

              <div className="msd-stat-box">
                <span className="msd-stat-label">Rating</span>
                <strong className="msd-stat-value">{tmdbRating}</strong>
              </div>

              <div className="msd-stat-box">
                <span className="msd-stat-label">Rank'd</span>
                <strong className="msd-stat-value">{rankdRating}</strong>
              </div>
            </div>

            {error ? (
              <p style={{ color: "#fca5a5", marginTop: "14px" }}>{error}</p>
            ) : null}
          </div>
        </section>

        <section className="msd-content-tabs-section">
          <div
            className="msd-content-tabs"
            role="tablist"
            aria-label="Show sections"
          >
            <button
              type="button"
              className={`msd-content-tab ${
                activeTab === "seasons" ? "is-active" : ""
              }`}
              onClick={() => setActiveTab("seasons")}
            >
              Seasons
            </button>

            <button
              type="button"
              className={`msd-content-tab ${
                activeTab === "cast" ? "is-active" : ""
              }`}
              onClick={() => setActiveTab("cast")}
            >
              Cast
            </button>

            <button
              type="button"
              className={`msd-content-tab ${
                activeTab === "crew" ? "is-active" : ""
              }`}
              onClick={() => setActiveTab("crew")}
            >
              Crew
            </button>

            <button
              type="button"
              className={`msd-content-tab ${
                activeTab === "studio" ? "is-active" : ""
              }`}
              onClick={() => setActiveTab("studio")}
            >
              Studio
            </button>

            <button
              type="button"
              className={`msd-content-tab ${
                activeTab === "genre" ? "is-active" : ""
              }`}
              onClick={() => setActiveTab("genre")}
            >
              Genre
            </button>
          </div>

          <div className="msd-tab-panel">
            {activeTab === "seasons" && (
              <>
                <h2 className="msd-section-title">Seasons</h2>
                <div className="msd-seasons">
                  {groupedSeasons.map((season) => (
                    <section
                      key={season.seasonNumber}
                      className="msd-season-card"
                    >
                      <button
                        type="button"
                        className="msd-season-toggle"
                        onClick={() => toggleSeason(season.seasonNumber)}
                      >
                        <div>
                          <div className="msd-season-title">{season.label}</div>
                          <div className="msd-season-subtitle">
                            {season.totalCount} episodes
                          </div>
                        </div>
                        <div className="msd-season-toggle-right">
                          <span className="msd-season-chevron">
                            {expandedSeasons[season.seasonNumber] ? "▲" : "▼"}
                          </span>
                        </div>
                      </button>

                      {expandedSeasons[season.seasonNumber] && (
                        <div className="msd-episode-list">
                          {season.episodes.map((ep) => {
                            const isExpanded = !!expandedEpisodeOverviewIds[ep.id];

                            return (
                              <article key={ep.id} className="msd-episode-card">
                                <div
                                  className={`msd-episode-hero ${
                                    ep.image ? "" : "msd-episode-hero-fallback"
                                  }`}
                                  style={
                                    ep.image
                                      ? { backgroundImage: `url(${ep.image})` }
                                      : undefined
                                  }
                                >
                                  <div className="msd-episode-hero-overlay">
                                    <div className="msd-episode-hero-text">
                                      <h3 className="msd-episode-hero-title">
                                        {makeEpisodeCode(ep)} - {ep.name}
                                      </h3>
                                      <div className="msd-episode-hero-date">
                                        Air date: {formatDate(ep.aired)}
                                      </div>
                                    </div>
                                  </div>
                                </div>

                                <button
                                  type="button"
                                  className="msd-episode-more-btn"
                                  onClick={() =>
                                    setExpandedEpisodeOverviewIds((prev) => ({
                                      ...prev,
                                      [ep.id]: !prev[ep.id],
                                    }))
                                  }
                                  aria-label={
                                    isExpanded
                                      ? "Hide episode overview"
                                      : "Show episode overview"
                                  }
                                >
                                  •••
                                </button>

                                {isExpanded && ep.overview ? (
                                  <p className="msd-episode-overview msd-episode-overview-mobile-card">
                                    {ep.overview}
                                  </p>
                                ) : null}
                              </article>
                            );
                          })}
                        </div>
                      )}
                    </section>
                  ))}
                </div>
              </>
            )}

            {activeTab === "cast" && (
              <>
                <h2 className="msd-section-title">Cast</h2>
                {extrasLoading ? (
                  <p className="msd-muted">Loading cast...</p>
                ) : cast.length > 0 ? (
                  <div className="msd-cast-grid msd-cast-grid-mobile">
                    {cast.map((member, index) => (
                      <div
                        key={member.id || `${member.personName}-${index}`}
                        className="msd-cast-card msd-cast-card-mobile"
                      >
                        {member.image ? (
                          <img
                            src={member.image}
                            alt={member.personName || "Cast member"}
                            className="msd-cast-image msd-cast-image-mobile"
                          />
                        ) : (
                          <div className="msd-cast-image msd-cast-image-mobile msd-cast-placeholder" />
                        )}
                        <div className="msd-cast-name">
                          {member.personName || "Unknown actor"}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="msd-muted">No cast available.</p>
                )}
              </>
            )}

            {activeTab === "crew" && (
              <>
                <h2 className="msd-section-title">Crew</h2>
                {extrasLoading ? (
                  <p className="msd-muted">Loading crew...</p>
                ) : crew.length > 0 ? (
                  <div className="msd-cast-grid msd-cast-grid-mobile">
                    {crew.map((member, index) => {
                      const personName = member.personName || "Unknown crew";

                      return (
                        <div
                          key={member.id || `${personName}-${index}`}
                          className="msd-cast-card msd-cast-card-mobile"
                        >
                          {member.image ? (
                            <img
                              src={member.image}
                              alt={personName}
                              className="msd-cast-image msd-cast-image-mobile"
                            />
                          ) : (
                            <div className="msd-cast-image msd-cast-image-mobile msd-cast-placeholder" />
                          )}
                          <div className="msd-cast-name">{personName}</div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="msd-muted">No crew available yet.</p>
                )}
              </>
            )}

            {activeTab === "studio" && (
              <>
                <h2 className="msd-section-title">Studio</h2>
                <div className="msd-info-grid">
                  <div className="msd-info-card">
                    <span className="msd-stat-label">Studio</span>
                    <strong className="msd-stat-value">
                      {show.network ? (
                        <Link
                          to={`/search?network=${encodeURIComponent(
                            show.network
                          )}&${baseContext}`}
                          className="msd-link"
                        >
                          {show.network}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </strong>
                  </div>
                </div>
              </>
            )}

            {activeTab === "genre" && (
              <>
                <h2 className="msd-section-title">Genre</h2>
                <div className="msd-info-grid">
                  {show.genres?.length > 0 ? (
                    show.genres.map((genre) => (
                      <div key={genre} className="msd-info-card">
                        <Link
                          to={`/search?genre=${encodeURIComponent(
                            genre
                          )}&${baseContext}`}
                          className="msd-link msd-info-link"
                        >
                          {genre}
                        </Link>
                      </div>
                    ))
                  ) : (
                    <p className="msd-muted">No genres available.</p>
                  )}
                </div>
              </>
            )}
          </div>
        </section>

       <section className="msd-panel">
  <h2 className="msd-section-title">Recommended Shows</h2>
  {extrasLoading ? (
    <p className="msd-muted">Loading recommendations...</p>
  ) : recommendedShows.length > 0 ? (
    <div className="msd-recommended-row">
      {recommendedShows.map((rec, index) => {
        const mapped = normalizeMappedShow(rec);
        const linkTarget = getMappedShowHref(mapped);

        const showName = mapped.name || mapped.title || "Unknown show";
        const posterSrc =
          mapped.poster_url ||
          mapped.posterUrl ||
          mapped.image_url ||
          mapped.image ||
          (mapped.poster_path
            ? `https://image.tmdb.org/t/p/w500${mapped.poster_path}`
            : "");

        if (!linkTarget || linkTarget === "#") {
          return (
            <div
              key={mapped.id || `${showName}-${index}`}
              className="msd-recommended-card"
            >
              {posterSrc ? (
                <img
                  src={posterSrc}
                  alt={showName}
                  className="msd-recommended-card-image"
                />
              ) : (
                <div className="msd-recommended-card-image-placeholder">
                  {showName.charAt(0)}
                </div>
              )}
            </div>
          );
        }

        return (
          <Link
            key={mapped.id || `${showName}-${index}`}
            to={linkTarget}
            className="msd-recommended-card"
          >
            {posterSrc ? (
              <img
                src={posterSrc}
                alt={showName}
                className="msd-recommended-card-image"
              />
            ) : (
              <div className="msd-recommended-card-image-placeholder">
                {showName.charAt(0)}
              </div>
            )}
          </Link>
        );
      })}
    </div>
  ) : (
    <p className="msd-muted">No recommendations yet.</p>
  )}
</section>

{!isAdded ? (
  <div className="msd-bottom-action-bar">
    <button
      type="button"
      className="msd-bottom-action-btn msd-bottom-action-btn-primary"
      onClick={handleAddShow}
      disabled={adding}
    >
      {adding ? "Adding..." : "Add to My Shows"}
    </button>
  </div>
) : (
  <div className="msd-bottom-action-bar">
    <Link
      to={`/my-shows/${show.tvdb_id}`}
      className="msd-bottom-action-btn msd-bottom-action-btn-primary"
      style={{
        textDecoration: "none",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      Open in My Shows
    </Link>
  </div>
)}
