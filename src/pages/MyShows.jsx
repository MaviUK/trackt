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

function createEmptyWatchedLookup() {
  return {
    episodeRowIds: new Set(),
    episodeCodes: new Set(),
    seasonEpisodeKeys: new Set(),
  };
}

function getEpisodeCode(seasonNumber, episodeNumber) {
  if (!seasonNumber || !episodeNumber) return null;
  return `S${String(seasonNumber).padStart(2, "0")}E${String(
    episodeNumber
  ).padStart(2, "0")}`;
}

function isStoredEpisodeWatched(ep, watchedLookup) {
  if (!ep) return false;

  if (ep.id != null && watchedLookup.episodeRowIds.has(String(ep.id))) {
    return true;
  }

  if (
    ep.episode_code &&
    watchedLookup.episodeCodes.has(String(ep.episode_code).toUpperCase())
  ) {
    return true;
  }

  const derived = getEpisodeCode(ep.season_number, ep.episode_number);
  if (derived && watchedLookup.episodeCodes.has(derived.toUpperCase())) {
    return true;
  }

  if (
    ep.season_number != null &&
    ep.episode_number != null &&
    watchedLookup.seasonEpisodeKeys.has(
      `${ep.season_number}-${ep.episode_number}`
    )
  ) {
    return true;
  }

  return false;
}

function toStatusEpisodeShape(ep) {
  return {
    seasonNumber: ep.season_number,
    number: ep.episode_number,
    aired: ep.aired,
    airDate: ep.aired,
    name: ep.episode_name,
  };
}

function isAired(dateValue) {
  if (!dateValue) return false;
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return false;
  return date <= new Date();
}

