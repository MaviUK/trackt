import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

export default function ReadyToWatchPage() {
  const [items, setItems] = useState([]);

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
            .filter((ep) => !watchedEpisodes[ep.id]);

          if (readyEpisodes.length > 0) {
            results.push({
              tvdb_id: show.tvdb_id,
              show_name: show.show_name,
              poster_url: show.poster_url,
              overview: show.overview,
              readyCount: readyEpisodes.length,
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

  return (
    <div>
      <h1>Ready to Watch</h1>

      {items.length === 0 ? (
        <p>No aired unwatched episodes.</p>
      ) : (
        <div className="show-list">
          {items.map((item) => (
            <Link
              key={item.tvdb_id}
              to={`/ready/${item.tvdb_id}`}
              style={{
                textDecoration: "none",
                color: "inherit",
              }}
            >
              <div
                className="show-card"
                style={{
                  display: "flex",
                  gap: "16px",
                  alignItems: "flex-start",
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
                    <p style={{ margin: 0 }}>
                      {item.overview.length > 140
                        ? `${item.overview.slice(0, 140)}...`
                        : item.overview}
                    </p>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
