import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { formatDate } from "../lib/date";

export default function ReadyShowPage() {
  const { id } = useParams();

  const [episodes, setEpisodes] = useState([]);
  const [show, setShow] = useState(null);

  useEffect(() => {
    async function loadData() {
      const savedShows = JSON.parse(localStorage.getItem("myShows")) || [];
      const matched = savedShows.find((s) => String(s.tvdb_id) === String(id));
      setShow(matched);

      const watchedEpisodes = JSON.parse(
        localStorage.getItem(`watchedEpisodes_${id}`) || "{}"
      );

      const res = await fetch(
        `/.netlify/functions/getEpisodes?tvdb_id=${id}`
      );
      const data = await res.json();

      const today = new Date();
      today.setHours(0,0,0,0);

      const ready = (data || [])
        .filter(ep => (ep.seasonNumber ?? 0) > 0)
        .filter(ep => ep.airDate || ep.aired)
        .filter(ep => {
          const d = new Date(ep.airDate || ep.aired);
          d.setHours(0,0,0,0);
          return d <= today;
        })
        .filter(ep => !watchedEpisodes[ep.id])
        .sort((a,b)=>
          new Date(a.airDate || a.aired) -
          new Date(b.airDate || b.aired)
        );

      setEpisodes(ready);
    }

    loadData();
  }, [id]);

  if (!show) return <div>Loading...</div>;

  return (
    <div className="page">
      <h1>{show.show_name}</h1>

      {episodes.length === 0 ? (
        <p>No unwatched aired episodes.</p>
      ) : (
        <div className="show-list">
          {episodes.map((ep) => (
            <div className="show-card" key={ep.id}>
              <strong>
                S{ep.seasonNumber}E{ep.number} - {ep.name}
              </strong>

              <p style={{margin:"6px 0"}}>
                {formatDate(ep.airDate || ep.aired)}
              </p>

              {ep.overview && (
                <p>
                  {ep.overview.length > 180
                    ? ep.overview.slice(0,180)+"..."
                    : ep.overview}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
