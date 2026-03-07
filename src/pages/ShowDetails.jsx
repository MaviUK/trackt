import { useParams } from "react-router-dom"
import { useEffect, useState } from "react"

export default function ShowDetails() {
  const { id } = useParams()

  const [show, setShow] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadShow = async () => {
      const res = await fetch(`/.netlify/functions/getShow?id=${id}`)
      const data = await res.json()
      setShow(data)
      setLoading(false)
    }

    loadShow()
  }, [id])

  if (loading) {
    return <div className="page">Loading...</div>
  }

  return (
    <div className="page">
      <h1>{show.name}</h1>

      {show.image && (
        <img
          src={show.image}
          alt={show.name}
          width="200"
        />
      )}

      <p>{show.overview}</p>

      {show.firstAired && (
        <p>First aired: {show.firstAired}</p>
      )}
    </div>
  )
}
