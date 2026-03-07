import { useEffect, useState } from "react"
import { supabase } from "../lib/supabase"

export default function MyShows() {
  const [shows, setShows] = useState([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState("")

  useEffect(() => {
    const loadShows = async () => {
      if (!supabase) {
        setMessage("Supabase is not set up")
        setLoading(false)
        return
      }

      const {
        data: { user }
      } = await supabase.auth.getUser()

      if (!user) {
        setMessage("You need to log in first")
        setLoading(false)
        return
      }

      const { data, error } = await supabase
        .from("saved_shows")
        .select("*")
        .eq("user_id", user.id)
        .order("added_at", { ascending: false })

      if (error) {
        setMessage(error.message)
        setShows([])
      } else {
        setShows(data || [])
      }

      setLoading(false)
    }

    loadShows()
  }, [])

  if (loading) {
    return <div className="page">Loading...</div>
  }

  return (
    <div className="page">
      <h1>My Shows</h1>

      {message && <p>{message}</p>}

      {!message && shows.length === 0 && <p>No saved shows yet.</p>}

      <div className="show-list">
        {shows.map((show) => (
          <div className="show-card" key={show.id}>
            <div style={{ display: "flex", gap: "16px", alignItems: "flex-start" }}>
              {show.poster_url && (
                <img
                  src={show.poster_url}
                  alt={show.show_name}
                  width="80"
                  style={{ borderRadius: "8px", objectFit: "cover" }}
                />
              )}

              <div>
                <strong>{show.show_name}</strong>
                <p style={{ margin: "8px 0 0 0" }}>TVDB ID: {show.tvdb_id}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
