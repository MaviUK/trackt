import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";

export default function MyShows() {
  const [shows, setShows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterBy, setFilterBy] = useState("all");
  const [sortBy, setSortBy] = useState("alphabetical");

  async function loadShows() {
    try {
      setLoading(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setShows([]);
        return;
      }

      const { data, error } = await supabase
        .from("user_shows_new")
        .select(`
          watch_status,
          added_at,
          shows!inner(
            id,
            tvdb_id,
            name,
            poster_url,
            status,
            first_aired
          )
        `)
        .eq("user_id", user.id);

      if (error) throw error;

      const cleaned = (data || []).map((row) => ({
        tvdb_id: row.shows.tvdb_id,
        name: row.shows.name || "Unknown title",
        poster: row.shows.poster_url || null,
        status: row.shows.status,
        watch_status: row.watch_status || "watching",
        added_at: row.added_at,
        first_aired: row.shows.first_aired,
      }));

      setShows(cleaned);
    } catch (err) {
      console.error("Failed loading shows:", err);
      setShows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadShows();
  }, []);

  // ✅ FILTERS
  const filteredShows = useMemo(() => {
    return shows.filter((show) => {
      if (filterBy === "all") return true;
      if (filterBy === "watching") return show.watch_status === "watching";
      if (filterBy === "stopped") return show.watch_status === "stopped";
      if (filterBy === "airing") return show.status === "Airing";
      if (filterBy === "ended") return show.status === "Ended";
      return true;
    });
  }, [shows, filterBy]);

  // ✅ SORTING
  const sortedShows = useMemo(() => {
    const list = [...filteredShows];

    if (sortBy === "alphabetical") {
      return list.sort((a, b) => a.name.localeCompare(b.name));
    }

    if (sortBy === "recent") {
      return list.sort(
        (a, b) => new Date(b.added_at) - new Date(a.added_at)
      );
    }

    if (sortBy === "firstaired") {
      return list.sort(
        (a, b) => new Date(a.first_aired || 0) - new Date(b.first_aired || 0)
      );
    }

    return list;
  }, [filteredShows, sortBy]);

  if (loading) {
    return (
      <div className="page">
        <h1>My Shows</h1>
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div className="page">
      <h1 style={{ marginBottom: 20 }}>My Shows</h1>

      {/* 🔥 FILTER TABS */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        {["all", "watching", "stopped", "airing", "ended"].map((f) => (
          <button
            key={f}
            onClick={() => setFilterBy(f)}
            className="msd-btn msd-btn-secondary"
            style={{ opacity: filterBy === f ? 1 : 0.6 }}
          >
            {f.toUpperCase()}
          </button>
        ))}
      </div>

      {/* 🔥 SORT */}
      <div style={{ marginBottom: 20 }}>
        <label>
          Sort by{" "}
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            <option value="alphabetical">Alphabetical</option>
            <option value="recent">Recently Added</option>
            <option value="firstaired">First Aired</option>
          </select>
        </label>
      </div>

      {sortedShows.length === 0 ? (
        <p>No shows found.</p>
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
              key={show.tvdb_id}
              to={`/my-shows/${show.tvdb_id}`}
              style={{ textDecoration: "none", color: "inherit" }}
            >
              <div
                style={{
                  cursor: "pointer",
                  transition: "0.2s",
                }}
              >
                {show.poster ? (
                  <img
                    src={show.poster}
                    alt={show.name}
                    style={{
                      width: "100%",
                      aspectRatio: "2 / 3",
                      objectFit: "cover",
                      borderRadius: 14,
                      marginBottom: 10,
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: "100%",
                      aspectRatio: "2 / 3",
                      borderRadius: 14,
                      background: "#111827",
                      marginBottom: 10,
                    }}
                  />
                )}

                <div
                  style={{
                    fontWeight: 700,
                    fontSize: "0.95rem",
                    lineHeight: 1.3,
                  }}
                >
                  {show.name}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
