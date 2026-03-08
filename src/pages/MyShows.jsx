import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { formatDate } from "../lib/date";

export default function MyShows() {
  const [shows, setShows] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const savedShows = JSON.parse(localStorage.getItem("myShows") || "[]")
    setShows(savedShows)
    setLoading(false)
  }, [])

  const removeShow = (tvdb_id) => {
    const updatedShows = shows.filter((show) => show.tvdb_id !== tvdb_id)
    localStorage.setItem("myShows", JSON.stringify(updatedShows))
    setShows(updatedShows)
  }

  if (loading) {
    return <div className="page">Loading...</div>
  }

  return (
    <div className="page">
      <h1>My Shows</h1>

      {shows.length === 0 && <p>No saved shows yet.</p>}

      <div className="show-list">
        {shows.map((show) => (
          <div className="show-card" key={show.tvdb_id}>
            <Link
              to={`/my-shows/${show.tvdb_id}`}
              style={{ textDecoration: "none", color: "inherit" }}
            >
              <div style={{ display: "flex", gap: "16px", alignItems: "flex-start" }}>
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
  )
}
