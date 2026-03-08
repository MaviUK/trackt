import { useEffect, useState } from "react";

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
              readyCount: readyEpisodes.length,
            });
          }
        } catch (error) {
          console.error("Error loading ready episodes for", show.show_name, error);
        }
      }

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
        <div>
          {items.map((item) => (
            <div key={item.tvdb_id}>
              <h3>{item.show_name}</h3>
              <p>{item.readyCount} episode(s) ready to watch</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
