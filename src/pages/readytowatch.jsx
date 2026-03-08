import { useEffect, useState } from "react";
import { formatDate } from "../lib/date";

export default function ReadyToWatchPage() {
  const [items, setItems] = useState([]);
  const [openShows, setOpenShows] = useState({});

  useEffect(() => {
    async function loadReadyToWatch() {
      const savedShows = JSON.parse(localStorage.getItem("myShows")) || [];
      const results = [];

      for (const show of savedShows) {
        try {
          const res = await fetch(
            `/.netlify/functions/getEpisodes?tvdb_id=${show.tvdb_id}`
          );
          const episodes = await res.json();

          const watchedEpisodes = JSON.parse(
            localStorage.getItem(`watchedEpisodes_${show.tvdb_id}`) || "{}"
          );

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
            .filter((ep) => !watchedEpisodes[ep.id])
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
              overview: show.overview,
              readyCount: readyEpisodes.length,
              readyEpisodes,
            });
          }
        } catch (error) {
          console.error("Error loading ready episodes for", show.show_name, error);
        }
      }

      results.sort((a, b) => b.readyCount - a.readyCount);
      setItems(results);
    }

    loadReadyToWatch();
  }, []);

  function toggleShow(tvdbId) {
    setOpenShows((prev) => ({
      ...prev,
      [tvdbId]: !prev[tvdbId],
    }));
  }

  function markEpisodeWatched(showId, episodeId) {
    const watchedKey = `watchedEpisodes_${showId}`;
    const watchedEpisodes = JSON.parse(localStorage.getItem(watchedKey) || "{}");

    watchedEpisodes[episodeId] = true;
    localStorage.setItem(watchedKey, JSON.stringify(watchedEpisodes));

    setItems((prev) =>
      prev
        .map((item) => {
          if (item.tvdb_id !== showId) return item;

          const updatedEpisodes = item.readyEpisodes.filter(
            (ep) => ep.id !== episodeId
          );

          return {
            ...item,
            readyCount: updatedEpisodes.length,
            readyEpisodes: updatedEpisodes,
          };
        })
        .filter((item) => item.readyCount > 0)
    );
  }

  return (
    <div>
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
                style={{
                  marginBottom: "20px",
                }}
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
                      {item.readyCount} episode{item.readyCount !== 1 ? "s" : ""} ready to watch
                    </p>

                    {item.overview && (
                      <p style={{ margin: "0 0 8px 0" }}>
                        {item.overview.length > 140
                          ? `${item.overview.slice(0, 140)}...`
                          : item.overview}
                      </p>
                    )}

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

                        {ep.overview && (
                          <p style={{ margin: "8px 0 0 0" }}>
                            {ep.overview.length > 180
                              ? `${ep.overview.slice(0, 180)}...`
                              : ep.overview}
                          </p>
                        )}

                        <div style={{ marginTop: "10px" }}>
                          <button
                            onClick={() =>
                              markEpisodeWatched(item.tvdb_id, ep.id)
                            }
                          >
                            Mark Watched
                          </button>
                        </div>
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
