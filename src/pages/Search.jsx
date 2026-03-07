import { useState } from "react"

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
      const res = await fetch(`/.netlify/functions/searchShows?q=${encodeURIComponent(query)}`)
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data?.message || "Search failed")
      }

      setShows(data || [])
    } catch (err) {
      setError(err.message)
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
