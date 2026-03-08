import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { formatDate } from "../lib/date";
import { supabase } from "../lib/supabase";

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
      } else {
        setShows(data || []);
      }

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

    setShows((prev) => prev.filter((show) => String(show.tvdb_id) !== String(tvdb_id)));
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
