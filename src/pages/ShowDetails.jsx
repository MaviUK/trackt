import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { formatDate } from "../lib/date";
import { addShowToUserList } from "../lib/userShows";
import "./MyShowDetails.css";

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
    extras.show?.backdropUrl ||
    extras.show?.banner_url ||
    extras.show?.bannerUrl ||
    extras.show?.background_url ||
    extras.show?.backgroundUrl ||
    null
  );
}

function normalizeShowPayload(showData, tvdbIdFallback) {
  if (!showData) return null;

  return {
    id: showData.id ?? null,
    tvdb_id: showData.tvdb_id ?? tvdbIdFallback ?? null,
    show_name: showData.name || showData.show_name || "Unknown title",
    overview: showData.overview || "",
    poster_url:
      showData.poster_url ||
      showData.image_url ||
      showData.image ||
      showData.poster ||
      null,
    first_aired:
      showData.first_aired ||
      showData.first_air_time ||
      showData.firstAired ||
      null,
    status: showData.status || null,
    network: showData.network || "",
    original_language:
      showData.original_language || showData.originalLanguage || "",
    genres: Array.isArray(showData.genres) ? showData.genres : [],
    relationship_types: Array.isArray(showData.relationship_types)
      ? showData.relationship_types
      : [],
    settings: Array.isArray(showData.settings) ? showData.settings : [],
    rating_average:
      showData.rating_average != null
        ? Number(showData.rating_average)
        : null,
    rating_count:
      showData.rating_count != null ? Number(showData.rating_count) : null,
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
    image: row.image_url || row.image || null,
    episode_code: row.episode_code || null,
  };
}

