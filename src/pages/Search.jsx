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
  const relationshipTypeFilter = searchParams.get("relationshipType") || "";
  const settingFilter = searchParams.get("setting") || "";
  const sourceShowId = searchParams.get("sourceShowId") || "";
  const sourceYear = searchParams.get("sourceYear") || "";
  const sourceRating = searchParams.get("sourceRating") || "";
  const sourceLanguage = searchParams.get("sourceLanguage") || "";

  const isPureNetworkBrowse =
    !!networkFilter &&
    !genreFilter &&
    !relationshipTypeFilter &&
    !settingFilter;

  useEffect(() => {
    if (genreFilter) setQuery(genreFilter);
    else if (networkFilter) setQuery(networkFilter);
    else if (relationshipTypeFilter) setQuery(relationshipTypeFilter);
    else if (settingFilter) setQuery(settingFilter);
    else setQuery("");
  }, [genreFilter, networkFilter, relationshipTypeFilter, settingFilter]);

  async function markAlreadySaved(results) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user || !results.length) {
      setSavedIds(new Set());
      return;
    }

    const tvdbIds = results.map((show) => Number(show.tvdb_id)).filter(Boolean);

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

  async function fetchSearch(paramsObject) {
    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams();

      Object.entries(paramsObject).forEach(([key, value]) => {
        if (value != null && value !== "") {
          params.set(key, value);
        }
      });

      const url = `/.netlify/functions/searchShows?${params.toString()}`;
      const res = await fetch(url);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.message || "Search failed");
      }

      // ✅ FILTER OUT TMDB RESULTS
      const results = (Array.isArray(data) ? data : []).filter(
        (show) => !!show.tvdb_id
      );

      setShows(results);
      await markAlreadySaved(results);
    } catch (err) {
      console.error("Search failed:", err);
      setError(err.message || "Search failed");
      setShows([]);
      setSavedIds(new Set());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const hasFilter =
      !!genreFilter ||
      !!networkFilter ||
      !!relationshipTypeFilter ||
      !!settingFilter;

    if (!hasFilter) return;

    fetchSearch({
      genre: genreFilter || null,
      network: networkFilter || null,
      relationshipType: relationshipTypeFilter || null,
      setting: settingFilter || null,
      sourceShowId: sourceShowId || null,
      sourceYear: isPureNetworkBrowse ? null : sourceYear || null,
      sourceRating: isPureNetworkBrowse ? null : sourceRating || null,
      sourceLanguage: isPureNetworkBrowse ? null : sourceLanguage || null,
    });
  }, [
    genreFilter,
    networkFilter,
    relationshipTypeFilter,
    settingFilter,
    sourceShowId,
    sourceYear,
    sourceRating,
    sourceLanguage,
    isPureNetworkBrowse,
  ]);

  async function handleManualSearch() {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) return;

    await fetchSearch({ q: trimmedQuery });
  }

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

  const pageTitle = genreFilter
    ? `Genre: ${genreFilter}`
    : networkFilter
    ? `Network: ${networkFilter}`
    : relationshipTypeFilter
    ? `Relationship Type: ${relationshipTypeFilter}`
    : settingFilter
    ? `Setting: ${settingFilter}`
    : "Search Shows";

  const pageSubtitle = genreFilter
    ? `Browse shows in ${genreFilter}.`
    : networkFilter
    ? `Browse shows from ${networkFilter}, newest first.`
    : relationshipTypeFilter
    ? `Browse shows with ${relationshipTypeFilter}.`
    : settingFilter
    ? `Browse shows set in ${settingFilter}.`
    : "Find a show and add it to My Shows.";

  return (
    <div className="page">
      <div className="page-shell">
        <div className="page-header">
          <h1>{pageTitle}</h1>
          <p>{pageSubtitle}</p>
        </div>

        <div style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleManualSearch()}
            placeholder="Search for a show"
            style={{
              flex: 1,
              height: "48px",
              padding: "0 14px",
              borderRadius: "14px",
              border: "1px solid #26324a",
              background: "#121a2b",
              color: "#f8fafc",
            }}
          />

          <button
            onClick={handleManualSearch}
            disabled={loading}
            className="msd-btn msd-btn-secondary"
            style={{ height: "48px", minWidth: "112px" }}
          >
            {loading ? "Searching..." : "Search"}
          </button>
        </div>

        {error && (
          <p style={{ color: "#fca5a5", marginBottom: "16px" }}>{error}</p>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          {shows.map((show) => {
            const tvdbId = String(show.tvdb_id);
            const isSaved = savedIds.has(tvdbId);
            const isAdding = addingId === tvdbId;

            const detailHref = isSaved
              ? `/my-shows/${tvdbId}`
              : `/show/${tvdbId}`;

            const poster = show.image_url || show.poster_url;

            return (
              <div key={tvdbId} className="show-card" style={{ padding: "14px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "88px 1fr", gap: "14px" }}>
                  <div>
                    <Link to={detailHref}>
                      {poster ? (
                        <img
                          src={poster}
                          alt={show.name}
                          style={{
                            width: "88px",
                            height: "128px",
                            borderRadius: "12px",
                            objectFit: "cover",
                          }}
                        />
                      ) : (
                        <div style={{ width: "88px", height: "128px", background: "#111827" }} />
                      )}
                    </Link>

                    <button
                      onClick={(e) => handleAddShow(e, show)}
                      disabled={isSaved || isAdding}
                      className={`msd-btn ${
                        isSaved ? "msd-btn-success" : "msd-btn-primary"
                      }`}
                      style={{ width: "100%", marginTop: "10px" }}
                    >
                      {isSaved ? "Added" : isAdding ? "Adding..." : "Add"}
                    </button>
                  </div>

                  <div>
                    <Link to={detailHref} style={{ textDecoration: "none", color: "inherit" }}>
                      <div style={{ fontWeight: "800", fontSize: "1.05rem" }}>
                        {show.name}
                      </div>
                    </Link>

                    {(show.first_air_time || show.first_aired) && (
                      <p style={{ color: "#cbd5e1" }}>
                        First aired: {formatDate(show.first_air_time || show.first_aired)}
                      </p>
                    )}

                    {show.overview && (
                      <p style={{ color: "#dbe4f3" }}>
                        {show.overview.slice(0, 180)}...
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
