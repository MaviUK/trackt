import { useParams } from "react-router-dom"
import { useEffect, useState } from "react"

export default function ShowDetails() {
  const { id } = useParams()

  const [show, setShow] = useState(null)
  const [episodes, setEpisodes] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")

  useEffect(() => {
    const loadData = async () => {
      try {
        const showRes = await fetch(`/.netlify/functions/getShow?id=${id}`)
        const showData = await showRes.json()

        const episodesRes = await fetch(`/.netlify/functions/getEpisodes?id=${id}`)
        const episodesData = await episodesRes.json()

        setShow(showData)
        setEpisodes(episodesData || [])
      } catch (error) {
        setMessage("Failed to load show")
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [id])

  const saveShow = () => {
    if (!show) return

    setSaving(true)
    setMessage("")

    const existingShows = JSON.parse(localStorage.getItem("myShows") || "[]")

    const alreadySaved = existingShows.some(
      (savedShow) => String(savedShow.tvdb_id) === String(show.id)
    )

    if (alreadySaved) {
      setMessage("Show already in My Shows")
      setSaving(false)
      return
    }

    const newShow = {
      tvdb_id: String(show.id),
      show_name: show.name,
      poster_url: show.image || "",
      overview: show.overview || "",
      first_aired: show.firstAired || ""
    }

    localStorage.setItem("myShows", JSON.stringify([newShow, ...existingShows]))

    setMessage("Show added to My Shows")
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

      <hr style={{ margin: "24px 0" }} />

      <h2>Episodes</h2>

      {episodes.length === 0 && <p>No episodes found.</p>}

      <div className="show-list">
        {episodes.map((episode) => (
          <div className="show-card" key={episode.id}>
            <strong>
              S{episode.seasonNumber ?? "?"} E{episode.number ?? "?"} - {episode.name}
            </strong>

            {episode.aired && (
              <p style={{ margin: "8px 0 0 0" }}>
                Air date: {episode.aired}
              </p>
            )}

            {episode.overview && (
              <p style={{ margin: "8px 0 0 0" }}>
                {episode.overview.length > 180
                  ? `${episode.overview.slice(0, 180)}...`
                  : episode.overview}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
