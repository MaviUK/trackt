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
    .select(
      `
      id,
      shows!inner(
        tvdb_id
      )
    `
    )
    .eq("user_id", userId)
    .eq("shows.tvdb_id", Number(tvdbId))
    .maybeSingle();

  if (error) throw error;
  return !!data;
}

function getBackdrop(show) {
  return (
    show.backdrop_url ||
    show.background_url ||
    show.banner_url ||
    show.fanart_url ||
    show.image_url ||
    show.poster_url ||
    null
  );
}

function getPoster(show) {
  return show.image_url || show.poster_url || null;
}

function getFirstAired(show) {
  return show.first_air_time || show.first_aired || null;
}

function getTotalSeasons(show) {
  return (
    show.total_seasons ||
    show.seasons_count ||
    show.season_count ||
    show.seasons ||
    null
  );
}

function getTotalEpisodes(show) {
  return (
    show.total_episodes ||
    show.episodes_count ||
    show.episode_count ||
    show.totalEpisodes ||
    null
  );
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

  return (
    <div className="page">
      <div className="page-shell search-shell">
        <div className="search-bar-wrap">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleManualSearch();
            }}
            placeholder="Search for a show"
            className="search-page-input"
          />

          <button
            type="button"
            onClick={handleManualSearch}
            disabled={loading}
            className="msd-btn msd-btn-secondary search-page-button"
          >
            {loading ? "Searching..." : "Search"}
          </button>
        </div>

        {error && <p className="search-error-text">{error}</p>}

        <div className="search-results-list">
          {shows.map((show) => {
            const tvdbId = String(show.tvdb_id);
            const isSaved = savedIds.has(tvdbId);
            const isAdding = addingId === tvdbId;
            const detailHref = isSaved ? `/my-shows/${tvdbId}` : `/show/${tvdbId}`;

            const backdrop = getBackdrop(show);
            const poster = getPoster(show);
            const firstAired = getFirstAired(show);
            const totalSeasons = getTotalSeasons(show);
            const totalEpisodes = getTotalEpisodes(show);

            return (
              <div
                key={tvdbId}
                className="search-result-banner-card"
                style={
                  backdrop
                    ? {
                        backgroundImage: `linear-gradient(90deg, rgba(9,14,26,0.96) 0%, rgba(9,14,26,0.84) 42%, rgba(9,14,26,0.92) 100%), url(${backdrop})`,
                      }
                    : undefined
                }
              >
                <div className="search-result-banner-inner">
                  <Link to={detailHref} className="search-result-poster-link">
                    {poster ? (
                      <img
                        src={poster}
                        alt={show.name || show.show_name || "Show poster"}
                        className="search-result-poster"
                      />
                    ) : (
                      <div className="search-result-poster search-result-poster-placeholder" />
                    )}
                  </Link>

                  <div className="search-result-content">
                    <Link to={detailHref} className="search-result-title-link">
                      <h3 className="search-result-title">
                        {show.name || show.show_name}
                      </h3>
                    </Link>

                    <div className="search-result-meta">
                      {firstAired && (
                        <div className="search-result-meta-row">
                          <span className="search-result-meta-label">
                            First aired
                          </span>
                          <span className="search-result-meta-value">
                            {formatDate(firstAired)}
                          </span>
                        </div>
                      )}

                      {totalSeasons && (
                        <div className="search-result-meta-row">
                          <span className="search-result-meta-label">
                            Total seasons
                          </span>
                          <span className="search-result-meta-value">
                            {totalSeasons}
                          </span>
                        </div>
                      )}

                      {totalEpisodes && (
                        <div className="search-result-meta-row">
                          <span className="search-result-meta-label">
                            Total episodes
                          </span>
                          <span className="search-result-meta-value">
                            {totalEpisodes}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="search-result-actions">
                      <button
                        type="button"
                        onClick={(e) => handleAddShow(e, show)}
                        disabled={isSaved || isAdding}
                        className={`search-add-btn ${isSaved ? "is-saved" : ""}`}
                      >
                        {isSaved ? "Added" : isAdding ? "Adding..." : "Add Show"}
                      </button>
                    </div>
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
