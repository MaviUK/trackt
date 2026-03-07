import axios from "axios"

export async function handler(event) {

  const query = event.queryStringParameters.q

  const login = await axios.post(
    "https://api4.thetvdb.com/v4/login",
    {
      apikey: process.env.TVDB_API_KEY,
      pin: process.env.TVDB_PIN
    }
  )

  const token = login.data.data.token

  const result = await axios.get(
    `https://api4.thetvdb.com/v4/search?query=${query}`,
    {
      headers:{
        Authorization:`Bearer ${token}`
      }
    }
  )

  return {
    statusCode:200,
    body:JSON.stringify(result.data.data)
  }

}
