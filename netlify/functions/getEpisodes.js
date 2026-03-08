export async function handler(event) {
  try {
    const id = event.queryStringParameters?.tvdb_id

    const loginRes = await fetch("https://api4.thetvdb.com/v4/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        apikey: process.env.TVDB_API_KEY
      })
    })

    const loginData = await loginRes.json()

    if (!loginRes.ok) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          message: "TVDB login failed",
          details: loginData
        })
      }
    }

    const token = loginData?.data?.token

    const episodesRes = await fetch(
      `https://api4.thetvdb.com/v4/series/${id}/episodes/default`,
      {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    )

    const episodesData = await episodesRes.json()

    if (!episodesRes.ok) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          message: "TVDB episodes failed",
          details: episodesData
        })
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify(episodesData.data?.episodes || [])
    }
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: "Function crashed",
        details: error.message
      })
    }
  }
}