export default function MyShows() {
  const [shows, setShows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [backfilling, setBackfilling] = useState(false);
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
        .from("user_shows")
        .select("*")
        .eq("user_id", user.id)
        .order("show_name", { ascending: true });

      if (userShowsError) throw userShowsError;

      const normalizedUserShows = (userShows || []).map((show) => ({
        ...show,
        tvdb_id: normalizeId(show.tvdb_id),
        watch_status: show.watch_status || "watching",
      }));

      const showIds = normalizedUserShows
        .map((show) => show.tvdb_id)
        .filter(Boolean);

      if (!showIds.length) {
        setShows([]);
        return;
      }

      const [watchedResp, storedShowsResp, storedEpisodesResp] = await Promise.all([
        supabase
          .from("watched_episodes")
          .select(
            "show_tvdb_id, episode_row_id, season_number, episode_number, episode_code"
          )
          .eq("user_id", user.id)
          .in("show_tvdb_id", showIds),

        supabase
          .from("shows")
          .select("tvdb_id, show_name, overview, status, poster_url, first_air_date")
          .in("tvdb_id", showIds),

        supabase
          .from("episodes")
          .select(
            "id, show_tvdb_id, season_number, episode_number, episode_code, episode_name, aired"
          )
          .in("show_tvdb_id", showIds)
          .order("show_tvdb_id", { ascending: true })
          .order("season_number", { ascending: true })
          .order("episode_number", { ascending: true }),
      ]);

      if (watchedResp.error) throw watchedResp.error;
      if (storedShowsResp.error) throw storedShowsResp.error;
      if (storedEpisodesResp.error) throw storedEpisodesResp.error;

      const watchedRowsByShow = {};
      for (const row of watchedResp.data || []) {
        const key = normalizeId(row.show_tvdb_id);

        if (!watchedRowsByShow[key]) {
          watchedRowsByShow[key] = createEmptyWatchedLookup();
        }

        if (row.episode_row_id != null) {
          watchedRowsByShow[key].episodeRowIds.add(String(row.episode_row_id));
        }

        if (row.episode_code) {
          watchedRowsByShow[key].episodeCodes.add(
            String(row.episode_code).toUpperCase()
          );
        }

        if (row.season_number != null && row.episode_number != null) {
          watchedRowsByShow[key].seasonEpisodeKeys.add(
            `${row.season_number}-${row.episode_number}`
          );
        }
      }

      const storedShowById = {};
      for (const storedShow of storedShowsResp.data || []) {
        const key = normalizeId(storedShow.tvdb_id);
        if (key) storedShowById[key] = storedShow;
      }

      const episodesByShowId = {};
      for (const ep of storedEpisodesResp.data || []) {
        const key = normalizeId(ep.show_tvdb_id);
        if (!episodesByShowId[key]) episodesByShowId[key] = [];
        episodesByShowId[key].push(ep);
      }

      const updatedShows = normalizedUserShows.map((userShow) => {
        const showId = normalizeId(userShow.tvdb_id);
        const matchedStoredShow = storedShowById[showId] || null;
        const showEpisodes = episodesByShowId[showId] || [];
        const watchedLookup =
          watchedRowsByShow[showId] || createEmptyWatchedLookup();

        const airedEpisodes = showEpisodes.filter((ep) => isAired(ep.aired));
        const futureEpisodes = showEpisodes.filter(
          (ep) => ep.aired && !isAired(ep.aired)
        );

        const watchedAiredCount = airedEpisodes.filter((ep) =>
          isStoredEpisodeWatched(ep, watchedLookup)
        ).length;

        const watchedOverallCount = showEpisodes.filter((ep) =>
          isStoredEpisodeWatched(ep, watchedLookup)
        ).length;

        const totalEpisodes = showEpisodes.length;
        const totalAiredEpisodes = airedEpisodes.length;

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const upcomingEpisodes = futureEpisodes
          .filter((ep) => ep.aired)
          .filter((ep) => {
            const airDate = new Date(ep.aired);
            airDate.setHours(0, 0, 0, 0);
            return airDate >= today;
          })
          .sort((a, b) => new Date(a.aired) - new Date(b.aired));

        const nextEpisodeDate =
          upcomingEpisodes.length > 0 ? upcomingEpisodes[0].aired : null;

        const statusEpisodes = showEpisodes.map(toStatusEpisodeShape);
        const status = getShowStatus(
          {
            ...userShow,
            first_aired:
              userShow.first_aired || matchedStoredShow?.first_air_date,
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
          show_name:
            userShow.show_name || matchedStoredShow?.show_name || "Unknown title",
          overview: userShow.overview || matchedStoredShow?.overview || "",
          poster_url: userShow.poster_url || matchedStoredShow?.poster_url || null,
          first_aired:
            userShow.first_aired || matchedStoredShow?.first_air_date || null,
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

  async function handleBackfillStoredShows() {
    try {
      setBackfilling(true);
      await backfillStoredShowsForCurrentUser();
      await loadShows();
      alert("Backfill complete.");
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
      .eq("tvdb_id", normalizeId(tvdb_id));

    if (error) {
      console.error("Failed to remove show:", error);
      return;
    }

    setShows((prev) =>
      prev.filter((show) => normalizeId(show.tvdb_id) !== normalizeId(tvdb_id))
    );
  }

  async function setWatchStatus(tvdbId, status) {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError) throw userError;
    if (!user) return;

    const { error } = await supabase
      .from("user_shows")
      .update({ watch_status: status })
      .eq("user_id", user.id)
      .eq("tvdb_id", normalizeId(tvdbId));

    if (error) throw error;

    setShows((prev) =>
      prev.map((show) =>
        normalizeId(show.tvdb_id) === normalizeId(tvdbId)
          ? { ...show, watch_status: status }
          : show
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
        return new Date(b.added_at || 0) - new Date(a.added_at || 0);
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
      all: shows.filter((show) => (show.watch_status || "watching") !== "stopped")
        .length,
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

        <button
          type="button"
          className="msd-btn msd-btn-secondary"
          onClick={handleBackfillStoredShows}
          disabled={backfilling}
        >
          {backfilling ? "Backfilling..." : "Backfill Stored Shows"}
        </button>
      </div>

      {sortedShows.length === 0 ? (
        <div className="show-card">
          <p>No shows found for this filter.</p>
        </div>
      ) : (
        <div className="show-grid">
          {sortedShows.map((show) => (
            <article key={show.tvdb_id} className="show-card">
              <Link to={`/my-shows/${show.tvdb_id}`}>
                {show.poster_url ? (
                  <img
                    src={show.poster_url}
                    alt={show.show_name}
                    className="show-poster"
                  />
                ) : null}
              </Link>

              <div className="show-card-body">
                <div className="show-card-top">
                  <div>
                    <Link
                      to={`/my-shows/${show.tvdb_id}`}
                      className="show-title-link"
                    >
                      <h2>{show.show_name}</h2>
                    </Link>

                    <p className="muted-text">Status: {show.status || "Unknown"}</p>

                    {show.first_aired ? (
                      <p className="muted-text">
                        First aired: {formatDate(show.first_aired)}
                      </p>
                    ) : null}

                    {show.nextEpisodeDate ? (
                      <p className="muted-text">
                        Next episode: {formatDate(show.nextEpisodeDate)}
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="progress-row">
                  <strong>
                    {show.watchedCount}/{show.totalAiredEpisodes} watched
                  </strong>
                  <span>{show.progress}%</span>
                </div>

                <div className="msd-progress" style={{ marginBottom: 12 }}>
                  <div
                    className="msd-progress-fill"
                    style={{ width: `${show.progress}%` }}
                  />
                </div>

                {show.totalEpisodes > show.totalAiredEpisodes ? (
                  <p className="muted-text" style={{ marginBottom: 12 }}>
                    {show.totalEpisodes - show.totalAiredEpisodes} unaired episode
                    {show.totalEpisodes - show.totalAiredEpisodes === 1 ? "" : "s"}
                  </p>
                ) : null}

                {show.overview ? (
                  <p className="show-overview">{show.overview}</p>
                ) : null}

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
                  <Link
                    className="msd-btn msd-btn-primary"
                    to={`/my-shows/${show.tvdb_id}`}
                  >
                    Open
                  </Link>

                  {(show.watch_status || "watching") === "stopped" ? (
                    <button
                      type="button"
                      className="msd-btn msd-btn-secondary"
                      onClick={() => setWatchStatus(show.tvdb_id, "watching")}
                    >
                      Resume
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="msd-btn msd-btn-secondary"
                      onClick={() => setWatchStatus(show.tvdb_id, "stopped")}
                    >
                      Stop Watching
                    </button>
                  )}

                  <button
                    type="button"
                    className="msd-btn msd-btn-secondary"
                    onClick={() => removeShow(show.tvdb_id)}
                  >
                    Remove
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
