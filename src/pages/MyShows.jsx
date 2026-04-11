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

export default function MyShows() {
  const [shows, setShows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState("airingnext");
  const [filterBy, setFilterBy] = useState("all");

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

      const [watchedResp, episodesResp] = await Promise.all([
        supabase
          .from("watched_episodes")
          .select("episode_id")
          .eq("user_id", user.id),

        supabase
          .from("episodes")
          .select(`
            id,
            show_id,
            season_number,
            episode_number,
            name,
            aired_date
          `)
          .in("show_id", showIds)
          .order("show_id", { ascending: true })
          .order("season_number", { ascending: true })
          .order("episode_number", { ascending: true }),
      ]);

      if (watchedResp.error) throw watchedResp.error;
      if (episodesResp.error) throw episodesResp.error;

      const watchedEpisodeIds = new Set(
        (watchedResp.data || [])
          .map((row) => row.episode_id)
          .filter(Boolean)
          .map(String)
      );

      const episodesByShowId = {};
      for (const ep of episodesResp.data || []) {
        const key = ep.show_id;
        if (!episodesByShowId[key]) episodesByShowId[key] = [];
        episodesByShowId[key].push(ep);
      }

      const updatedShows = normalizedUserShows.map((userShow) => {
        const showEpisodes = episodesByShowId[userShow.show_id] || [];

        const airedEpisodes = showEpisodes.filter((ep) => isAired(ep.aired_date));
        const futureEpisodes = showEpisodes.filter(
          (ep) => ep.aired_date && !isAired(ep.aired_date)
        );

        const watchedAiredCount = airedEpisodes.filter((ep) =>
          watchedEpisodeIds.has(String(ep.id))
        ).length;

        const watchedTotalCount = showEpisodes.filter((ep) =>
          watchedEpisodeIds.has(String(ep.id))
        ).length;

        const totalAiredEpisodes = airedEpisodes.length;

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const upcomingEpisodes = futureEpisodes
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

        const statusEpisodes = showEpisodes.map(toStatusEpisodeShape);
        const status = getShowStatus(
          {
            ...userShow,
            first_aired: userShow.first_aired,
          },
          statusEpisodes
        );

        const isCompleted =
          totalAiredEpisodes > 0 && watchedAiredCount >= totalAiredEpisodes;

        const isWatchlist = watchedTotalCount === 0;
        const isArchived = userShow.watch_status === "archived";
        const isAiring = !!nextEpisodeDate;
        const isAiringSoon =
          daysToNextEpisode != null &&
          daysToNextEpisode >= 0 &&
          daysToNextEpisode <= 30;

        return {
          ...userShow,
          nextEpisodeDate,
          daysToNextEpisode,
          watchedAiredCount,
          watchedTotalCount,
          totalAiredEpisodes,
          totalEpisodeCount: showEpisodes.length,
          status,
          isCompleted,
          isWatchlist,
          isArchived,
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
    return shows.filter((show) => {
      if (filterBy === "all") return !show.isArchived;
      if (filterBy === "airing") return show.isAiring && !show.isArchived;
      if (filterBy === "watchlist") return show.isWatchlist && !show.isArchived;
      if (filterBy === "completed") return show.isCompleted && !show.isArchived;
      if (filterBy === "airingsoon") return show.isAiringSoon && !show.isArchived;
      if (filterBy === "archived") return show.isArchived;
      return true;
    });
  }, [shows, filterBy]);

  const sortedShows = useMemo(() => {
    const result = [...filteredShows].sort((a, b) => {
      if (sortBy === "airingnext") {
        const aHasDate = !!a.nextEpisodeDate;
        const bHasDate = !!b.nextEpisodeDate;

        if (aHasDate && bHasDate) {
          return new Date(a.nextEpisodeDate) - new Date(b.nextEpisodeDate);
        }
        if (aHasDate) return -1;
        if (bHasDate) return 1;

        return (a.show_name || "").localeCompare(b.show_name || "");
      }

      if (sortBy === "alphabetical") {
        return (a.show_name || "").localeCompare(b.show_name || "");
      }

      if (sortBy === "recent") {
        return (
          new Date(b.added_at || b.created_at || 0) -
          new Date(a.added_at || a.created_at || 0)
        );
      }

      if (sortBy === "firstaired") {
        return new Date(a.first_aired || 0) - new Date(b.first_aired || 0);
      }

      if (sortBy === "progress") {
        return b.watchedAiredCount - a.watchedAiredCount;
      }

      return 0;
    });

    return result;
  }, [filteredShows, sortBy]);

  const counts = useMemo(
    () => ({
      all: shows.filter((show) => !show.isArchived).length,
      airing: shows.filter((show) => show.isAiring && !show.isArchived).length,
      watchlist: shows.filter((show) => show.isWatchlist && !show.isArchived)
        .length,
      completed: shows.filter((show) => show.isCompleted && !show.isArchived)
        .length,
      airingsoon: shows.filter((show) => show.isAiringSoon && !show.isArchived)
        .length,
      archived: shows.filter((show) => show.isArchived).length,
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

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
        {[
          ["all", `All (${counts.all})`],
          ["airing", `Airing (${counts.airing})`],
          ["watchlist", `Watchlist (${counts.watchlist})`],
          ["completed", `Completed (${counts.completed})`],
          ["airingsoon", `Airing Soon (${counts.airingsoon})`],
          ["archived", `Archived (${counts.archived})`],
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

      <div
        style={{
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
          alignItems: "center",
          marginBottom: 24,
        }}
      >
        <label>
          Sort by{" "}
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            <option value="airingnext">Airing Next</option>
            <option value="alphabetical">Alphabetical</option>
            <option value="recent">Recently Added</option>
            <option value="firstaired">First Aired</option>
            <option value="progress">Most Watched</option>
          </select>
        </label>
      </div>

      {sortedShows.length === 0 ? (
        <div className="show-card">
          <p>No shows found for this filter.</p>
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
            gap: 20,
          }}
        >
          {sortedShows.map((show) => (
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
                  border: "1px solid #26324a",
                  borderRadius: 18,
                  padding: 12,
                  transition: "0.2s ease",
                  cursor: "pointer",
                  height: "100%",
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
                      borderRadius: 14,
                      display: "block",
                      background: "#111827",
                      marginBottom: 12,
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: "100%",
                      aspectRatio: "2 / 3",
                      borderRadius: 14,
                      background: "#111827",
                      marginBottom: 12,
                    }}
                  />
                )}

                <div
                  style={{
                    color: "#f8fafc",
                    fontWeight: 800,
                    fontSize: "1rem",
                    lineHeight: 1.25,
                    marginBottom: 8,
                  }}
                >
                  {show.show_name}
                </div>

                <div style={{ color: "#a5b4cc", fontSize: "0.9rem" }}>
                  {show.isArchived
                    ? "Archived"
                    : show.isCompleted
                    ? "Completed"
                    : show.isWatchlist
                    ? "Watchlist"
                    : show.nextEpisodeDate
                    ? `Next: ${show.nextEpisodeDate}`
                    : show.status || "Saved"}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
