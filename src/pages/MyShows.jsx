import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { formatDate } from "../lib/date";
import { supabase } from "../lib/supabase";
import { getShowStatus } from "../lib/showStatus";
import { backfillStoredShowsForCurrentUser } from "../lib/backfillStoredShows";

function normalizeId(value) {
  if (value == null) return "";
  return String(value).trim();
}

function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

function makeEpisodeNumberCode(seasonNumber, episodeNumber) {
  const s = Number(seasonNumber);
  const e = Number(episodeNumber);

  if (!s || !e) return null;

  return `S${String(s).padStart(2, "0")}E${String(e).padStart(2, "0")}`;
}

function normalizeEpisodeCode(value) {
  if (!value) return null;

  const str = String(value).trim().toUpperCase();

  const match = str.match(/^S(\d+)E(\d+)$/i);
  if (match) {
    return makeEpisodeNumberCode(match[1], match[2]);
  }

  return str;
}

function buildWatchedLookup(rows = []) {
  const watchedIds = new Set();
  const watchedCodes = new Set();

  for (const row of rows) {
    if (row.episode_id != null) {
      watchedIds.add(String(row.episode_id));
    }

    const normalizedCode = normalizeEpisodeCode(row.episode_code);
    if (normalizedCode) {
      watchedCodes.add(normalizedCode);
    }
  }

  return { watchedIds, watchedCodes };
}

function isStoredEpisodeWatched(ep, watchedLookup) {
  if (!ep || !watchedLookup) return false;

  if (ep.tvdb_episode_id != null) {
    if (watchedLookup.watchedIds.has(String(ep.tvdb_episode_id))) {
      return true;
    }
  }

  const normalizedStoredCode = normalizeEpisodeCode(ep.episode_code);
  if (normalizedStoredCode && watchedLookup.watchedCodes.has(normalizedStoredCode)) {
    return true;
  }

  const derivedCode = makeEpisodeNumberCode(
    ep.season_number,
    ep.episode_number
  );

  if (derivedCode && watchedLookup.watchedCodes.has(derivedCode)) {
    return true;
  }

  return false;
}

function toStatusEpisodeShape(ep) {
  return {
    id: ep.tvdb_episode_id,
    seasonNumber: ep.season_number,
    number: ep.episode_number,
    aired: ep.air_date,
    airDate: ep.air_date,
    name: ep.name,
  };
}

async function fetchAllWatchedRows(userId, showIds) {
  const allRows = [];
  const idChunks = chunkArray(showIds, 25);

  for (const ids of idChunks) {
    const { data, error } = await supabase
      .from("watched_episodes")
      .select("show_tvdb_id, episode_id, episode_code")
      .eq("user_id", userId)
      .in("show_tvdb_id", ids);

    if (error) throw error;
    allRows.push(...(data || []));
  }

  return allRows;
}

async function fetchAllStoredShows(showIds) {
  const allRows = [];
  const idChunks = chunkArray(showIds, 25);

  for (const ids of idChunks) {
    const { data, error } = await supabase
      .from("shows")
      .select("tvdb_id, show_name, overview, status, poster_url, first_aired")
      .in("tvdb_id", ids);

    if (error) throw error;
    allRows.push(...(data || []));
  }

  return allRows;
}

async function fetchAllStoredEpisodes(showIds) {
  const allRows = [];
  const idChunks = chunkArray(showIds, 10);

  for (const ids of idChunks) {
    let from = 0;
    const pageSize = 1000;

    while (true) {
      const to = from + pageSize - 1;

      const { data, error } = await supabase
        .from("show_episodes")
        .select(
          "show_tvdb_id, tvdb_episode_id, season_number, episode_number, episode_code, name, air_date"
        )
        .in("show_tvdb_id", ids)
        .order("show_tvdb_id", { ascending: true })
        .order("season_number", { ascending: true })
        .order("episode_number", { ascending: true })
        .range(from, to);

      if (error) throw error;

      const rows = data || [];
      allRows.push(...rows);

      if (rows.length < pageSize) {
        break;
      }

      from += pageSize;
    }
  }

  return allRows;
}

