import { useState } from "react"
import axios from "axios"

export default function Search(){

  const [query,setQuery] = useState("")
  const [shows,setShows] = useState([])

  const search = async () => {

    const res = await axios.get("/.netlify/functions/searchShows",{
      params:{q:query}
    })

    setShows(res.data)
  }

  return(
    <div>

      <h1>Search Shows</h1>

      <input
        value={query}
        onChange={(e)=>setQuery(e.target.value)}
      />

      <button onClick={search}>Search</button>

      {shows.map(show=>(
        <div key={show.id}>
          {show.name}
        </div>
      ))}

    </div>
  )
}
