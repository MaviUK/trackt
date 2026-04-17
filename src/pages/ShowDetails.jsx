import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { formatDate } from "../lib/date";
import { addShowToUserList } from "../lib/userShows";
import "./MyShowDetails.css";

function sortSeasonGroups(a, b) {
  const aNum = Number(a[0]);
  const bNum = Number(b[0]);

  if (aNum === 0 && bNum !== 0) return -1;
  if (bNum === 0 && aNum !== 0) return 1;
  return aNum - bNum;
}

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

function normalizeShowPayload(showData, tvdbIdFallback) {
  if (!showData) return null;

  return {
    id: showData.id ?? null,
    tvdb_id: showData.tvdb_id ?? tvdbIdFallback ?? null,
    show_name: showData.name || showData.show_name || "Unknown title",
    overview: showData.overview || "",
    poster_url:
      showData.poster_url || showData.image_url || showData.image || null,
    first_aired:
      showData.first_aired ||
      showData.first_air_time ||
      showData.firstAired ||
      null,
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
    rankd_average:
      showData.rankd_average != null
        ? Number(showData.rankd_average)
        : showData.average_rankd_rating != null
        ? Number(showData.average_rankd_rating)
        : null,
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
  const [recommendedShows, setRecommendedShows] = useState([]);
  const [peopleAlsoWatch, setPeopleAlsoWatch] = useState([]);
  const [trailer, setTrailer] = useState(null);

  const [viewer, setViewer] = useState(null);
  const [isAdded, setIsAdded] = useState(false);

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
          setRecommendedShows([]);
          setPeopleAlsoWatch([]);
          setTrailer(null);
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
            poster_url,
            first_aired,
            genres,
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
          console.error("Failed loading TVDB extras:", extrasError);
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
          setRecommendedShows([]);
          setPeopleAlsoWatch([]);
          setTrailer(null);
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
          if (seasonKey !== 0 && !(seasonKey in seasonMap)) {
            seasonMap[seasonKey] = false;
          }
        });

        const castRows = Array.isArray(extras?.cast) ? extras.cast : [];
        const tvdbPeopleAlsoWatch = Array.isArray(extras?.peopleAlsoWatch)
          ? extras.peopleAlsoWatch
          : [];
        const fallbackRecommendations = Array.isArray(extras?.recommendations)
          ? extras.recommendations
          : [];
        const trailerData = extras?.trailer || null;

        const safeShow = {
          ...normalizedShow,
          rankd_average:
            normalizedShow.rankd_average != null
              ? normalizedShow.rankd_average
              : extras?.rankd_average != null
              ? Number(extras.rankd_average)
              : extras?.average_rankd_rating != null
              ? Number(extras.average_rankd_rating)
              : null,
        };

        setShow(safeShow);
        setEpisodes(normalizedEpisodes);
        setExpandedSeasons(seasonMap);
        setCast(castRows);
        setPeopleAlsoWatch(tvdbPeopleAlsoWatch);
        setRecommendedShows(
          tvdbPeopleAlsoWatch.length > 0
            ? tvdbPeopleAlsoWatch
            : fallbackRecommendations
        );
        setTrailer(trailerData);
      } catch (err) {
        console.error("Failed loading show:", err);
        setError(err.message || "Failed loading show");
        setShow(null);
        setEpisodes([]);
        setExpandedSeasons({});
        setCast([]);
        setRecommendedShows([]);
        setPeopleAlsoWatch([]);
        setTrailer(null);
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
      totalEpisodes: mainEpisodes.length,
      totalSeasons: groupedSeasons.length,
    };
  }, [episodes, groupedSeasons]);

  const sourceYear = getYear(show?.first_aired);
  const tmdbRating =
    show?.rating_average != null && !Number.isNaN(Number(show.rating_average))
      ? Number(show.rating_average).toFixed(1)
      : "—";
  const rankdRating =
    show?.rankd_average != null && !Number.isNaN(Number(show.rankd_average))
      ? Number(show.rankd_average).toFixed(1)
      : "—";

  const sourceRating =
    show?.rating_average != null && !Number.isNaN(Number(show.rating_average))
      ? Number(show.rating_average).toFixed(1)
      : "";

  const baseContext = `sourceShowId=${encodeURIComponent(
    show?.tvdb_id || ""
  )}&sourceYear=${encodeURIComponent(
    sourceYear
  )}&sourceRating=${encodeURIComponent(sourceRating)}`;

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
            <Link to="/search" className="msd-back-link">
              Back to Search
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="msd-page">
      <div className="msd-shell">
        <Link to="/search" className="msd-back-link">
          ← Back to Search
        </Link>

        <section className="msd-hero">
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "12px",
              alignItems: "stretch",
            }}
          >
            {show.poster_url ? (
              <img
                src={show.poster_url}
                alt={show.show_name}
                className="msd-poster"
              />
            ) : null}

            {isAdded ? (
              <Link
                to={`/my-shows/${show.tvdb_id}`}
                className="msd-btn msd-btn-success"
                style={{ textAlign: "center" }}
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
          </div>

          <div className="msd-hero-main">
            <h1 className="msd-title">{show.show_name}</h1>

            {show.overview ? (
              <p className="msd-overview">{show.overview}</p>
            ) : null}

            <div className="msd-meta">
              {show.first_aired ? (
                <div>First aired: {formatDate(show.first_aired)}</div>
              ) : null}
            </div>

            <div className="msd-stats-row">
              <div className="msd-stat-box">
                <span className="msd-stat-label">Seasons</span>
                <strong className="msd-stat-value">{stats.totalSeasons}</strong>
              </div>

              <div className="msd-stat-box">
                <span className="msd-stat-label">Total Episodes</span>
                <strong className="msd-stat-value">
                  {stats.totalEpisodes}
                </strong>
              </div>

              <div className="msd-stat-box">
                <span className="msd-stat-label">TMDB Rating</span>
                <strong className="msd-stat-value">{tmdbRating}</strong>
              </div>

              <div className="msd-stat-box">
                <span className="msd-stat-label">Rank'd</span>
                <strong className="msd-stat-value">{rankdRating}</strong>
              </div>

              <div className="msd-stat-box">
                <span className="msd-stat-label">Genre</span>
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

              <div className="msd-stat-box msd-stat-box-wide">
                <span className="msd-stat-label">Play Trailer</span>
                <strong
                  className="msd-stat-value"
                  style={{ fontSize: "1rem" }}
                >
                  {trailer?.url ? (
                    <a
                      href={trailer.url}
                      target="_blank"
                      rel="noreferrer"
                      className="msd-link"
                    >
                      {trailer.name || "Watch Trailer"}
                    </a>
                  ) : (
                    "—"
                  )}
                </strong>
              </div>
            </div>

            {!isAdded ? (
              <p style={{ color: "#cbd5e1", marginTop: "14px" }}>
                Personal tracking appears after you add this show.
              </p>
            ) : null}

            {error ? (
              <p style={{ color: "#fca5a5", marginTop: "14px" }}>{error}</p>
            ) : null}
          </div>
        </section>

        <section className="msd-episodes-section">
          <h2 className="msd-section-title">Episodes</h2>
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
        </section>

        <section className="msd-panel msd-panel-spaced">
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
          <h2 className="msd-section-title">
            {peopleAlsoWatch.length > 0
              ? "People Also Watch"
              : "Recommended Shows"}
          </h2>
          {extrasLoading ? (
            <p className="msd-muted">Loading recommendations...</p>
          ) : recommendedShows.length > 0 ? (
            <div className="msd-recommended-grid">
              {recommendedShows.map((rec, index) => {
                const tvdbIdValue = rec.tvdb_id || rec.tvdbId;
                const hasTvdbId = !!tvdbIdValue;
                const linkTarget = hasTvdbId ? `/show/${tvdbIdValue}` : "#";

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
