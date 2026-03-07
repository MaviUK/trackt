export async function handler(event) {
  try {
    const id = event.queryStringParameters.id

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
    const token = loginData.data.token

    const showRes = await fetch(
      `https://api4.thetvdb.com/v4/series/${id}`,
      {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    )

    const showData = await showRes.json()

    return {
      statusCode: 200,
      body: JSON.stringify(showData.data)
    }

  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: error.message
      })
    }
  }
}
