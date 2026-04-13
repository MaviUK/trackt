import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { formatDate } from "../lib/date";
import { supabase } from "../lib/supabase";
import { addShowToUserList } from "../lib/userShows";
import "./Search.css";

function withTimeout(promise, ms, message) {
  let timerId;

  const timeoutPromise = new Promise((_, reject) => {
    timerId = setTimeout(() => {
      reject(new Error(message));
    }, ms);
  });

  return Promise.race([
    promise.finally(() => clearTimeout(timerId)),
    timeoutPromise,
  ]);
}

async function verifyShowWasActuallySaved(tvdbId, userId) {
  const { data, error } = await supabase
    .from("user_shows_new")
    .select(`
      id,
      shows!inner(
        tvdb_id
      )
    `)
    .eq("user_id", userId)
    .eq("shows.tvdb_id", Number(tvdbId))
    .maybeSingle();

  if (error) throw error;
  return !!data;
}

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

    if (!tvdbId) {
      setError("This show is missing a TVDB id and cannot be added.");
      return;
    }

    setAddingId(tvdbId);
    setError("");

    try {
      await withTimeout(
        addShowToUserList({
          tvdb_id: Number(show.tvdb_id),
          name: show.name || show.show_name || "Unknown Show",
          poster_url: show.image_url || show.poster_url || null,
          overview: show.overview || null,
          first_air_date: show.first_air_time || show.first_aired || null,
          status: show.status || null,
        }),
        120000,
        "Add show timed out while syncing data."
      );

      const reallySaved = await verifyShowWasActuallySaved(tvdbId, user.id);

      if (!reallySaved) {
        throw new Error(
          "Show sync did not finish properly. It has not been added to My Shows yet."
        );
      }

      await markAlreadySaved(shows);
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
    <div className="search-page">
      <div className="search-shell">
        <div className="search-page-header">
          <h1 className="search-page-title">{pageTitle}</h1>
          <p className="search-page-subtitle">{pageSubtitle}</p>
        </div>

        <div className="search-bar">
          <input
            className="search-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleManualSearch()}
            placeholder="Search for a show"
          />

          <button
            onClick={handleManualSearch}
            disabled={loading}
            className="search-button"
            type="button"
          >
            {loading ? "Searching..." : "Search"}
          </button>
        </div>

        {error && <p className="search-error">{error}</p>}

        {!loading && !shows.length && !error && (
          <div className="search-empty">
            <p>No shows yet. Try searching for something.</p>
          </div>
        )}

        <div className="search-results-list">
          {shows.map((show) => {
            const tvdbId = String(show.tvdb_id);
            const isSaved = savedIds.has(tvdbId);
            const isAdding = addingId === tvdbId;

            const detailHref = isSaved
              ? `/my-shows/${tvdbId}`
              : `/show/${tvdbId}`;

            const poster = show.image_url || show.poster_url;

            return (
              <div key={tvdbId} className="search-result-card">
                <div className="search-result-grid">
                  <div className="search-poster-column">
                    <Link to={detailHref} className="search-poster-link">
                      {poster ? (
                        <img
                          src={poster}
                          alt={show.name}
                          className="search-result-poster"
                        />
                      ) : (
                        <div className="search-result-poster search-result-poster-placeholder" />
                      )}
                    </Link>

                    <button
                      onClick={(e) => handleAddShow(e, show)}
                      disabled={isSaved || isAdding}
                      className={`search-add-button ${
                        isSaved
                          ? "search-add-button-saved"
                          : "search-add-button-primary"
                      }`}
                      type="button"
                    >
                      {isSaved ? "Added" : isAdding ? "Adding..." : "Add"}
                    </button>
                  </div>

                  <div className="search-result-content">
                    <Link to={detailHref} className="search-result-title-link">
                      <div className="search-result-title">{show.name}</div>
                    </Link>

                    {(show.first_air_time || show.first_aired) && (
                      <p className="search-result-meta">
                        First aired:{" "}
                        {formatDate(show.first_air_time || show.first_aired)}
                      </p>
                    )}

                    {show.overview && (
                      <p className="search-result-overview">
                        {show.overview.length > 180
                          ? `${show.overview.slice(0, 180)}...`
                          : show.overview}
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
