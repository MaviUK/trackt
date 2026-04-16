import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { getShowStatus } from "../lib/showStatus";

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
  const [isMobile, setIsMobile] = useState(
    typeof window !== "undefined" ? window.innerWidth <= 768 : false
  );

  useEffect(() => {
    function handleResize() {
      setIsMobile(window.innerWidth <= 768);
    }

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

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
      <div className="page">
        <div className="page-header">
          <h1>My Shows</h1>
          <p>Loading your saved shows...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>My Shows</h1>
        <p>Track your saved shows and progress.</p>
      </div>

      <div
        style={{
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
          marginBottom: 20,
        }}
      >
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
            className="msd-btn msd-btn-secondary"
            type="button"
            onClick={() => setFilterBy(value)}
            style={{ opacity: filterBy === value ? 1 : 0.7 }}
          >
            {label}
          </button>
        ))}
      </div>

      <div style={{ marginBottom: 24, maxWidth: 420 }}>
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search my shows..."
          style={{
            width: "100%",
            padding: "14px 16px",
            borderRadius: 14,
            border: "1px solid #26324a",
            background: "#182235",
            color: "#f8fafc",
            fontSize: "1rem",
            outline: "none",
          }}
        />
      </div>

      {displayedShows.length === 0 ? (
        <div className="show-card">
          <p>No shows found for this filter.</p>
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile
              ? "repeat(4, minmax(0, 1fr))"
              : "repeat(auto-fill, minmax(160px, 1fr))",
            gap: isMobile ? 10 : 20,
          }}
        >
          {displayedShows.map((show) => (
            <Link
              key={show.show_id}
              to={`/my-shows/${show.tvdb_id}`}
              style={{
                textDecoration: "none",
                color: "inherit",
                display: "block",
              }}
            >
              <div
                style={{
                  border: isMobile ? "none" : "1px solid #26324a",
                  borderRadius: isMobile ? 0 : 18,
                  padding: isMobile ? 0 : 12,
                  transition: "0.2s ease",
                  cursor: "pointer",
                  height: "100%",
                  background: "transparent",
                }}
              >
                {show.poster_url ? (
                  <img
                    src={show.poster_url}
                    alt={show.show_name}
                    style={{
                      width: "100%",
                      aspectRatio: "2 / 3",
                      objectFit: "cover",
                      borderRadius: isMobile ? 10 : 14,
                      display: "block",
                      background: "#111827",
                      marginBottom: isMobile ? 0 : 12,
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: "100%",
                      aspectRatio: "2 / 3",
                      borderRadius: isMobile ? 10 : 14,
                      background: "#111827",
                      marginBottom: isMobile ? 0 : 12,
                    }}
                  />
                )}

                {!isMobile && (
                  <div
                    style={{
                      color: "#f8fafc",
                      fontWeight: 800,
                      fontSize: "1rem",
                      lineHeight: 1.25,
                    }}
                  >
                    {show.show_name}
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
