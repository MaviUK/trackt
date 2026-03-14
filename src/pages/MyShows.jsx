import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { formatDate } from "../lib/date";
import { supabase } from "../lib/supabase";
import { getCachedEpisodes } from "../lib/episodesCache";
import { getShowStatus } from "../lib/showStatus";

export default function MyShows() {
  const [shows, setShows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState("airingnext");
  const [filterBy, setFilterBy] = useState("all");

  useEffect(() => {
    async function loadShows() {
      setLoading(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setShows([]);
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("user_shows")
        .select("*")
        .eq("user_id", user.id);

      if (error) {
        console.error("Failed to load shows:", error);
        setShows([]);
        setLoading(false);
        return;
      }

      const { data: watchedRows, error: watchedError } = await supabase
        .from("watched_episodes")
        .select("show_tvdb_id, episode_id")
        .eq("user_id", user.id);

      if (watchedError) {
        console.error("Failed to load watched episodes:", watchedError);
      }

      const watchedByShow = {};
      (watchedRows || []).forEach((row) => {
        const showId = String(row.show_tvdb_id);
        if (!watchedByShow[showId]) watchedByShow[showId] = 0;
        watchedByShow[showId] += 1;
      });

      const updatedShows = await Promise.all(
        (data || []).map(async (show) => {
          let totalEpisodes = 0;
          let nextEpisodeDate = null;
          let status = "Ended";

          try {
            const episodes = await getCachedEpisodes(show.tvdb_id);

            const filteredEpisodes = (episodes || []).filter(
              (ep) => (ep.seasonNumber ?? 0) > 0
            );

            totalEpisodes = filteredEpisodes.length;
            status = getShowStatus(show, filteredEpisodes);

            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const upcomingEpisodes = filteredEpisodes
              .filter((ep) => ep.airDate || ep.aired)
              .filter((ep) => {
                const airDate = new Date(ep.airDate || ep.aired);
                airDate.setHours(0, 0, 0, 0);
                return airDate >= today;
              })
              .sort(
                (a, b) =>
                  new Date(a.airDate || a.aired) -
                  new Date(b.airDate || b.aired)
              );

            if (upcomingEpisodes.length > 0) {
              nextEpisodeDate =
                upcomingEpisodes[0].airDate || upcomingEpisodes[0].aired;
            }
          } catch (episodeError) {
            console.error(
              "Failed to load show episode info for",
              show.show_name,
              episodeError
            );
          }

          const watchedCount = watchedByShow[String(show.tvdb_id)] || 0;
          const isCompleted =
            totalEpisodes > 0 && watchedCount >= totalEpisodes;
          const progress =
            totalEpisodes > 0
              ? Math.round((watchedCount / totalEpisodes) * 100)
              : 0;

          return {
            ...show,
            watchedCount,
            totalEpisodes,
            nextEpisodeDate,
            status,
            isCompleted,
            progress,
          };
        })
      );

      setShows(updatedShows);
      setLoading(false);
    }

    loadShows();
  }, []);

  const removeShow = async (tvdb_id) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    const { error } = await supabase
      .from("user_shows")
      .delete()
      .eq("user_id", user.id)
      .eq("tvdb_id", String(tvdb_id));

    if (error) {
      console.error("Failed to remove show:", error);
      return;
    }

    setShows((prev) =>
      prev.filter((show) => String(show.tvdb_id) !== String(tvdb_id))
    );
  };

  const filteredShows = useMemo(() => {
    return shows.filter((show) => {
      if (filterBy === "all") return true;
      if (filterBy === "completed") return show.isCompleted;
      if (filterBy === "inprogress") return !show.isCompleted;
      if (filterBy === "airing") return show.status === "Airing";
      if (filterBy === "ended") return show.status === "Ended";
      if (filterBy === "upcoming") return show.status === "Upcoming";
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
        return new Date(b.added_at || 0) - new Date(a.added_at || 0);
      }

      if (sortBy === "firstaired") {
        return new Date(a.first_aired || 0) - new Date(b.first_aired || 0);
      }

      return 0;
    });

    return result;
  }, [filteredShows, sortBy]);

  const counts = useMemo(() => {
    return {
      all: shows.length,
      inprogress: shows.filter((show) => !show.isCompleted).length,
      completed: shows.filter((show) => show.isCompleted).length,
      airing: shows.filter((show) => show.status === "Airing").length,
      ended: shows.filter((show) => show.status === "Ended").length,
      upcoming: shows.filter((show) => show.status === "Upcoming").length,
    };
  }, [shows]);

  const tabButtonStyle = (isActive) => ({
    padding: "10px 16px",
    borderRadius: "999px",
    border: isActive ? "1px solid #8b5cf6" : "1px solid #26324a",
    background: isActive ? "#8b5cf6" : "#121a2b",
    color: "#fff",
    fontWeight: "700",
    cursor: "pointer",
  });

  const getStatusStyle = (status) => {
    if (status === "Airing") {
      return {
        display: "inline-block",
        marginTop: "8px",
        padding: "4px 10px",
        borderRadius: "999px",
        fontSize: "12px",
        fontWeight: "700",
        background: "rgba(34, 197, 94, 0.16)",
        border: "1px solid rgba(34, 197, 94, 0.35)",
        color: "#86efac",
      };
    }

    if (status === "Upcoming") {
      return {
        display: "inline-block",
        marginTop: "8px",
        padding: "4px 10px",
        borderRadius: "999px",
        fontSize: "12px",
        fontWeight: "700",
        background: "rgba(139, 92, 246, 0.16)",
        border: "1px solid rgba(139, 92, 246, 0.35)",
        color: "#c4b5fd",
      };
    }

    return {
      display: "inline-block",
      marginTop: "8px",
      padding: "4px 10px",
      borderRadius: "999px",
      fontSize: "12px",
      fontWeight: "700",
      background: "rgba(148, 163, 184, 0.14)",
      border: "1px solid rgba(148, 163, 184, 0.3)",
      color: "#cbd5e1",
    };
  };

  if (loading) {
    return <div className="page">Loading...</div>;
  }

  return (
    <div className="page">
      <div className="page-shell">
        <div className="page-header">
          <h1>My Shows</h1>
          <p>Your saved shows and watch progress.</p>
        </div>

        {shows.length === 0 && <p>No saved shows yet.</p>}

        {shows.length > 0 && (
          <>
            <div
              style={{
                marginBottom: "16px",
                display: "flex",
                gap: "10px",
                flexWrap: "wrap",
              }}
            >
              <button
                type="button"
                onClick={() => setFilterBy("all")}
                style={tabButtonStyle(filterBy === "all")}
              >
                All ({counts.all})
              </button>

              <button
                type="button"
                onClick={() => setFilterBy("inprogress")}
                style={tabButtonStyle(filterBy === "inprogress")}
              >
                In Progress ({counts.inprogress})
              </button>

              <button
                type="button"
                onClick={() => setFilterBy("completed")}
                style={tabButtonStyle(filterBy === "completed")}
              >
                Completed ({counts.completed})
              </button>

              <button
                type="button"
                onClick={() => setFilterBy("airing")}
                style={tabButtonStyle(filterBy === "airing")}
              >
                Airing ({counts.airing})
              </button>

              <button
                type="button"
                onClick={() => setFilterBy("ended")}
                style={tabButtonStyle(filterBy === "ended")}
              >
                Ended ({counts.ended})
              </button>

              <button
                type="button"
                onClick={() => setFilterBy("upcoming")}
                style={tabButtonStyle(filterBy === "upcoming")}
              >
                Upcoming ({counts.upcoming})
              </button>
            </div>

            <div
              style={{
                marginBottom: "20px",
                display: "flex",
                gap: "16px",
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              <div>
                <label style={{ marginRight: "10px" }}>Sort by:</label>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                >
                  <option value="airingnext">Airing Next</option>
                  <option value="alphabetical">Alphabetical</option>
                  <option value="recent">Recently Added</option>
                  <option value="firstaired">First Aired</option>
                </select>
              </div>
            </div>
          </>
        )}

        {sortedShows.length === 0 ? (
          <p>No shows match this filter.</p>
        ) : (
          <div className="show-list">
            {sortedShows.map((show) => (
              <div className="show-card" key={show.tvdb_id}>
                <Link
                  to={`/my-shows/${show.tvdb_id}`}
                  style={{ textDecoration: "none", color: "inherit" }}
                >
                  <div
                    style={{
                      display: "flex",
                      gap: "16px",
                      alignItems: "flex-start",
                    }}
                  >
                    {show.poster_url && (
                      <img
                        src={show.poster_url}
                        alt={show.show_name}
                        width="80"
                        style={{
                          borderRadius: "8px",
                          objectFit: "cover",
                          flexShrink: 0,
                        }}
                      />
                    )}

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <strong style={{ fontSize: "1.1rem" }}>
                        {show.show_name}
                      </strong>

                      <div style={getStatusStyle(show.status)}>
                        {show.status}
                      </div>

                      {show.first_aired && (
                        <p style={{ margin: "8px 0 0 0" }}>
                          First aired: {formatDate(show.first_aired)}
                        </p>
                      )}

                      <p style={{ margin: "8px 0 0 0", fontWeight: "600" }}>
                        {show.watchedCount || 0} / {show.totalEpisodes || 0} watched
                      </p>

                      {show.isCompleted && (
                        <p
                          style={{
                            margin: "8px 0 0 0",
                            color: "#22c55e",
                            fontWeight: "700",
                          }}
                        >
                          Completed
                        </p>
                      )}

                      <div
                        style={{
                          marginTop: "8px",
                          width: "100%",
                          height: "10px",
                          background: "#1f2937",
                          borderRadius: "999px",
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            width: `${show.progress || 0}%`,
                            height: "100%",
                            background: show.isCompleted
                              ? "#16a34a"
                              : "#8b5cf6",
                            borderRadius: "999px",
                          }}
                        />
                      </div>

                      {show.nextEpisodeDate && (
                        <p style={{ margin: "8px 0 0 0", fontWeight: "600" }}>
                          Next episode: {formatDate(show.nextEpisodeDate)}
                        </p>
                      )}

                      {show.overview && (
                        <p style={{ margin: "8px 0 0 0" }}>
                          {show.overview.length > 160
                            ? `${show.overview.slice(0, 160)}...`
                            : show.overview}
                        </p>
                      )}
                    </div>
                  </div>
                </Link>

                <button
                  className="msd-btn msd-btn-secondary"
                  style={{ marginTop: "12px" }}
                  onClick={() => removeShow(show.tvdb_id)}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