function normalizeRecommendation(rec) {
  return {
    id: rec?.id || rec?.tvdb_id || rec?.tvdbId || rec?.name,
    tvdb_id: rec?.tvdb_id || rec?.tvdbId || null,
    name: rec?.name || rec?.title || rec?.show_name || "Unknown show",
    poster_url:
      rec?.poster_url ||
      rec?.posterUrl ||
      rec?.image_url ||
      rec?.image ||
      (rec?.poster_path
        ? `https://image.tmdb.org/t/p/w500${rec.poster_path}`
        : ""),
    first_aired: rec?.first_aired || rec?.firstAired || null,
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
  const [providers, setProviders] = useState([]);
  const [trailer, setTrailer] = useState(null);
  const [mobileBannerUrl, setMobileBannerUrl] = useState(null);

  const [viewer, setViewer] = useState(null);
  const [isAdded, setIsAdded] = useState(false);

  const [activeTab, setActiveTab] = useState("seasons");
  const [expandedOverview, setExpandedOverview] = useState(false);

  useEffect(() => {
    async function loadShow() {
      setLoading(true);
      setExtrasLoading(false);
      setError("");
      setExpandedOverview(false);
      setActiveTab("seasons");

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
          setProviders([]);
          setTrailer(null);
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
              image_url
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
          console.error("Failed loading show extras:", extrasError);
        } finally {
          setExtrasLoading(false);
        }

        const fallbackShow =
          extras?.show || extras?.series || extras?.data || null;

        const normalizedShow = normalizeShowPayload(
          dbShow || fallbackShow,
          tvdbId
        );

        if (!normalizedShow) {
          setShow(null);
          setEpisodes([]);
          setExpandedSeasons({});
          setCast([]);
          setCrew([]);
          setRecommendedShows([]);
          setProviders([]);
          setTrailer(null);
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
          if (!(seasonKey in seasonMap)) {
            seasonMap[seasonKey] = false;
          }
        });

        setShow(normalizedShow);
        setEpisodes(normalizedEpisodes);
        setExpandedSeasons(seasonMap);
        setCast(Array.isArray(extras?.cast) ? extras.cast : []);
        setCrew(Array.isArray(extras?.crew) ? extras.crew : []);
        setRecommendedShows(
          (Array.isArray(extras?.peopleAlsoWatch) &&
          extras.peopleAlsoWatch.length > 0
            ? extras.peopleAlsoWatch
            : Array.isArray(extras?.recommendations)
            ? extras.recommendations
            : []
          ).map(normalizeRecommendation)
        );
        setProviders(Array.isArray(extras?.providers) ? extras.providers : []);
        setTrailer(extras?.trailer || null);
        setMobileBannerUrl(getBannerFromExtras(extras));
      } catch (err) {
        console.error("Failed loading show:", err);
        setError(err.message || "Failed loading show");
        setShow(null);
        setEpisodes([]);
        setExpandedSeasons({});
        setCast([]);
        setCrew([]);
        setRecommendedShows([]);
        setProviders([]);
        setTrailer(null);
        setMobileBannerUrl(null);
        setIsAdded(false);
      } finally {
        setLoading(false);
      }
    }

    loadShow();
  }, [id]);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
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
    const nextEpisode = mainEpisodes.find((ep) => isFuture(ep.aired));

    return {
      total: mainEpisodes.length,
      totalSeasons: groupedSeasons.length,
      nextEpisode,
    };
  }, [episodes, groupedSeasons]);

  const sourceYear = getYear(show?.first_aired);
  const sourceRating =
    show?.rating_average != null && !Number.isNaN(Number(show.rating_average))
      ? Number(show.rating_average).toFixed(1)
      : "";
  const sourceLanguage = show?.original_language || "";

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
            <p>Show not found.</p>
          </div>
        </div>
      </div>
    );
  }

  const streamingText =
    providers.length > 0
      ? providers.map((provider) => provider.name).join(", ")
      : "—";

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
                <span className="msd-stat-label">Status</span>
                <strong className="msd-stat-value">
                  {show.status || "—"}
                </strong>
              </div>

              <div className="msd-stat-box">
                <span className="msd-stat-label">Network</span>
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

            <div className="msd-stats-row msd-stats-row-top msd-stats-row-four">
              <div className="msd-stat-box">
                <span className="msd-stat-label">Next Episode</span>
                <strong className="msd-stat-value">
                  {stats.nextEpisode ? formatDate(stats.nextEpisode.aired) : "—"}
                </strong>
              </div>

              <div className="msd-stat-box">
                <span className="msd-stat-label">Countdown</span>
                <strong className="msd-stat-value">
                  {stats.nextEpisode
                    ? getDaysUntil(stats.nextEpisode.aired) === 0
                      ? "TODAY"
                      : getDaysUntil(stats.nextEpisode.aired) === 1
                      ? "1 day"
                      : `${getDaysUntil(stats.nextEpisode.aired)} days`
                    : "—"}
                </strong>
              </div>

              <div className="msd-stat-box">
                <span className="msd-stat-label">Language</span>
                <strong className="msd-stat-value">
                  {show.original_language || "—"}
                </strong>
              </div>

              <div className="msd-stat-box">
                <span className="msd-stat-label">Streaming</span>
                <strong className="msd-stat-value">{streamingText}</strong>
              </div>
            </div>

            <div className="msd-stat-box msd-stat-box-full">
              <span className="msd-stat-label">Genres</span>
              <strong className="msd-stat-value">
                {show.genres?.length > 0
                  ? show.genres.map((genre, index) => (
                      <span key={genre}>
                        <Link
                          to={`/search?genre=${encodeURIComponent(
                            genre
                          )}&${baseContext}`}
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

            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
              {isAdded ? (
                <Link
                  to={`/my-shows/${show.tvdb_id}`}
                  className="msd-btn msd-btn-success"
                >
                  Open in My Shows
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={handleAddShow}
                  disabled={adding}
                  className="msd-btn msd-btn-primary"
                >
                  {adding ? "Adding..." : "Add to My Shows"}
                </button>
              )}

              {trailer?.url ? (
                <a
                  href={trailer.url}
                  target="_blank"
                  rel="noreferrer"
                  className="msd-btn msd-btn-secondary"
                >
                  Watch Trailer
                </a>
              ) : null}
            </div>

            {!isAdded ? (
              <p style={{ color: "#cbd5e1", marginTop: "14px" }}>
                Add this show to unlock your tracked progress view.
              </p>
            ) : null}

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
                    <section key={season.seasonNumber} className="msd-season-card">
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
                          {season.episodes.map((ep) => (
                            <article key={ep.id} className="msd-episode-card">
                              <div className="msd-episode-top">
                                <div>
                                  <h3 className="msd-episode-title">
                                    {makeEpisodeCode(ep)} - {ep.name}
                                  </h3>
                                  <div className="msd-episode-date">
                                    Air date: {formatDate(ep.aired)}
                                  </div>
                                </div>
                              </div>

                              {ep.overview ? (
                                <p className="msd-episode-overview">
                                  {ep.overview}
                                </p>
                              ) : null}
                            </article>
                          ))}
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
                    {cast.map((member, index) => {
                      const actorName = member.personName || "Unknown actor";
                      const linkTarget = `/actor/${encodeURIComponent(actorName)}`;

                      return (
                        <Link
                          key={member.id || `${actorName}-${index}`}
                          to={linkTarget}
                          className="msd-cast-card msd-cast-card-mobile"
                          style={{ textDecoration: "none", color: "inherit" }}
                        >
                          {member.image ? (
                            <img
                              src={member.image}
                              alt={actorName}
                              className="msd-cast-image msd-cast-image-mobile"
                            />
                          ) : (
                            <div className="msd-cast-image msd-cast-image-mobile msd-cast-placeholder" />
                          )}
                          <div className="msd-cast-name">{actorName}</div>
                        </Link>
                      );
                    })}
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
                      const roleName =
                        member.role ||
                        member.job ||
                        member.characterName ||
                        "Crew";

                      return (
                        <div
                          key={member.id || `${personName}-${roleName}-${index}`}
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
                          <div className="msd-cast-role">{roleName}</div>
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
                const showName = rec.name || "Unknown show";
                const hasTvdbId = !!rec.tvdb_id;

                const content = rec.poster_url ? (
                  <img
                    src={rec.poster_url}
                    alt={showName}
                    className="msd-recommended-card-image"
                  />
                ) : (
                  <div className="msd-recommended-card-image-placeholder">
                    {showName.charAt(0)}
                  </div>
                );

                if (hasTvdbId) {
                  return (
                    <Link
                      key={rec.id || `${showName}-${index}`}
                      to={`/show/${rec.tvdb_id}`}
                      className="msd-recommended-card"
                    >
                      {content}
                    </Link>
                  );
                }

                return (
                  <div
                    key={rec.id || `${showName}-${index}`}
                    className="msd-recommended-card"
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
