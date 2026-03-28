import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getMappedShowHref, isMappedToTvdb } from "../lib/tmdbMappings";
import "./ActorPage.css";

function formatDate(dateValue) {
  if (!dateValue) return "";
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function getYear(dateValue) {
  if (!dateValue) return "";
  const match = String(dateValue).match(/^(\d{4})/);
  return match ? match[1] : "";
}

export default function ActorPage() {
  const { name } = useParams();
  const [loading, setLoading] = useState(true);
  const [actor, setActor] = useState(null);
  const [credits, setCredits] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadActor() {
      setLoading(true);
      setError("");

      try {
        const response = await fetch(
          `/.netlify/functions/getActorPageData?name=${encodeURIComponent(name)}`
        );
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data?.message || "Failed to load actor");
        }

        if (!cancelled) {
          setActor(data?.actor || null);
          setCredits(Array.isArray(data?.credits) ? data.credits : []);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err?.message || "Failed to load actor");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadActor();

    return () => {
      cancelled = true;
    };
  }, [name]);

  if (loading) {
    return <div className="actor-page"><p>Loading actor…</p></div>;
  }

  if (error) {
    return <div className="actor-page"><p>{error}</p></div>;
  }

  if (!actor) {
    return <div className="actor-page"><p>Actor not found.</p></div>;
  }

  return (
    <div className="actor-page">
      <div className="actor-header-card">
        <div className="actor-header-art">
          {actor.profile_url ? (
            <img src={actor.profile_url} alt={actor.name} />
          ) : (
            <div className="actor-header-placeholder">No Image</div>
          )}
        </div>

        <div className="actor-header-content">
          <p className="actor-kicker">Actor</p>
          <h1>{actor.name}</h1>

          <div className="actor-meta">
            {actor.known_for_department ? (
              <span>{actor.known_for_department}</span>
            ) : null}
            {actor.birthday ? <span>Born {formatDate(actor.birthday)}</span> : null}
            {actor.place_of_birth ? <span>{actor.place_of_birth}</span> : null}
          </div>

          {actor.biography ? (
            <p className="actor-biography">{actor.biography}</p>
          ) : (
            <p className="actor-biography actor-biography--muted">
              No biography available.
            </p>
          )}
        </div>
      </div>

      <div className="actor-section-header">
        <h2>TV shows</h2>
        <p>{credits.length} results</p>
      </div>

      <div className="actor-show-grid">
        {credits.map((show) => {
          const mapped = isMappedToTvdb(show);

          return (
            <article className="actor-show-card" key={show.id}>
              <Link to={getMappedShowHref(show)} className="actor-show-poster-link">
                {show.poster_url ? (
                  <img
                    className="actor-show-poster"
                    src={show.poster_url}
                    alt={show.name}
                  />
                ) : (
                  <div className="actor-show-poster actor-show-poster--placeholder">
                    No Poster
                  </div>
                )}
              </Link>

              <div className="actor-show-body">
                <div className="actor-show-topline">
                  <Link to={getMappedShowHref(show)} className="actor-show-title">
                    {show.name}
                  </Link>
                  {getYear(show.first_air_date) ? (
                    <span className="actor-show-year">
                      {getYear(show.first_air_date)}
                    </span>
                  ) : null}
                </div>

                {show.character ? (
                  <p className="actor-show-role">as {show.character}</p>
                ) : null}

                <div className="actor-show-stats">
                  {show.vote_average ? (
                    <span>TMDB {Number(show.vote_average).toFixed(1)}</span>
                  ) : null}
                  {show.episode_count ? (
                    <span>{show.episode_count} eps</span>
                  ) : null}
                  <span className={mapped ? "mapped-pill" : "fallback-pill"}>
                    {mapped ? "Mapped to TVDB" : "Search fallback"}
                  </span>
                </div>

                {show.overview ? (
                  <p className="actor-show-overview">{show.overview}</p>
                ) : null}

                <div className="actor-show-actions">
                  <Link to={getMappedShowHref(show)} className="actor-show-button">
                    {mapped ? "Open show" : "Search show"}
                  </Link>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
