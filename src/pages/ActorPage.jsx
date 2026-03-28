import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { addShowToUserList } from "../lib/userShows";
import { supabase } from "../lib/supabase";
import { formatDate } from "../lib/date";
import {
  getMappedShowHref,
  isMappedToTvdb,
  normalizeMappedShow,
} from "../lib/tmdbMappings";
import "./ActorPage.css";

export default function ActorPage() {
  const { name } = useParams();

  const [loading, setLoading] = useState(true);
  const [actor, setActor] = useState(null);
  const [credits, setCredits] = useState([]);
  const [error, setError] = useState("");
  const [addingId, setAddingId] = useState(null);
  const [savedIds, setSavedIds] = useState(new Set());

  useEffect(() => {
    let cancelled = false;

    async function loadSavedShows() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        if (!cancelled) setSavedIds(new Set());
        return;
      }

      const { data, error } = await supabase
        .from("user_shows_new")
        .select("shows!inner(tvdb_id)")
        .eq("user_id", user.id);

      if (error) {
        console.warn("Failed loading saved ids", error);
        return;
      }

      const ids = new Set(
        (data || [])
          .map((row) => row?.shows?.tvdb_id)
          .filter(Boolean)
          .map(String)
      );

      if (!cancelled) {
        setSavedIds(ids);
      }
    }

    async function loadActor() {
      setLoading(true);
      setError("");

      try {
        const response = await fetch(
          `/.netlify/functions/getActorShows?name=${encodeURIComponent(name)}`
        );
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data?.message || "Failed to load actor shows");
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
                ? `https://image.tmdb.org/t/p/w500${item.poster_path}`
                : ""),
          })
        );

        if (!cancelled) {
          setActor(data?.actor || null);
          setCredits(normalizedCredits);
        }

        await loadSavedShows();
      } catch (err) {
        if (!cancelled) {
          setError(err?.message || "Failed to load actor shows");
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

  async function handleAddShow(show) {
    if (!show?.resolved_tvdb_id || addingId) return;

    setAddingId(show.resolved_tvdb_id);

    try {
      await addShowToUserList(show.resolved_tvdb_id);
      setSavedIds((prev) => {
        const next = new Set(prev);
        next.add(String(show.resolved_tvdb_id));
        return next;
      });
    } catch (err) {
      console.error("Failed adding show", err);
      alert(err.message || "Failed to add show");
    } finally {
      setAddingId(null);
    }
  }

  if (loading) {
    return (
      <div className="actor-page">
        <div className="actor-shell">
          <div className="actor-loading">Loading actor...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="actor-page">
        <div className="actor-shell">
          <Link to="/search" className="actor-back-link">
            ← Back to Search
          </Link>
          <p className="actor-error">{error}</p>
        </div>
      </div>
    );
  }

  if (!actor) {
    return (
      <div className="actor-page">
        <div className="actor-shell">
          <Link to="/search" className="actor-back-link">
            ← Back to Search
          </Link>
          <p className="actor-error">Actor not found.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="actor-page">
      <div className="actor-shell">
        <Link to="/search" className="actor-back-link">
          ← Back to Search
        </Link>

        <section className="actor-hero">
          {actor.profile_url ? (
            <img
              src={actor.profile_url}
              alt={actor.name}
              className="actor-poster"
            />
          ) : (
            <div className="actor-poster actor-poster-empty">No image</div>
          )}

          <div className="actor-hero-main">
            <h1 className="actor-title">{actor.name}</h1>

            <div className="actor-meta">
              {actor.known_for_department ? (
                <div>{actor.known_for_department}</div>
              ) : null}
              {actor.birthday ? (
                <div>Born: {formatDate(actor.birthday)}</div>
              ) : null}
              {actor.place_of_birth ? (
                <div>{actor.place_of_birth}</div>
              ) : null}
            </div>

            {actor.biography ? (
              <p className="actor-overview">{actor.biography}</p>
            ) : (
              <p className="actor-overview actor-overview-muted">
                TV shows this actor appears in.
              </p>
            )}
          </div>
        </section>

        <section className="actor-shows-section">
          <h2 className="actor-section-title">Shows</h2>

          {credits.length === 0 ? (
            <p className="actor-empty">No TV shows found for this actor.</p>
          ) : (
            <div className="actor-shows-list">
              {credits.map((show, index) => {
                const showName = show.name || "Unknown show";
                const mapped = isMappedToTvdb(show);
                const href = getMappedShowHref(show);
                const alreadySaved = show?.resolved_tvdb_id
                  ? savedIds.has(String(show.resolved_tvdb_id))
                  : false;

                return (
                  <article
                    key={show.tmdb_id || show.id || `${showName}-${index}`}
                    className="actor-show-card"
                  >
                    <div className="actor-show-left">
                      {show.poster_url ? (
                        <img
                          src={show.poster_url}
                          alt={showName}
                          className="actor-show-poster"
                        />
                      ) : (
                        <div className="actor-show-poster actor-show-poster-empty">
                          No image
                        </div>
                      )}

                      {mapped ? (
                        alreadySaved ? (
                          <div className="actor-show-action actor-show-action-saved">
                            Added
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="actor-show-action"
                            disabled={addingId === show.resolved_tvdb_id}
                            onClick={() => handleAddShow(show)}
                          >
                            {addingId === show.resolved_tvdb_id
                              ? "Adding..."
                              : "Add"}
                          </button>
                        )
                      ) : null}
                    </div>

                    <div className="actor-show-body">
                      <h3 className="actor-show-title">{showName}</h3>

                      {show.first_air_date ? (
                        <div className="actor-show-date">
                          First aired: {formatDate(show.first_air_date)}
                        </div>
                      ) : null}

                      {show.character ? (
                        <div className="actor-show-character">
                          Character: {show.character}
                        </div>
                      ) : null}

                      {show.overview ? (
                        <p className="actor-show-overview">{show.overview}</p>
                      ) : null}

                      <div className="actor-show-links">
                        <Link to={href} className="actor-view-link">
                          {mapped ? "View details →" : "Search show →"}
                        </Link>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
