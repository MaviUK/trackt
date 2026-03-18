import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { formatDate } from "../lib/date";
import { supabase } from "../lib/supabase";
import { addShowToUserList } from "../lib/userShows";

export default function Search() {
  const [searchParams] = useSearchParams();

  const [query, setQuery] = useState("");
  const [shows, setShows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [addingId, setAddingId] = useState(null);
  const [savedIds, setSavedIds] = useState(new Set());

  const genreFilter = searchParams.get("genre") || "";
  const networkFilter = searchParams.get("network") || "";
  const sourceShowId = searchParams.get("sourceShowId") || "";
  const sourceYear = searchParams.get("sourceYear") || "";
  const sourceRating = searchParams.get("sourceRating") || "";

  useEffect(() => {
    if (genreFilter) {
      setQuery(genreFilter);
    } else if (networkFilter) {
      setQuery(networkFilter);
    } else {
      setQuery("");
    }
  }, [genreFilter, networkFilter]);

  useEffect(() => {
    if (genreFilter || networkFilter) {
      search({
        genre: genreFilter || null,
        network: networkFilter || null,
        sourceShowId: sourceShowId || null,
        sourceYear: sourceYear || null,
        sourceRating: sourceRating || null,
      });
    }
  }, [genreFilter, networkFilter, sourceShowId, sourceYear, sourceRating]);

  const search = async (filters = null) => {
    const activeGenre = filters?.genre ?? null;
    const activeNetwork = filters?.network ?? null;
    const activeSourceShowId = filters?.sourceShowId ?? null;
    const activeSourceYear = filters?.sourceYear ?? null;
    const activeSourceRating = filters?.sourceRating ?? null;
    const trimmedQuery = query.trim();

    if (!activeGenre && !activeNetwork && !trimmedQuery) return;

    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams();

      if (activeGenre) {
        params.set("genre", activeGenre);
      }

      if (activeNetwork) {
        params.set("network", activeNetwork);
      }

      if (activeSourceShowId) {
        params.set("sourceShowId", activeSourceShowId);
      }

      if (activeSourceYear) {
        params.set("sourceYear", activeSourceYear);
      }

      if (activeSourceRating) {
        params.set("sourceRating", activeSourceRating);
      }

      if (!activeGenre && !activeNetwork && trimmedQuery) {
        params.set("q", trimmedQuery);
      }

      const res = await fetch(
        `/.netlify/functions/searchShows?${params.toString()}`
      );
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.message || "Search failed");
      }

      const results = Array.isArray(data) ? data : [];
      setShows(results);
      await markAlreadySaved(results);
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

    const tvdbIds = results
      .map((show) => Number(show.tvdb_id || show.id))
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
    setError("");

    try {
      await addShowToUserList({
        tvdb_id: Number(show.tvdb_id || show.id),
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
  };

  const pageTitle = genreFilter
    ? `Genre: ${genreFilter}`
    : networkFilter
    ? `Network: ${networkFilter}`
    : "Search Shows";

  const pageSubtitle = genreFilter
    ? `Browse shows in ${genreFilter}.`
    : networkFilter
    ? `Browse shows from ${networkFilter}.`
    : "Find a show and add it to My Shows.";

  return (
    <div className="page">
      <div className="page-shell">
        <div className="page-header">
          <h1>{pageTitle}</h1>
          <p>{pageSubtitle}</p>
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
            onClick={() => search()}
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

        {(genreFilter || networkFilter) && (
          <div
            style={{
              marginBottom: "16px",
              color: "#cbd5e1",
              fontSize: "0.95rem",
            }}
          >
            Active filter:{" "}
            {genreFilter ? (
              <span style={{ color: "#f8fafc", fontWeight: 700 }}>
                Genre = {genreFilter}
              </span>
            ) : null}
            {genreFilter && networkFilter ? " | " : ""}
            {networkFilter ? (
              <span style={{ color: "#f8fafc", fontWeight: 700 }}>
                Network = {networkFilter}
              </span>
            ) : null}
            {sourceYear ? (
              <>
                {" | "}
                <span style={{ color: "#f8fafc", fontWeight: 700 }}>
                  From year = {sourceYear}
                </span>
              </>
            ) : null}
            {sourceRating ? (
              <>
                {" | "}
                <span style={{ color: "#f8fafc", fontWeight: 700 }}>
                  Min rating = {sourceRating}
                </span>
              </>
            ) : null}
          </div>
        )}

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
                    <Link to={`/show/${tvdbId}`} style={{ display: "block" }}>
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
