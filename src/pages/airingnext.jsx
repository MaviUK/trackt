import { useEffect, useState } from "react";

export default function AiringNextPage() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    async function loadAiringNext() {
      const savedShows = JSON.parse(localStorage.getItem("myShows")) || [];
      const results = [];

      for (const show of savedShows) {
        try {
          const res = await fetch(
            `/.netlify/functions/getEpisodes?tvdb_id=${show.tvdb_id}`
          );
          const episodes = await res.json();
          console.log("EPISODES FOR", show.show_name, episodes);

          const today = new Date();
          today.setHours(0, 0, 0, 0);

          const upcomingEpisodes = episodes
            .filter((ep) => {
  const dateValue = ep.airDate || ep.aired;
  const airDate = new Date(dateValue);
  airDate.setHours(0, 0, 0, 0);
  return airDate >= today;
})
.sort((a, b) => new Date(a.airDate || a.aired) - new Date(b.airDate || b.aired));
          const nextEpisode = upcomingEpisodes[0];

          if (nextEpisode) {
            results.push({
              tvdb_id: show.tvdb_id,
              show_name: show.show_name,
              poster_url: show.poster_url,
              nextEpisode,
            });
          }
        } catch (error) {
          console.error("Error loading episodes for show:", show.show_name, error);
        }
      }

      results.sort(
        (a, b) =>
          new Date(a.nextEpisode.airDate) - new Date(b.nextEpisode.airDate)
      );

      setItems(results);
    }

    loadAiringNext();
  }, []);

  return (
    <div>
      <h1>Airing Next</h1>

      {items.length === 0 ? (
        <p>No upcoming episodes.</p>
      ) : (
        <div>
          {items.map((item) => (
            <div key={item.tvdb_id}>
              <img
                src={item.poster_url}
                alt={item.show_name}
                style={{ width: "120px", borderRadius: "8px" }}
              />
              <h3>{item.show_name}</h3>
              <p>
                S{item.nextEpisode.seasonNumber}E{item.nextEpisode.episodeNumber || item.nextEpisode.number}
              </p>
              <p>{item.nextEpisode.airDate || item.nextEpisode.aired}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
