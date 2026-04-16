import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { getShowStatus } from "../lib/showStatus";
import "./MyShows.css";

function isAired(dateValue) {
  if (!dateValue) return false;
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return false;
  return date <= new Date();
}

function toStatusEpisodeShape(ep) {
  return {
    seasonNumber: ep.season_number,
    number: ep.episode_number,
    aired: ep.aired_date,
    airDate: ep.aired_date,
    name: ep.name,
  };
}

function daysUntil(dateValue) {
  if (!dateValue) return null;

  const now = new Date();
  const target = new Date(dateValue);

  if (Number.isNaN(target.getTime())) return null;

  const nowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const targetStart = new Date(
    target.getFullYear(),
    target.getMonth(),
    target.getDate()
  );

  return Math.ceil((targetStart - nowStart) / 86400000);
}

function chunkArray(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function formatDateLabel(dateValue) {
  if (!dateValue) return "Unknown";
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "Unknown";

  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function getYear(dateValue) {
  if (!dateValue) return "";
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "";
  return String(date.getFullYear());
}

function getStatusLabel(show) {
  if (show.isArchived) return "Archived";
  if (show.isCompleted) return "Completed";
  if (show.isInProgress) return "In Progress";
  if (show.isWatchlist) return "Watchlist";
  if (show.isAiringSoon) return "Airing Soon";
  return "Watching";
}

function getNextEpisodeLabel(show) {
  if (!show.nextEpisodeDate) return "No upcoming episode";
  if (show.daysToNextEpisode === 0) return "Airs today";
  if (show.daysToNextEpisode === 1) return "Airs tomorrow";
  if (show.daysToNextEpisode != null && show.daysToNextEpisode > 1) {
    return `Airs in ${show.daysToNextEpisode} days`;
  }
  return `Aired ${formatDateLabel(show.nextEpisodeDate)}`;
}

async function fetchEpisodesForShowIds(showIds) {
  if (!showIds.length) return [];

  const batches = chunkArray(showIds, 4);
  const allEpisodes = [];
  const pageSize = 1000;

  for (const batch of batches) {
    let from = 0;
    let done = false;

    while (!done) {
      const to = from + pageSize - 1;

      const { data, error } = await supabase
        .from("episodes")
        .select(`
          id,
          show_id,
          season_number,
          episode_number,
          name,
          aired_date
        `)
        .in("show_id", batch)
        .order("show_id", { ascending: true })
        .order("season_number", { ascending: true })
        .order("episode_number", { ascending: true })
        .range(from, to);

      if (error) throw error;

      const rows = data || [];
      allEpisodes.push(...rows);

      if (rows.length < pageSize) {
        done = true;
      } else {
        from += pageSize;
      }
    }
  }

  return allEpisodes;
}

async function fetchAllWatchedEpisodeRows(userId) {
  const pageSize = 1000;
  let from = 0;
  let done = false;
  const allRows = [];

  while (!done) {
    const to = from + pageSize - 1;

    const { data, error } = await supabase
      .from("watched_episodes")
      .select("episode_id")
      .eq("user_id", userId)
      .range(from, to);

    if (error) throw error;

    const rows = data || [];
    allRows.push(...rows);

    if (rows.length < pageSize) {
      done = true;
    } else {
      from += pageSize;
    }
  }

  return allRows;
}

export default function MyShows() {
  const [shows, setShows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterBy, setFilterBy] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");

  async function loadShows() {
    try {
      setLoading(true);

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) throw userError;

      if (!user) {
        setShows([]);
        return;
      }

      const { data: userShows, error: userShowsError } = await supabase
        .from("user_shows_new")
        .select(`
          id,
          user_id,
          show_id,
          watch_status,
          archived_at,
          added_at,
          created_at,
          shows!inner(
            id,
            tvdb_id,
            name,
            overview,
            status,
            poster_url,
            first_aired
          )
        `)
        .eq("user_id", user.id);

      if (userShowsError) throw userShowsError;

      const normalizedUserShows = (userShows || []).map((row) => ({
        id: row.id,
        user_id: row.user_id,
        show_id: row.show_id,
        watch_status: row.watch_status || "watching",
        archived_at: row.archived_at || null,
        added_at: row.added_at,
        created_at: row.created_at,
        tvdb_id: row.shows.tvdb_id,
        show_name: row.shows.name || "Unknown title",
        overview: row.shows.overview || "",
        status: row.shows.status || null,
        poster_url: row.shows.poster_url || null,
        first_aired: row.shows.first_aired || null,
      }));

      const showIds = normalizedUserShows
        .map((show) => show.show_id)
        .filter(Boolean);

      if (!showIds.length) {
        setShows([]);
        return;
      }

      const [watchedRows, allEpisodes] = await Promise.all([
        fetchAllWatchedEpisodeRows(user.id),
        fetchEpisodesForShowIds(showIds),
      ]);

      const watchedEpisodeIds = new Set(
        (watchedRows || [])
          .map((row) => row.episode_id)
          .filter(Boolean)
          .map(String)
      );

      const episodesByShowId = {};
      for (const ep of allEpisodes || []) {
        const key = ep.show_id;
        if (!episodesByShowId[key]) episodesByShowId[key] = [];
        episodesByShowId[key].push(ep);
      }

      const updatedShows = normalizedUserShows.map((userShow) => {
        const showEpisodes = episodesByShowId[userShow.show_id] || [];

        const mainEpisodes = showEpisodes.filter(
          (ep) => Number(ep.season_number ?? 0) !== 0
        );

        const futureMainEpisodes = mainEpisodes.filter(
          (ep) => ep.aired_date && !isAired(ep.aired_date)
        );

        const watchedMainCount = mainEpisodes.filter((ep) =>
          watchedEpisodeIds.has(String(ep.id))
        ).length;

        const totalMainEpisodes = mainEpisodes.length;

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const upcomingEpisodes = futureMainEpisodes
          .filter((ep) => ep.aired_date)
          .filter((ep) => {
            const airDate = new Date(ep.aired_date);
            airDate.setHours(0, 0, 0, 0);
            return airDate >= today;
          })
          .sort((a, b) => new Date(a.aired_date) - new Date(b.aired_date));

        const nextEpisodeDate =
          upcomingEpisodes.length > 0 ? upcomingEpisodes[0].aired_date : null;

        const daysToNextEpisode = daysUntil(nextEpisodeDate);

        const statusEpisodes = mainEpisodes.map(toStatusEpisodeShape);

        const status = getShowStatus(
          {
            ...userShow,
            first_aired: userShow.first_aired,
          },
          statusEpisodes
        );

        const isArchived = userShow.watch_status === "archived";
        const isWatchlist = watchedMainCount === 0 && !isArchived;
        const isCompleted =
          totalMainEpisodes > 0 &&
          watchedMainCount >= totalMainEpisodes &&
          !isArchived;
        const isInProgress =
          watchedMainCount > 0 &&
          watchedMainCount < totalMainEpisodes &&
          !isArchived;

        const isAiring = !!nextEpisodeDate && !isArchived;
        const isAiringSoon =
          !isArchived &&
          daysToNextEpisode != null &&
          daysToNextEpisode >= 0 &&
          daysToNextEpisode <= 30;

        const progressPercent =
          totalMainEpisodes > 0
            ? Math.min(100, Math.round((watchedMainCount / totalMainEpisodes) * 100))
            : 0;

        return {
          ...userShow,
          nextEpisodeDate,
          daysToNextEpisode,
          watchedMainCount,
          totalMainEpisodes,
          status,
          isArchived,
          isWatchlist,
          isCompleted,
          isInProgress,
          isAiring,
          isAiringSoon,
          progressPercent,
        };
      });

      setShows(updatedShows);
    } catch (error) {
      console.error("LOAD SHOWS FAILED:", error);
      setShows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadShows();
  }, []);

  const filteredShows = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return shows.filter((show) => {
      const matchesFilter =
        filterBy === "all"
          ? true
          : filterBy === "watchlist"
          ? show.isWatchlist
          : filterBy === "inprogress"
          ? show.isInProgress
          : filterBy === "completed"
          ? show.isCompleted
          : filterBy === "archived"
          ? show.isArchived
          : filterBy === "airing"
          ? show.isAiringSoon && !show.isArchived
          : true;

      if (!matchesFilter) return false;

      if (!normalizedSearch) return true;

      return (show.show_name || "").toLowerCase().includes(normalizedSearch);
    });
  }, [shows, filterBy, searchTerm]);

  const displayedShows = useMemo(() => {
    return [...filteredShows].sort((a, b) =>
      (a.show_name || "").localeCompare(b.show_name || "")
    );
  }, [filteredShows]);

  const counts = useMemo(
    () => ({
      all: shows.length,
      watchlist: shows.filter((show) => show.isWatchlist).length,
      inprogress: shows.filter((show) => show.isInProgress).length,
      completed: shows.filter((show) => show.isCompleted).length,
      archived: shows.filter((show) => show.isArchived).length,
      airing: shows.filter((show) => show.isAiringSoon && !show.isArchived)
        .length,
    }),
    [shows]
  );

  if (loading) {
    return (
      <div className="mys-page">
        <div className="mys-shell">
          <div className="mys-empty">
            <p>Loading your saved shows...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mys-page">
      <div className="mys-shell">
        <div className="mys-header msd-hero">
          <div className="mys-header-copy">
            <h1 className="msd-title">My Shows</h1>
            <p className="msd-overview">
              Track your saved shows, follow your progress, and jump back into
              what you are watching.
            </p>
          </div>

          <div className="mys-header-stats">
            <div className="msd-stats-row mys-stats-grid">
              <div className="msd-stat-box">
                <span className="msd-stat-label">Total Shows</span>
                <span className="msd-stat-value">{counts.all}</span>
              </div>
              <div className="msd-stat-box">
                <span className="msd-stat-label">In Progress</span>
                <span className="msd-stat-value">{counts.inprogress}</span>
              </div>
              <div className="msd-stat-box">
                <span className="msd-stat-label">Completed</span>
                <span className="msd-stat-value">{counts.completed}</span>
              </div>
              <div className="msd-stat-box">
                <span className="msd-stat-label">Airing Soon</span>
                <span className="msd-stat-value">{counts.airing}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="msd-panel">
          <div className="mys-toolbar">
            <div className="mys-filter-wrap">
              {[
                ["all", `All (${counts.all})`],
                ["watchlist", `Watchlist (${counts.watchlist})`],
                ["inprogress", `In Progress (${counts.inprogress})`],
                ["completed", `Completed (${counts.completed})`],
                ["archived", `Archived (${counts.archived})`],
                ["airing", `Airing (${counts.airing})`],
              ].map(([value, label]) => (
                <button
                  key={value}
                  className={`msd-btn ${
                    filterBy === value ? "msd-btn-primary" : "msd-btn-secondary"
                  }`}
                  type="button"
                  onClick={() => setFilterBy(value)}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="mys-search-wrap">
              <input
                className="mys-search"
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search my shows..."
              />
            </div>
          </div>
        </div>

        {displayedShows.length === 0 ? (
          <div className="mys-empty">
            <p>No shows found for this filter.</p>
          </div>
        ) : (
          <div className="mys-list">
            {displayedShows.map((show) => (
              <Link
                key={show.show_id}
                to={`/my-shows/${show.tvdb_id}`}
                className="mys-show-link"
              >
                <article className="mys-show-card msd-hero">
                  {show.poster_url ? (
                    <img
                      src={show.poster_url}
                      alt={show.show_name}
                      className="mys-poster msd-poster"
                    />
                  ) : (
                    <div className="mys-poster msd-poster mys-poster-placeholder" />
                  )}

                  <div className="mys-content">
                    <div className="mys-top-row">
                      <div>
                        <h2 className="mys-title">{show.show_name}</h2>
                        <div className="mys-subtitle-row">
                          {getYear(show.first_aired) ? (
                            <span className="mys-subtle-pill">
                              {getYear(show.first_aired)}
                            </span>
                          ) : null}
                          <span className="mys-subtle-pill">
                            {getStatusLabel(show)}
                          </span>
                          {show.status ? (
                            <span className="mys-subtle-pill">{show.status}</span>
                          ) : null}
                        </div>
                      </div>

                      <div className="mys-status-block">
                        {show.isCompleted ? (
                          <span className="msd-season-badge">Complete</span>
                        ) : show.isArchived ? (
                          <span className="mys-archived-badge">Archived</span>
                        ) : show.isAiringSoon ? (
                          <span className="mys-airing-badge">Airing Soon</span>
                        ) : null}
                      </div>
                    </div>

                    <p className="mys-overview">
                      {show.overview || "No overview available for this show yet."}
                    </p>

                    <div className="msd-meta mys-meta-grid">
                      <div>
                        <span className="msd-stat-label">First Aired</span>
                        <div className="mys-meta-value">
                          {formatDateLabel(show.first_aired)}
                        </div>
                      </div>
                      <div>
                        <span className="msd-stat-label">Episodes Watched</span>
                        <div className="mys-meta-value">
                          {show.watchedMainCount} / {show.totalMainEpisodes || 0}
                        </div>
                      </div>
                      <div>
                        <span className="msd-stat-label">Next Episode</span>
                        <div className="mys-meta-value">{getNextEpisodeLabel(show)}</div>
                      </div>
                    </div>

                    <div className="msd-stats-row mys-show-stats">
                      <div className="msd-stat-box">
                        <span className="msd-stat-label">Progress</span>
                        <span className="msd-stat-value">{show.progressPercent}%</span>
                      </div>
                      <div className="msd-stat-box">
                        <span className="msd-stat-label">Status</span>
                        <span className="msd-stat-value mys-stat-text">
                          {show.status?.label || getStatusLabel(show)}
                        </span>
                      </div>
                      <div className="msd-stat-box">
                        <span className="msd-stat-label">Library Type</span>
                        <span className="msd-stat-value mys-stat-text">
                          {show.isWatchlist
                            ? "Watchlist"
                            : show.isArchived
                            ? "Archived"
                            : "Active"}
                        </span>
                      </div>
                    </div>

                    <div className="mys-progress-block">
                      <div className="mys-progress-topline">
                        <span className="msd-stat-label">Watch Progress</span>
                        <span className="mys-progress-text">
                          {show.watchedMainCount} of {show.totalMainEpisodes || 0} episodes
                        </span>
                      </div>
                      <div className="msd-progress">
                        <div
                          className="msd-progress-fill"
                          style={{ width: `${show.progressPercent}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </article>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
