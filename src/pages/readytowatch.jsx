import { useEffect, useState } from "react";

export default function ReadyToWatchPage() {
  const [myShows, setMyShows] = useState([]);

  useEffect(() => {
    const savedShows = JSON.parse(localStorage.getItem("myShows")) || [];
    setMyShows(savedShows);
  }, []);

  return (
    <div>
      <h1>Ready to Watch</h1>

      {myShows.length === 0 ? (
        <p>No shows saved yet.</p>
      ) : (
        <div>
          {myShows.map((show) => (
            <div key={show.tvdb_id}>
              <h3>{show.show_name}</h3>
              <p>Ready episodes will go here</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
