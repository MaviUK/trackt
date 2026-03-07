import { useParams } from "react-router-dom"

export default function ShowDetails() {
  const { id } = useParams()

  return (
    <div className="page">
      <h1>Show Details</h1>
      <p>TVDB ID: {id}</p>
    </div>
  )
}
