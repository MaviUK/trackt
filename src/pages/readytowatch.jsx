import { useEffect, useState } from "react";
import { formatDate } from "../lib/date";
import { supabase } from "../lib/supabase";
import { getCachedEpisodes } from "../lib/episodesCache";

export default function ReadyToWatchPage() {
  const [items, setItems] = useState([]);
  const [openShows, setOpenShows] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadReadyToWatch() {
      setLoading(true);

      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          setItems([]);
          setLoading(false);
          return;
        }

        const { data: savedShows, error } = await supabase
          .from("user_shows")
          .select("*")
          .eq("user_id", user.id);

        if (error) {
          console.error("Error loading saved shows:", error);
          setItems([]);
          setLoading(false);
          return;
        }

        const { data: watchedRows, error: watchedError } = await supabase
          .from("watched_episodes")
          .select("episode_id")
          .eq("user_id", user.id);

        if (watchedError) {
          console.error("Error loading watched episodes:", watchedError);
        }

        const watchedMap = {};
        (watchedRows || []).forEach((row) => {
          watchedMap[String(row.episode_id)] = true;
        });

        const results = [];

        for (const show of savedShows || []) {
          try {
            const episodes = await getCachedEpisodes(show.tvdb_id);

            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const readyEpisodes = episodes
              .filter((ep) => (ep.seasonNumber ?? 0) > 0)
              .filter((ep) => ep.airDate || ep.aired)
              .filter((ep) => {
                const airDate = new Date(ep.airDate || ep.aired);
                airDate.setHours(0, 0, 0, 0);
                return airDate <= today;
              })
              .filter((ep) => !watchedMap[String(ep.id)])
              .sort(
                (a, b) =>
                  new Date(a.airDate || a.aired) -
                  new Date(b.airDate || b.aired)
              );

            if (readyEpisodes.length > 0) {
              results.push({
                tvdb_id: show.tvdb_id,
                show_name: show.show_name,
                poster_url: show.poster_url,
                readyCount: readyEpisodes.length,
                readyEpisodes,
              });
            }
          } catch (error) {
            console.error(
              "Error loading ready episodes for",
              show.show_name,
              error
            );
          }
        }

        results.sort((a, b) => b.readyCount - a.readyCount);
        setItems(results);
      } catch (error) {
        console.error("Error loading Ready to Watch:", error);
        setItems([]);
      } finally {
        setLoading(false);
      }
    }

    loadReadyToWatch();
  }, []);

  function toggleShow(tvdbId) {
    setOpenShows((prev) => ({
      ...prev,
      [tvdbId]: !prev[tvdbId],
    }));
  }

  const markEpisodeWatched = async (showId, episodeId) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    const { error } = await supabase.from("watched_episodes").insert({
      user_id: user.id,
      show_tvdb_id: String(showId),
      episode_id: String(episodeId),
    });

    if (error) {
      console.error("Failed to mark watched:", error);
      return;
    }

    setItems((prev) =>
      prev
        .map((item) => {
          if (String(item.tvdb_id) !== String(showId)) return item;

          const updatedEpisodes = item.readyEpisodes.filter(
            (ep) => String(ep.id) !== String(episodeId)
          );

          return {
            ...item,
            readyCount: updatedEpisodes.length,
            readyEpisodes: updatedEpisodes,
          };
        })
        .filter((item) => item.readyCount > 0)
    );
  };

  if (loading) {
    return <div className="page">Loading...</div>;
  }

  return (
    <div className="page">
      <h1>Ready to Watch</h1>

      {items.length === 0 ? (
        <p>No aired unwatched episodes.</p>
      ) : (
        <div className="show-list">
          {items.map((item) => {
            const isOpen = !!openShows[item.tvdb_id];

            return (
              <div
                key={item.tvdb_id}
                className="show-card"
                style={{ marginBottom: "20px" }}
              >
                <div
                  onClick={() => toggleShow(item.tvdb_id)}
                  style={{
                    display: "flex",
                    gap: "16px",
                    alignItems: "flex-start",
                    cursor: "pointer",
                  }}
                >
                  {item.poster_url && (
                    <img
                      src={item.poster_url}
                      alt={item.show_name}
                      style={{
                        width: "80px",
                        borderRadius: "8px",
                        objectFit: "cover",
                        flexShrink: 0,
                      }}
                    />
                  )}

                  <div style={{ flex: 1 }}>
                    <h3 style={{ margin: "0 0 8px 0" }}>{item.show_name}</h3>

                    <p style={{ margin: "0 0 8px 0", fontWeight: "600" }}>
                      {item.readyCount} episode
                      {item.readyCount !== 1 ? "s" : ""} ready to watch
                    </p>

                    <p style={{ margin: 0, fontWeight: "600" }}>
                      {isOpen ? "Hide episodes ▲" : "Show episodes ▼"}
                    </p>
                  </div>
                </div>

                {isOpen && (
                  <div style={{ marginTop: "16px" }}>
                    {item.readyEpisodes.map((ep) => (
                      <div
                        key={ep.id}
                        style={{
                          border: "1px solid #e5e7eb",
                          borderRadius: "10px",
                          padding: "12px",
                          marginBottom: "12px",
                          background: "#fff",
                        }}
                      >
                        <strong>
                          S{ep.seasonNumber}E{ep.number ?? "?"} - {ep.name}
                        </strong>

                        <p style={{ margin: "8px 0 0 0" }}>
                          Air date: {formatDate(ep.airDate || ep.aired)}
                        </p>

                        <button
                          style={{ marginTop: "10px" }}
                          onClick={() =>
                            markEpisodeWatched(item.tvdb_id, ep.id)
                          }
                        >
                          Mark Watched
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
