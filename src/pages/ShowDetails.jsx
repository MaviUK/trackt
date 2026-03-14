import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
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

export default function ShowDetails() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [show, setShow] = useState(null);
  const [episodes, setEpisodes] = useState([]);
  const [expandedSeasons, setExpandedSeasons] = useState({});
  const [alreadySaved, setAlreadySaved] = useState(false);

  useEffect(() => {
    async function loadShow() {
      setLoading(true);

      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (user) {
          const { data: savedShow } = await supabase
            .from("user_shows")
            .select("tvdb_id")
            .eq("user_id", user.id)
            .eq("tvdb_id", id)
            .maybeSingle();

          setAlreadySaved(!!savedShow);
        } else {
          setAlreadySaved(false);
        }

        const res = await fetch(
          `/.netlify/functions/getShowById?id=${encodeURIComponent(id)}`
        );
        const data = await res.json();

        if (!res.ok) {
          throw new Error(data?.message || "Failed to load show");
        }

        const normalizedShow = {
          tvdb_id: String(data.tvdb_id || data.id || id),
          show_name: data.show_name || data.name || "Unknown Show",
          poster_url: data.poster_url || data.image_url || data.image || "",
          overview: data.overview || "",
          first_aired: data.first_aired || data.first_air_time || data.aired || null,
        };

        const eps = await getCachedEpisodes(id);
        const filteredEpisodes = (eps || [])
          .filter((ep) => ep.seasonNumber > 0)
          .sort((a, b) => {
            if (a.seasonNumber !== b.seasonNumber) {
              return a.seasonNumber - b.seasonNumber;
            }
            return a.number - b.number;
          });

        const seasonMap = {};
        filteredEpisodes.forEach((ep) => {
          if (!(ep.seasonNumber in seasonMap)) {
            seasonMap[ep.seasonNumber] = false;
          }
        });

        setShow(normalizedShow);
        setEpisodes(filteredEpisodes);
        setExpandedSeasons(seasonMap);
      } catch (error) {
        console.error("Failed loading show:", error);
        setShow(null);
      } finally {
        setLoading(false);
      }
    }

    loadShow();
  }, [id]);

  const groupedSeasons = useMemo(() => {
    const grouped = {};

    for (const ep of episodes) {
      if (!grouped[ep.seasonNumber]) grouped[ep.seasonNumber] = [];
      grouped[ep.seasonNumber].push(ep);
    }

    return Object.entries(grouped)
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([seasonNumber, seasonEpisodes]) => ({
        seasonNumber: Number(seasonNumber),
        episodes: seasonEpisodes,
      }));
  }, [episodes]);

  const nextEpisode = useMemo(() => {
    return episodes.find((ep) => isFuture(ep.aired));
  }, [episodes]);

  function toggleSeason(seasonNumber) {
    setExpandedSeasons((prev) => ({
      ...prev,
      [seasonNumber]: !prev[seasonNumber],
    }));
  }

async function handleAddShow() {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !show) {
    navigate("/login");
    return;
  }

  setAdding(true);

  try {
    const tvdbId = String(show.tvdb_id);

    const { data: existing, error: existingError } = await supabase
      .from("user_shows")
      .select("tvdb_id")
      .eq("user_id", user.id)
      .eq("tvdb_id", tvdbId)
      .maybeSingle();

    if (existingError) {
      throw existingError;
    }

    if (existing) {
      setAlreadySaved(true);
      navigate(`/my-shows/${tvdbId}`);
      return;
    }

    const payload = {
      user_id: user.id,
      tvdb_id: tvdbId,
      show_name: show.show_name,
      poster_url: show.poster_url || null,
      overview: show.overview || null,
      first_aired: show.first_aired || null,
    };

    const { error: insertError } = await supabase
      .from("user_shows")
      .insert(payload);

    if (insertError) {
      throw insertError;
    }

    setAlreadySaved(true);
    navigate(`/my-shows/${tvdbId}`);
  } catch (error) {
    console.error("Failed to add show:", error);
    alert(error.message || "Failed to add show");
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

              {nextEpisode ? (
                <div>
                  Next episode: {formatDate(nextEpisode.aired)} (
                  {getDaysUntil(nextEpisode.aired) === 0
                    ? "TODAY"
                    : getDaysUntil(nextEpisode.aired) === 1
                    ? "IN 1 DAY"
                    : `IN ${getDaysUntil(nextEpisode.aired)} DAYS`}
                  )
                </div>
              ) : null}
            </div>

            <div className="msd-actions" style={{ marginTop: '16px' }}>
              {alreadySaved ? (
                <Link
                  to={`/my-shows/${show.tvdb_id}`}
                  className="msd-btn msd-btn-secondary"
                  style={{ textDecoration: "none" }}
                >
                  View in My Shows
                </Link>
              ) : (
                <button
                  type="button"
                  className="msd-btn msd-btn-primary"
                  onClick={handleAddShow}
                  disabled={adding}
                >
                  {adding ? "Adding..." : "Add to My Shows"}
                </button>
              )}
            </div>
          </div>
        </section>

        {groupedSeasons.length > 0 && (
          <section className="msd-episodes-section">
            <h2 className="msd-section-title">Episodes</h2>

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
                      <div className="msd-season-title">
                        Season {season.seasonNumber}
                      </div>
                      <div className="msd-season-subtitle">
                        {season.episodes.length} episodes
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
                                {getEpisodeCode(ep)} - {ep.name}
                              </h3>
                              <div className="msd-episode-date">
                                Air date: {formatDate(ep.aired)}
                              </div>
                            </div>
                          </div>

                          {ep.overview ? (
                            <p className="msd-episode-overview">{ep.overview}</p>
                          ) : null}
                        </article>
                      ))}
                    </div>
                  )}
                </section>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
