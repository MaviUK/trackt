import { useState } from "react"
import axios from "axios"

export default function Search() {
  const [query, setQuery] = useState("")
  const [shows, setShows] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const search = async () => {
    if (!query.trim()) return

    setLoading(true)
    setError("")

    try {
      const res = await axios.get("/.netlify/functions/searchShows", {
        params: { q: query }
      })
      setShows(res.data || [])
    } catch (err) {
      setError("Search failed. This is expected locally unless you run with Netlify functions or deploy to Netlify.")
      setShows([])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="page">
      <h1>Search Shows</h1>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search for a show"
      />

      <button onClick={search} disabled={loading}>
        {loading ? "Searching..." : "Search"}
      </button>

      {error && <p>{error}</p>}

      <div className="show-list">
        {shows.map((show) => (
          <div className="show-card" key={show.tvdb_id || show.id}>
            <strong>{show.name}</strong>
          </div>
        ))}
      </div>
    </div>
  )
}
