import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { formatDate } from "../lib/date";
import { supabase } from "../lib/supabase";
import { addShowToUserList } from "../lib/userShows";

export default function ActorShows() {
  const { name } = useParams();

  const [loading, setLoading] = useState(true);
  const [shows, setShows] = useState([]);
  const [error, setError] = useState("");
  const [addingId, setAddingId] = useState(null);
  const [savedIds, setSavedIds] = useState(new Set());

  async function markAlreadySaved(results) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user || !results.length) {
      setSavedIds(new Set());
      return;
    }

    const tvdbIds = results
      .map((show) => Number(show.tvdb_id))
      .filter(Boolean);

    if (!tvdbIds.length) {
      setSavedIds(new Set());
      return;
    }

    const { data, error } = await supabase
      .from("user_shows_new")
      .select("show_id, shows!inner(tvdb_id)")
      .eq("user_id", user.id);

    if (error) {
      console.error("Failed checking saved shows:", error);
      setSavedIds(new Set());
      return;
    }

    const matchedIds = new Set(
      (data || [])
        .map((row) => row.shows?.tvdb_id)
        .filter((id) => tvdbIds.includes(Number(id)))
        .map(String)
    );

    setSavedIds(matchedIds);
  }

  useEffect(() => {
    async function loadActorShows() {
      if (!name) {
        setShows([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError("");

      try {
        const res = await fetch(
          `/.netlify/functions/getActorShows?name=${encodeURIComponent(name)}`
        );
        const data = await res.json();

        if (!res.ok) {
          throw new Error(data?.message || "Failed to load actor shows");
        }

        const results = Array.isArray(data) ? data : [];
        setShows(results);
        await markAlreadySaved(results);
      } catch (err) {
        console.error("Failed loading actor shows:", err);
        setError(err.message || "Failed loading actor shows");
        setShows([]);
        setSavedIds(new Set());
      } finally {
        setLoading(false);
      }
    }

    loadActorShows();
  }, [name]);

  async function handleAddShow(event, show) {
    event.preventDefault();
    event.stopPropagation();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError("Please log in to add shows.");
      return;
    }

    if (!show.tvdb_id) {
      setError("This show is TMDB-only right now and cannot be added yet.");
      return;
    }

    const tvdbId = String(show.tvdb_id);
    setAddingId(tvdbId);
    setError("");

    try {
      await addShowToUserList({
        tvdb_id: Number(show.tvdb_id),
        name: show.name || show.show_name || "Unknown Show",
        poster_url: show.image_url || show.poster_url || null,
        overview: show.overview || null,
        first_air_date: show.first_air_time || show.first_aired || null,
        status: show.status || null,
      });

      setSavedIds((prev) => {
        const next = new Set(prev);
        next.add(tvdbId);
        return next;
      });
    } catch (err) {
      console.error("Failed to add show:", err);
      setError(err.message || "Failed to add show.");
    } finally {
      setAddingId(null);
    }
  }

  return (
    <div className="page">
      <div className="page-shell">
        <div className="page-header">
          <h1>{decodeURIComponent(name || "")}</h1>
          <p>TV shows this actor appears in.</p>
        </div>

        <div style={{ marginBottom: "18px" }}>
          <Link to="/search" className="msd-back-link">
            ← Back to Search
          </Link>
        </div>

        {loading ? (
          <p style={{ color: "#cbd5e1" }}>Loading actor shows...</p>
        ) : error ? (
          <p style={{ color: "#fca5a5" }}>{error}</p>
        ) : shows.length === 0 ? (
          <p style={{ color: "#cbd5e1" }}>No TV shows found for this actor.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            {shows.map((show) => {
              const itemId = String(show.tvdb_id || show.tmdb_id || show.id);
              const tvdbId = show.tvdb_id ? String(show.tvdb_id) : null;
              const isSaved = tvdbId ? savedIds.has(tvdbId) : false;
              const isAdding = addingId === tvdbId;
              const canAdd = !!tvdbId;

              const detailHref = tvdbId
                ? isSaved
                  ? `/my-shows/${tvdbId}`
                  : `/show/${tvdbId}`
                : null;

              const poster = show.image_url || show.poster_url || null;

              return (
                <div
                  key={itemId}
                  className="show-card"
                  style={{ padding: "14px" }}
                >
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "88px minmax(0, 1fr)",
                      gap: "14px",
                      alignItems: "start",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "10px",
                        alignItems: "stretch",
                      }}
                    >
                      {detailHref ? (
                        <Link to={detailHref} style={{ display: "block" }}>
                          {poster ? (
                            <img
                              src={poster}
                              alt={show.name || "Show poster"}
                              style={{
                                width: "88px",
                                height: "128px",
                                borderRadius: "12px",
                                objectFit: "cover",
                                display: "block",
                                background: "#111827",
                              }}
                            />
                          ) : (
                            <div
                              style={{
                                width: "88px",
                                height: "128px",
                                borderRadius: "12px",
                                background: "#111827",
                              }}
                            />
                          )}
                        </Link>
                      ) : poster ? (
                        <img
                          src={poster}
                          alt={show.name || "Show poster"}
                          style={{
                            width: "88px",
                            height: "128px",
                            borderRadius: "12px",
                            objectFit: "cover",
                            display: "block",
                            background: "#111827",
                          }}
                        />
                      ) : (
                        <div
                          style={{
                            width: "88px",
                            height: "128px",
                            borderRadius: "12px",
                            background: "#111827",
                          }}
                        />
                      )}

                      <button
                        type="button"
                        onClick={(e) => handleAddShow(e, show)}
                        disabled={!canAdd || isSaved || isAdding}
                        className={`msd-btn ${
                          isSaved ? "msd-btn-success" : "msd-btn-primary"
                        }`}
                        style={{
                          width: "100%",
                          padding: "9px 10px",
                          fontSize: "0.9rem",
                        }}
                        title={!canAdd ? "TMDB-only result cannot be added yet" : ""}
                      >
                        {!canAdd
                          ? "TMDB Only"
                          : isSaved
                          ? "Added"
                          : isAdding
                          ? "Adding..."
                          : "Add"}
                      </button>
                    </div>

                    <div style={{ minWidth: 0 }}>
                      {detailHref ? (
                        <Link
                          to={detailHref}
                          style={{
                            textDecoration: "none",
                            color: "inherit",
                            minWidth: 0,
                          }}
                        >
                          <div
                            style={{
                              fontSize: "1.05rem",
                              fontWeight: "800",
                              color: "#f8fafc",
                              marginBottom: "8px",
                              lineHeight: "1.2",
                            }}
                          >
                            {show.name || "Unknown title"}
                          </div>
                        </Link>
                      ) : (
                        <div
                          style={{
                            fontSize: "1.05rem",
                            fontWeight: "800",
                            color: "#f8fafc",
                            marginBottom: "8px",
                            lineHeight: "1.2",
                          }}
                        >
                          {show.name || "Unknown title"}
                        </div>
                      )}

                      {(show.first_air_time || show.first_aired) && (
                        <p
                          style={{
                            margin: "0 0 10px 0",
                            color: "#cbd5e1",
                            fontWeight: "600",
                          }}
                        >
                          First aired:{" "}
                          {formatDate(show.first_air_time || show.first_aired)}
                        </p>
                      )}

                      {show.network && (
                        <p
                          style={{
                            margin: "0 0 10px 0",
                            color: "#93c5fd",
                            fontWeight: "600",
                          }}
                        >
                          Network: {show.network}
                        </p>
                      )}

                      {show.overview && (
                        <p
                          style={{
                            margin: 0,
                            color: "#dbe4f3",
                            lineHeight: "1.45",
                          }}
                        >
                          {show.overview.length > 180
                            ? `${show.overview.slice(0, 180)}...`
                            : show.overview}
                        </p>
                      )}

                      {detailHref ? (
                        <div style={{ marginTop: "12px" }}>
                          <Link
                            to={detailHref}
                            style={{
                              color: "#93c5fd",
                              fontWeight: 700,
                              textDecoration: "none",
                            }}
                          >
                            {isSaved ? "Open in My Shows →" : "View details →"}
                          </Link>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
