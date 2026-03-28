import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  getMappedShowHref,
  isMappedToTvdb,
  normalizeMappedShow,
} from "../lib/tmdbMappings";
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

        const rawCredits = Array.isArray(data?.credits) ? data.credits : [];

        const normalizedCredits = rawCredits.map((item) =>
          normalizeMappedShow({
            ...item,
            source: item?.source || "tmdb",
            name: item?.name || item?.title || item?.show_name || "Unknown show",
            first_air_date:
              item?.first_air_date || item?.firstAired || item?.first_aired || "",
            poster_url:
              item?.poster_url ||
              item?.posterUrl ||
              (item?.poster_path
                ? `https://image.tmdb.org/t/p/w342${item.poster_path}`
                : ""),
          })
        );

        if (!cancelled) {
          setActor(data?.actor || null);
          setCredits(normalizedCredits);
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
    return (
      <div className="actor-page">
        <p>Loading actor...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="actor-page">
        <p>{error}</p>
      </div>
    );
  }

  if (!actor) {
    return (
      <div className="actor-page">
        <p>Actor not found.</p>
      </div>
    );
  }

  return (
    <div className="actor-page">
      <Link to="/search" className="actor-back-link">
        ← Back to Search
      </Link>

      <div className="actor-header">
        <h1>{actor.name}</h1>
        <p>TV shows this actor appears in.</p>
      </div>

      <div className="actor-credits-list">
        {credits.map((show, index) => {
          const showName = show.name || "Unknown show";
          const mapped = isMappedToTvdb(show);
          const href = getMappedShowHref(show);

          return (
            <Link
              key={show.id || `${showName}-${index}`}
              to={href}
              className="actor-credit-card"
              style={{ textDecoration: "none", color: "inherit" }}
            >
              <div className="actor-credit-poster-wrap">
                {show.poster_url ? (
                  <img
                    src={show.poster_url}
                    alt={showName}
                    className="actor-credit-poster"
                  />
                ) : (
                  <div className="actor-credit-poster actor-credit-poster--empty">
                    No image
                  </div>
                )}

                <div className="actor-credit-badge">
                  {mapped ? "Open Show" : "TMDB Only"}
                </div>
              </div>

              <div className="actor-credit-body">
                <h2 className="actor-credit-title">{showName}</h2>

                {show.first_air_date ? (
                  <div className="actor-credit-date">
                    First aired: {formatDate(show.first_air_date)}
                  </div>
                ) : null}

                {show.character ? (
                  <div className="actor-credit-character">
                    Character: {show.character}
                  </div>
                ) : null}

                {show.overview ? (
                  <p className="actor-credit-overview">{show.overview}</p>
                ) : null}

                <div className="actor-credit-meta">
                  {mapped ? (
                    <span>TVDB {show.resolved_tvdb_id}</span>
                  ) : (
                    <span>Search fallback</span>
                  )}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
