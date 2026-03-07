import { useParams } from "react-router-dom"
import { useEffect, useMemo, useState } from "react"

export default function ShowDetails() {
  const { id } = useParams()

  const [show, setShow] = useState(null)
  const [episodes, setEpisodes] = useState([])
  const [openSeasons, setOpenSeasons] = useState({})
  const [watchedEpisodes, setWatchedEpisodes] = useState({})
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

  useEffect(() => {
    const savedWatched = JSON.parse(
      localStorage.getItem(`watchedEpisodes_${id}`) || "{}"
    )
    setWatchedEpisodes(savedWatched)
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

  const toggleSeason = (season) => {
    setOpenSeasons((prev) => ({
      ...prev,
      [season]: !prev[season]
    }))
  }

  const toggleWatched = (episodeId) => {
    const updated = {
      ...watchedEpisodes,
      [episodeId]: !watchedEpisodes[episodeId]
    }

    if (!updated[episodeId]) {
      delete updated[episodeId]
    }

    setWatchedEpisodes(updated)
    localStorage.setItem(`watchedEpisodes_${id}`, JSON.stringify(updated))
  }

  const episodesBySeason = useMemo(() => {
    const grouped = {}

    episodes.forEach((episode) => {
      const season = episode.seasonNumber

      if (!season || season === 0) {
        return
      }

      if (!grouped[season]) {
        grouped[season] = []
      }

      grouped[season].push(episode)
    })

    Object.keys(grouped).forEach((season) => {
      grouped[season].sort((a, b) => (a.number ?? 0) - (b.number ?? 0))
    })

    return Object.entries(grouped).sort((a, b) => Number(a[0]) - Number(b[0]))
  }, [episodes])

  const isSeasonFullyWatched = (seasonEpisodes) => {
    if (!seasonEpisodes.length) return false
    return seasonEpisodes.every((episode) => watchedEpisodes[episode.id])
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

      {episodesBySeason.length === 0 && <p>No episodes found.</p>}

      {episodesBySeason.map(([season, seasonEpisodes]) => {
        const isOpen = !!openSeasons[season]
        const fullyWatched = isSeasonFullyWatched(seasonEpisodes)

        return (
          <div
            key={season}
            style={{
              marginBottom: "20px",
              borderRadius: "12px",
              padding: "12px",
              background: fullyWatched ? "#dcfce7" : "#f8fafc",
              border: fullyWatched ? "1px solid #86efac" : "1px solid #e5e7eb"
            }}
          >
            <button
              onClick={() => toggleSeason(season)}
              style={{
                width: "100%",
                textAlign: "left",
                background: "transparent",
                border: "none",
                padding: "0",
                fontSize: "20px",
                fontWeight: "700",
                cursor: "pointer"
              }}
            >
              Season {season} {isOpen ? "−" : "+"}
              {fullyWatched ? " ✓" : ""}
            </button>

            {isOpen && (
              <div className="show-list" style={{ marginTop: "12px" }}>
                {seasonEpisodes.map((episode) => {
                  const watched = !!watchedEpisodes[episode.id]

                  return (
                    <div
                      className="show-card"
                      key={episode.id}
                      style={{
                        background: watched ? "#ecfdf5" : "white",
                        border: watched ? "1px solid #86efac" : "1px solid #e5e7eb"
                      }}
                    >
                      <strong>
                        E{episode.number ?? "?"} - {episode.name}
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

                      <button
                        onClick={() => toggleWatched(episode.id)}
                        style={{ marginTop: "10px" }}
                      >
                        {watched ? "Watched" : "Mark as Watched"}
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
