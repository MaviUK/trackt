import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { formatDate } from "../lib/date";
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

function getEpisodeCode(seasonNumber, episodeNumber) {
  return `S${String(seasonNumber).padStart(2, "0")}E${String(
    episodeNumber
  ).padStart(2, "0")}`;
}

function groupEpisodesBySeason(episodes) {
  const grouped = {};

  for (const ep of episodes) {
    const seasonNumber = Number(ep.season_number || 0);
    if (!grouped[seasonNumber]) grouped[seasonNumber] = [];
    grouped[seasonNumber].push(ep);
  }

  return Object.entries(grouped)
    .map(([seasonNumber, eps]) => ({
      seasonNumber: Number(seasonNumber),
      episodes: [...eps].sort((a, b) => {
        if (a.season_number !== b.season_number) {
          return a.season_number - b.season_number;
        }
        return a.episode_number - b.episode_number;
      }),
    }))
    .sort((a, b) => a.seasonNumber - b.seasonNumber);
}

export default function MyShows() {
  const [shows, setShows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState("airingnext");
  const [filterBy, setFilterBy] = useState("all");
  const [expandedShowId, setExpandedShowId] = useState(null);

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
            overview,
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

        const watchedOverallCount = showEpisodes.filter((ep) =>
          watchedEpisodeIds.has(String(ep.id))
        ).length;

        const totalEpisodes = showEpisodes.length;
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

        const progress =
          totalAiredEpisodes > 0
            ? Math.round((watchedAiredCount / totalAiredEpisodes) * 100)
            : 0;

        return {
          ...userShow,
          allEpisodes: showEpisodes,
          watchedCount: watchedAiredCount,
          watchedOverallCount,
          totalEpisodes,
          totalAiredEpisodes,
          nextEpisodeDate,
          status,
          isCompleted,
          progress,
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

  async function removeShow(showId) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    const { error } = await supabase
      .from("user_shows_new")
      .delete()
      .eq("user_id", user.id)
      .eq("show_id", showId);

    if (error) {
      console.error("Failed to remove show:", error);
      return;
    }

    setShows((prev) => prev.filter((show) => show.show_id !== showId));
    if (expandedShowId === showId) setExpandedShowId(null);
  }

  async function setWatchStatus(showId, status) {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError) throw userError;
    if (!user) return;

    const { error } = await supabase
      .from("user_shows_new")
      .update({ watch_status: status })
      .eq("user_id", user.id)
      .eq("show_id", showId);

    if (error) throw error;

    setShows((prev) =>
      prev.map((show) =>
        show.show_id === showId ? { ...show, watch_status: status } : show
      )
    );
  }

  const filteredShows = useMemo(() => {
    return shows.filter((show) => {
      const watchStatus = show.watch_status || "watching";

      if (filterBy === "all") return watchStatus !== "stopped";
      if (filterBy === "stopped") return watchStatus === "stopped";
      if (filterBy === "completed")
        return show.isCompleted && watchStatus !== "stopped";
      if (filterBy === "inprogress")
        return !show.isCompleted && watchStatus !== "stopped";
      if (filterBy === "airing")
        return show.status === "Airing" && watchStatus !== "stopped";
      if (filterBy === "ended")
        return show.status === "Ended" && watchStatus !== "stopped";
      if (filterBy === "upcoming")
        return show.status === "Upcoming" && watchStatus !== "stopped";

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

      return 0;
    });

    return result;
  }, [filteredShows, sortBy]);

  const counts = useMemo(
    () => ({
      all: shows.filter(
        (show) => (show.watch_status || "watching") !== "stopped"
      ).length,
      inprogress: shows.filter(
        (show) =>
          !show.isCompleted && (show.watch_status || "watching") !== "stopped"
      ).length,
      completed: shows.filter(
        (show) =>
          show.isCompleted && (show.watch_status || "watching") !== "stopped"
      ).length,
      airing: shows.filter(
        (show) =>
          show.status === "Airing" &&
          (show.watch_status || "watching") !== "stopped"
      ).length,
      ended: shows.filter(
        (show) =>
          show.status === "Ended" &&
          (show.watch_status || "watching") !== "stopped"
      ).length,
      upcoming: shows.filter(
        (show) =>
          show.status === "Upcoming" &&
          (show.watch_status || "watching") !== "stopped"
      ).length,
      stopped: shows.filter(
        (show) => (show.watch_status || "watching") === "stopped"
      ).length,
    }),
    [shows]
  );

  const expandedShow = useMemo(
    () => sortedShows.find((show) => show.show_id === expandedShowId) || null,
    [sortedShows, expandedShowId]
  );

  const expandedShowSeasons = useMemo(() => {
    if (!expandedShow) return [];
    return groupEpisodesBySeason(expandedShow.allEpisodes || []);
  }, [expandedShow]);

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
          ["inprogress", `In Progress (${counts.inprogress})`],
          ["completed", `Completed (${counts.completed})`],
          ["airing", `Airing (${counts.airing})`],
          ["ended", `Ended (${counts.ended})`],
          ["upcoming", `Upcoming (${counts.upcoming})`],
          ["stopped", `Stopped (${counts.stopped})`],
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
          </select>
        </label>
      </div>

      {sortedShows.length === 0 ? (
        <div className="show-card">
          <p>No shows found for this filter.</p>
        </div>
      ) : (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
              gap: 18,
              marginBottom: 24,
            }}
          >
            {sortedShows.map((show) => {
              const isExpanded = expandedShowId === show.show_id;

              return (
                <button
                  key={show.show_id}
                  type="button"
                  onClick={() =>
                    setExpandedShowId(isExpanded ? null : show.show_id)
                  }
                  style={{
                    background: "transparent",
                    border: isExpanded
                      ? "2px solid #8b5cf6"
                      : "1px solid #26324a",
                    borderRadius: 16,
                    padding: 10,
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "0.2s ease",
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
                        borderRadius: 12,
                        display: "block",
                        background: "#111827",
                        marginBottom: 10,
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: "100%",
                        aspectRatio: "2 / 3",
                        borderRadius: 12,
                        background: "#111827",
                        marginBottom: 10,
                      }}
                    />
                  )}

                  <div
                    style={{
                      color: "#f8fafc",
                      fontWeight: 700,
                      fontSize: "0.95rem",
                      lineHeight: 1.25,
                    }}
                  >
                    {show.show_name}
                  </div>
                </button>
              );
            })}
          </div>

          {expandedShow && (
            <div className="show-card" style={{ padding: 20, marginBottom: 24 }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "180px minmax(0, 1fr)",
                  gap: 24,
                  alignItems: "start",
                  marginBottom: 24,
                }}
              >
                <div>
                  {expandedShow.poster_url ? (
                    <img
                      src={expandedShow.poster_url}
                      alt={expandedShow.show_name}
                      className="show-poster"
                      style={{ width: "100%" }}
                    />
                  ) : (
                    <div
                      style={{
                        width: "100%",
                        aspectRatio: "2 / 3",
                        background: "#111827",
                        borderRadius: 16,
                      }}
                    />
                  )}
                </div>

                <div>
                  <h2 style={{ marginTop: 0, marginBottom: 12 }}>
                    {expandedShow.show_name}
                  </h2>

                  {expandedShow.overview ? (
                    <p
                      style={{
                        marginTop: 0,
                        marginBottom: 16,
                        color: "#dbe4f3",
                        lineHeight: 1.55,
                      }}
                    >
                      {expandedShow.overview}
                    </p>
                  ) : null}

                  {expandedShow.first_aired ? (
                    <p className="muted-text" style={{ marginBottom: 8 }}>
                      First aired: {formatDate(expandedShow.first_aired)}
                    </p>
                  ) : null}

                  <p className="muted-text" style={{ marginBottom: 8 }}>
                    Status: {expandedShow.status || "Unknown"}
                  </p>

                  {expandedShow.nextEpisodeDate ? (
                    <p className="muted-text" style={{ marginBottom: 16 }}>
                      Next episode: {formatDate(expandedShow.nextEpisodeDate)}
                    </p>
                  ) : null}

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                      gap: 12,
                      marginBottom: 14,
                    }}
                  >
                    <div className="stat-card">
                      <span className="stat-label">Watched</span>
                      <strong className="stat-value">
                        {expandedShow.watchedCount}
                      </strong>
                    </div>
                    <div className="stat-card">
                      <span className="stat-label">Total</span>
                      <strong className="stat-value">
                        {expandedShow.totalAiredEpisodes}
                      </strong>
                    </div>
                    <div className="stat-card">
                      <span className="stat-label">Progress</span>
                      <strong className="stat-value">
                        {expandedShow.progress}%
                      </strong>
                    </div>
                  </div>

                  <div className="msd-progress" style={{ marginBottom: 16 }}>
                    <div
                      className="msd-progress-fill"
                      style={{ width: `${expandedShow.progress}%` }}
                    />
                  </div>

                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      flexWrap: "wrap",
                    }}
                  >
                    <Link
                      className="msd-btn msd-btn-primary"
                      to={`/my-shows/${expandedShow.tvdb_id}`}
                    >
                      Open
                    </Link>

                    {(expandedShow.watch_status || "watching") === "stopped" ? (
                      <button
                        type="button"
                        className="msd-btn msd-btn-secondary"
                        onClick={() =>
                          setWatchStatus(expandedShow.show_id, "watching")
                        }
                      >
                        Resume
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="msd-btn msd-btn-secondary"
                        onClick={() =>
                          setWatchStatus(expandedShow.show_id, "stopped")
                        }
                      >
                        Stop Watching
                      </button>
                    )}

                    <button
                      type="button"
                      className="msd-btn msd-btn-secondary"
                      onClick={() => removeShow(expandedShow.show_id)}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>

              <div>
                <h3 style={{ marginTop: 0, marginBottom: 18 }}>Episodes</h3>

                {expandedShowSeasons.length === 0 ? (
                  <p className="muted-text">No episodes found.</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                    {expandedShowSeasons.map((season) => (
                      <section
                        key={season.seasonNumber}
                        style={{
                          border: "1px solid #26324a",
                          borderRadius: 18,
                          background: "rgba(15, 23, 42, 0.55)",
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            padding: "16px 18px",
                            borderBottom: "1px solid #22304b",
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                          }}
                        >
                          <div>
                            <div
                              style={{
                                color: "#f8fafc",
                                fontWeight: 800,
                                fontSize: "1.05rem",
                              }}
                            >
                              Season {season.seasonNumber}
                            </div>
                            <div
                              style={{
                                color: "#94a3b8",
                                fontSize: "0.92rem",
                                marginTop: 4,
                              }}
                            >
                              {season.episodes.length} episode
                              {season.episodes.length === 1 ? "" : "s"}
                            </div>
                          </div>
                        </div>

                        <div style={{ display: "flex", flexDirection: "column" }}>
                          {season.episodes.map((ep, index) => (
                            <div
                              key={ep.id}
                              style={{
                                padding: "14px 18px",
                                borderTop:
                                  index === 0 ? "none" : "1px solid #1e293b",
                              }}
                            >
                              <div
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  gap: 12,
                                  flexWrap: "wrap",
                                  marginBottom: 6,
                                }}
                              >
                                <div
                                  style={{
                                    color: "#f8fafc",
                                    fontWeight: 700,
                                    fontSize: "0.98rem",
                                  }}
                                >
                                  {getEpisodeCode(
                                    ep.season_number,
                                    ep.episode_number
                                  )}{" "}
                                  - {ep.name || "Untitled episode"}
                                </div>

                                {ep.aired_date ? (
                                  <div
                                    style={{
                                      color: "#a5b4cc",
                                      fontSize: "0.9rem",
                                      whiteSpace: "nowrap",
                                    }}
                                  >
                                    {formatDate(ep.aired_date)}
                                  </div>
                                ) : null}
                              </div>

                              {ep.overview ? (
                                <div
                                  style={{
                                    color: "#cbd5e1",
                                    lineHeight: 1.5,
                                    fontSize: "0.94rem",
                                  }}
                                >
                                  {ep.overview}
                                </div>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      </section>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
