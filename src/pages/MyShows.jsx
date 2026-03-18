import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";

export default function MyShows() {
  const [shows, setShows] = useState([]);
  const [loading, setLoading] = useState(true);

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
          show_id,
          shows!inner(
            id,
            tvdb_id,
            name,
            poster_url
          )
        `)
        .eq("user_id", user.id);

      if (error) throw error;

      const cleaned = (data || []).map((row) => ({
        show_id: row.show_id,
        tvdb_id: row.shows.tvdb_id,
        name: row.shows.name || "Unknown title",
        poster: row.shows.poster_url || null,
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

      {shows.length === 0 ? (
        <p>No shows yet.</p>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
            gap: 20,
          }}
        >
          {shows.map((show) => (
            <Link
              key={show.show_id}
              to={`/my-shows/${show.tvdb_id}`}
              style={{
                textDecoration: "none",
                color: "inherit",
              }}
            >
              <div style={{ cursor: "pointer" }}>
                {show.poster ? (
                  <img
                    src={show.poster}
                    alt={show.name}
                    style={{
                      width: "100%",
                      aspectRatio: "2 / 3",
                      objectFit: "cover",
                      borderRadius: 14,
                      background: "#111827",
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
