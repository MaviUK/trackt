import { useParams } from "react-router-dom"
import { useEffect, useState } from "react"
import { supabase } from "../lib/supabase"

export default function ShowDetails() {
  const { id } = useParams()

  const [show, setShow] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")

  useEffect(() => {
    const loadShow = async () => {
      try {
        const res = await fetch(`/.netlify/functions/getShow?id=${id}`)
        const data = await res.json()
        setShow(data)
      } catch (error) {
        setMessage("Failed to load show")
      } finally {
        setLoading(false)
      }
    }

    loadShow()
  }, [id])

  const saveShow = async () => {
    if (!supabase) {
      setMessage("Supabase is not set up")
      return
    }

    const {
      data: { user }
    } = await supabase.auth.getUser()

    if (!user) {
      setMessage("You need to log in first")
      return
    }

    setSaving(true)
    setMessage("")

    const { error } = await supabase.from("saved_shows").insert({
      user_id: user.id,
      tvdb_id: String(show.id),
      show_name: show.name,
      poster_url: show.image || ""
    })

    if (error) {
      setMessage(error.message)
    } else {
      setMessage("Show added to My Shows")
    }

    setSaving(false)
  }

  if (loading) {
    return <div className="page">Loading...</div>
  }

  if (!show) {
    return <div className="page">Show not found</div>
  }

  return (
    <div className="page">
      <h1>{show.name}</h1>

      {show.image && (
        <img
          src={show.image}
          alt={show.name}
          width="200"
          style={{ borderRadius: "12px" }}
        />
      )}

      <p>{show.overview}</p>

      {show.firstAired && <p>First aired: {show.firstAired}</p>}

      <button onClick={saveShow} disabled={saving}>
        {saving ? "Saving..." : "Add to My Shows"}
      </button>

      {message && <p>{message}</p>}
    </div>
  )
}
