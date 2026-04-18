import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { formatDate } from "../lib/date";
import "./ShowDetails.css";

function getEpisodeCount(seasons) {
  return (seasons || []).reduce(
    (total, season) => total + (Number(season?.episode_count) || 0),
    0
  );
}

export default function TmdbShowDetails() {
  const { tmdbId } = useParams();
  const [loading, setLoading] = useState(true);
  const [show, setShow] = useState(null);
  const [error, setError] = useState("");

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
          throw new Error(data?.message || "Failed to load TMDB show");
        }

        if (!cancelled) {
          setShow(data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err?.message || "Failed to load TMDB show");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadShow();

    return () => {
      cancelled = true;
    };
  }, [tmdbId]);

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

  const backdrop = show.backdrop_url || show.poster_url || "";
  const seasons = show.seasons || [];
  const episodeCount = getEpisodeCount(seasons);

  return (
    <div className="show-details-page">
      <div className="show-details-shell">
        <section
          className="show-details-hero"
          style={
            backdrop
              ? {
                  backgroundImage: `linear-gradient(180deg, rgba(7,11,20,0.25) 0%, rgba(7,11,20,0.82) 72%, rgba(7,11,20,0.96) 100%), url("${backdrop}")`,
                }
              : undefined
          }
        >
          <div className="show-details-hero-inner">
            <div className="show-details-main">
              <h1 className="show-details-title">{show.name}</h1>

              {show.first_air_date ? (
                <div className="show-details-subtitle">
                  First aired: {formatDate(show.first_air_date)}
                </div>
              ) : null}

              {show.overview ? (
                <p className="show-details-overview">{show.overview}</p>
              ) : null}

              <div className="show-details-stats">
                <div className="show-details-stat">
                  <span>Seasons</span>
                  <strong>{show.number_of_seasons || seasons.length || 0}</strong>
                </div>
                <div className="show-details-stat">
                  <span>Episodes</span>
                  <strong>{show.number_of_episodes || episodeCount || 0}</strong>
                </div>
                <div className="show-details-stat">
                  <span>Rating</span>
                  <strong>
                    {show.vote_average ? Number(show.vote_average).toFixed(1) : "—"}
                  </strong>
                </div>
              </div>

              <div className="show-details-note">
                TMDB fallback page
              </div>
            </div>
          </div>
        </section>

        <section className="show-details-section">
          <h2>Seasons</h2>

          {seasons.length === 0 ? (
            <div className="show-details-empty">No seasons available.</div>
          ) : (
            <div className="show-details-seasons">
              {seasons.map((season) => (
                <div
                  key={season.id || season.season_number}
                  className="show-details-season-card"
                >
                  <strong>{season.name || `Season ${season.season_number}`}</strong>
                  <div>
                    {season.air_date ? formatDate(season.air_date) : "No air date"}
                  </div>
                  <div>{season.episode_count || 0} episodes</div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
