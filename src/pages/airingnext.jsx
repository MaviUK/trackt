import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { formatDate } from "../lib/date";

function formatDate(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric"
  });
}

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
<Link
  key={item.tvdb_id}
  to={`/my-shows/${item.tvdb_id}`}
  style={{
    display: "flex",
    gap: "16px",
    alignItems: "flex-start",
    textDecoration: "none",
    color: "inherit",
    marginBottom: "20px",
    padding: "16px",
    border: "1px solid #ddd",
    borderRadius: "12px",
    background: "#fff",
    boxShadow: "0 2px 8px rgba(0,0,0,0.06)"
  }}
>
  <img
    src={item.poster_url}
    alt={item.show_name}
    style={{
      width: "90px",
      borderRadius: "8px",
      objectFit: "cover"
    }}
  />

  <div>
    <h3 style={{ margin: "0 0 8px 0" }}>{item.show_name}</h3>
    <p style={{ margin: "0 0 6px 0" }}>
      S{item.nextEpisode.seasonNumber}E{item.nextEpisode.episodeNumber || item.nextEpisode.number}
    </p>
    <p style={{ margin: "0 0 6px 0" }}>{item.nextEpisode.name}</p>
    <p style={{ margin: 0 }}>
  {formatDate(item.nextEpisode.airDate || item.nextEpisode.aired)}
</p>
  </div>
</Link>
))}
        </div>
      )}
    </div>
  );
}
