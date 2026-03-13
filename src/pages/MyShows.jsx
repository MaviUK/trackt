import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { formatDate } from "../lib/date";
import { supabase } from "../lib/supabase";
import { getCachedEpisodes } from "../lib/episodesCache";

export default function MyShows() {
  const [shows, setShows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState("alphabetical");

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

        if (!watchedByShow[showId]) {
          watchedByShow[showId] = 0;
        }

        watchedByShow[showId]++;
      });

      const updatedShows = await Promise.all(
        (data || []).map(async (show) => {
          let totalEpisodes = 0;
          let nextEpisodeDate = null;

          try {
            const episodes = await getCachedEpisodes(show.tvdb_id);
            const normalEpisodes = (episodes || []).filter(
              (ep) => (ep.seasonNumber ?? 0) > 0
            );

            totalEpisodes = normalEpisodes.length;

            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const upcomingEpisodes = normalEpisodes
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
          } catch (error) {
            console.error(
              "Failed to load show episode info for",
              show.show_name,
              error
            );
          }

          return {
            ...show,
            watchedCount: watchedByShow[String(show.tvdb_id)] || 0,
            totalEpisodes,
            nextEpisodeDate,
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

  const sortedShows = [...shows].sort((a, b) => {
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

  if (loading) {
    return <div className="page">Loading...</div>;
  }

  return (
    <div className="page">
      <h1>My Shows</h1>

      {shows.length === 0 && <p>No saved shows yet.</p>}

      {shows.length > 0 && (
        <div style={{ marginBottom: "20px" }}>
          <label style={{ marginRight: "10px" }}>Sort by:</label>

          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            <option value="alphabetical">Alphabetical</option>
            <option value="recent">Recently Added</option>
            <option value="firstaired">First Aired</option>
          </select>
        </div>
      )}

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
                    style={{ borderRadius: "8px", objectFit: "cover" }}
                  />
                )}

                <div style={{ flex: 1 }}>
                  <strong>{show.show_name}</strong>

                  {show.first_aired && (
                    <p style={{ margin: "8px 0 0 0" }}>
                      First aired: {formatDate(show.first_aired)}
                    </p>
                  )}

                 <p style={{ margin: "8px 0 0 0", fontWeight: "600" }}>
  {show.watchedCount || 0} / {show.totalEpisodes || 0} watched
</p>

{show.totalEpisodes > 0 && show.watchedCount >= show.totalEpisodes && (
  <p style={{ margin: "8px 0 0 0", color: "#16a34a", fontWeight: "700" }}>
    Completed
  </p>
)}

<div
  style={{
    marginTop: "8px",
    width: "100%",
    height: "10px",
    background: "#e5e7eb",
    borderRadius: "999px",
    overflow: "hidden",
  }}
>
  <div
    style={{
      width: `${
        show.totalEpisodes > 0
          ? (show.watchedCount / show.totalEpisodes) * 100
          : 0
      }%`,
      height: "100%",
      background:
        show.totalEpisodes > 0 && show.watchedCount >= show.totalEpisodes
          ? "#16a34a"
          : "#22c55e",
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
              style={{ marginTop: "10px" }}
              onClick={() => removeShow(show.tvdb_id)}
            >
              Remove
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