export default function MyShows() {
  const [shows, setShows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [backfilling, setBackfilling] = useState(false);
  const [sortBy, setSortBy] = useState("airingnext");
  const [filterBy, setFilterBy] = useState("all");

  useEffect(() => {
    let cancelled = false;

    async function loadShows() {
      try {
        setLoading(true);

        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError) throw userError;

        if (!user) {
          if (!cancelled) setShows([]);
          return;
        }

        const { data: userShows, error: userShowsError } = await supabase
          .from("user_shows")
          .select("*")
          .eq("user_id", user.id)
          .order("show_name", { ascending: true });

        if (userShowsError) throw userShowsError;

        const normalizedUserShows = (userShows || []).map((show) => ({
          ...show,
          tvdb_id: normalizeId(show.tvdb_id),
        }));

        const showIds = normalizedUserShows
          .map((show) => show.tvdb_id)
          .filter(Boolean);

        if (showIds.length === 0) {
          if (!cancelled) setShows([]);
          return;
        }

        const [watchedRows, storedShows, storedEpisodes] = await Promise.all([
          fetchAllWatchedRows(user.id, showIds),
          fetchAllStoredShows(showIds),
          fetchAllStoredEpisodes(showIds),
        ]);

        const watchedRowsByShow = {};
        for (const row of watchedRows || []) {
          const key = normalizeId(row.show_tvdb_id);
          if (!watchedRowsByShow[key]) watchedRowsByShow[key] = [];
          watchedRowsByShow[key].push(row);
        }

        const storedShowById = {};
        for (const storedShow of storedShows || []) {
          const key = normalizeId(storedShow.tvdb_id);
          if (key) storedShowById[key] = storedShow;
        }

        const episodesByShowId = {};
        for (const ep of storedEpisodes || []) {
          const key = normalizeId(ep.show_tvdb_id);
          if (!episodesByShowId[key]) episodesByShowId[key] = [];
          episodesByShowId[key].push(ep);
        }

        Object.keys(episodesByShowId).forEach((key) => {
          episodesByShowId[key].sort((a, b) => {
            if ((a.season_number ?? 0) !== (b.season_number ?? 0)) {
              return (a.season_number ?? 0) - (b.season_number ?? 0);
            }
            return (a.episode_number ?? 0) - (b.episode_number ?? 0);
          });
        });

        const updatedShows = normalizedUserShows.map((userShow) => {
          const showId = normalizeId(userShow.tvdb_id);
          const watchedLookup = buildWatchedLookup(
            watchedRowsByShow[showId] || []
          );
          const matchedStoredShow = storedShowById[showId] || null;
          const showEpisodes = episodesByShowId[showId] || [];

          const watchedCount = showEpisodes.filter((ep) =>
            isStoredEpisodeWatched(ep, watchedLookup)
          ).length;

          const totalEpisodes = showEpisodes.length;

          const today = new Date();
          today.setHours(0, 0, 0, 0);

          const upcomingEpisodes = showEpisodes
            .filter((ep) => ep.air_date)
            .filter((ep) => {
              const airDate = new Date(ep.air_date);
              airDate.setHours(0, 0, 0, 0);
              return airDate >= today;
            })
            .sort((a, b) => new Date(a.air_date) - new Date(b.air_date));

          const nextEpisodeDate =
            upcomingEpisodes.length > 0 ? upcomingEpisodes[0].air_date : null;

          const statusEpisodes = showEpisodes.map(toStatusEpisodeShape);
          const status = getShowStatus(userShow, statusEpisodes);

          const isCompleted =
            totalEpisodes > 0 && watchedCount >= totalEpisodes;

          const progress =
            totalEpisodes > 0
              ? Math.round((watchedCount / totalEpisodes) * 100)
              : 0;

          return {
            ...userShow,
            overview: userShow.overview || matchedStoredShow?.overview || "",
            poster_url:
              userShow.poster_url || matchedStoredShow?.poster_url || null,
            first_aired:
              userShow.first_aired || matchedStoredShow?.first_aired || null,
            watchedCount,
            totalEpisodes,
            nextEpisodeDate,
            status,
            isCompleted,
            progress,
          };
        });

        if (!cancelled) {
          setShows(updatedShows);
        }
      } catch (error) {
        console.error("LOAD SHOWS FAILED:", error);
        if (!cancelled) setShows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadShows();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleBackfillStoredShows() {
    try {
      setBackfilling(true);
      const results = await backfillStoredShowsForCurrentUser();
      console.log("BACKFILL RESULTS", results);
      alert("Backfill complete. Check console for results.");
      window.location.reload();
    } catch (error) {
      console.error("Backfill failed:", error);
      alert(error.message || "Backfill failed");
    } finally {
      setBackfilling(false);
    }
  }

  async function removeShow(tvdb_id) {
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
  }

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

          <button
            type="button"
            className="msd-btn msd-btn-secondary"
            onClick={handleBackfillStoredShows}
            disabled={backfilling}
            style={{ marginTop: "12px" }}
          >
            {backfilling ? "Backfilling..." : "Backfill Stored Shows"}
          </button>
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
