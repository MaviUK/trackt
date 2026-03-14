import { useState } from "react";
import { Link } from "react-router-dom";
import { formatDate } from "../lib/date";
import { supabase } from "../lib/supabase";

export default function Search() {
  const [query, setQuery] = useState("");
  const [shows, setShows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [addingId, setAddingId] = useState(null);
  const [savedIds, setSavedIds] = useState(new Set());

  const search = async () => {
    if (!query.trim()) return;

    setLoading(true);
    setError("");

    try {
      const res = await fetch(
        `/.netlify/functions/searchShows?q=${encodeURIComponent(query)}`
      );
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.message || "Search failed");
      }

      setShows(data || []);
      await markAlreadySaved(data || []);
    } catch (err) {
      setError(err.message || "Search failed");
      setShows([]);
      setSavedIds(new Set());
    } finally {
      setLoading(false);
    }
  };

  const markAlreadySaved = async (results) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user || !results.length) {
      setSavedIds(new Set());
      return;
    }

    const ids = results.map((show) => String(show.tvdb_id || show.id));

    const { data, error } = await supabase
      .from("user_shows")
      .select("tvdb_id")
      .eq("user_id", user.id)
      .in("tvdb_id", ids);

    if (error) {
      console.error("Failed checking saved shows:", error);
      setSavedIds(new Set());
      return;
    }

    setSavedIds(new Set((data || []).map((row) => String(row.tvdb_id))));
  };

  const handleAddShow = async (event, show) => {
    event.preventDefault();
    event.stopPropagation();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError("Please log in to add shows.");
      return;
    }

    const tvdbId = String(show.tvdb_id || show.id);
    setAddingId(tvdbId);

    const payload = {
      user_id: user.id,
      tvdb_id: tvdbId,
      show_name: show.name || show.show_name || "Unknown Show",
      poster_url: show.image_url || show.poster_url || null,
      overview: show.overview || null,
      first_aired: show.first_air_time || show.first_aired || null,
    };

    const { error: insertError } = await supabase
      .from("user_shows")
      .upsert(payload, { onConflict: "user_id,tvdb_id" });

    setAddingId(null);

    if (insertError) {
      console.error("Failed to add show:", insertError);
      setError("Failed to add show.");
      return;
    }

    setSavedIds((prev) => {
      const next = new Set(prev);
      next.add(tvdbId);
      return next;
    });
  };

  return (
    <div className="page">
      <div className="page-shell">
        <div className="page-header">
          <h1>Search Shows</h1>
          <p>Find a show and add it to My Shows.</p>
        </div>

        <div
          style={{
            display: "flex",
            gap: "10px",
            alignItems: "stretch",
            marginBottom: "20px",
          }}
        >
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                search();
              }
            }}
            placeholder="Search for a show"
            style={{
              flex: 1,
              minWidth: 0,
              height: "48px",
              padding: "0 14px",
              borderRadius: "14px",
              border: "1px solid #26324a",
              background: "#121a2b",
              color: "#f8fafc",
              fontSize: "1rem",
            }}
          />

          <button
            onClick={search}
            disabled={loading}
            className="msd-btn msd-btn-secondary"
            style={{
              height: "48px",
              minWidth: "112px",
            }}
          >
            {loading ? "Searching..." : "Search"}
          </button>
        </div>

        {error && (
          <p style={{ color: "#fca5a5", marginBottom: "16px" }}>{error}</p>
        )}

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "14px",
          }}
        >
          {shows.map((show) => {
            const tvdbId = String(show.tvdb_id || show.id);
            const isSaved = savedIds.has(tvdbId);
            const isAdding = addingId === tvdbId;

            return (
              <div
                key={tvdbId}
                className="show-card"
                style={{
                  padding: "14px",
                }}
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
                    <Link
                      to={`/show/${tvdbId}`}
                      style={{ display: "block" }}
                    >
                      {show.image_url ? (
                        <img
                          src={show.image_url}
                          alt={show.name}
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

                    <button
                      type="button"
                      onClick={(e) => handleAddShow(e, show)}
                      disabled={isSaved || isAdding}
                      className={`msd-btn ${
                        isSaved ? "msd-btn-success" : "msd-btn-primary"
                      }`}
                      style={{
                        width: "100%",
                        padding: "9px 10px",
                        fontSize: "0.9rem",
                      }}
                    >
                      {isSaved ? "Added" : isAdding ? "Adding..." : "Add"}
                    </button>
                  </div>

                  <Link
                    to={`/show/${tvdbId}`}
                    style={{
                      textDecoration: "none",
                      color: "inherit",
                      minWidth: 0,
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: "1.05rem",
                          fontWeight: "800",
                          color: "#f8fafc",
                          marginBottom: "8px",
                          lineHeight: "1.2",
                        }}
                      >
                        {show.name}
                      </div>

                      {show.first_air_time && (
                        <p
                          style={{
                            margin: "0 0 10px 0",
                            color: "#cbd5e1",
                            fontWeight: "600",
                          }}
                        >
                          First aired: {formatDate(show.first_air_time)}
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
                    </div>
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
