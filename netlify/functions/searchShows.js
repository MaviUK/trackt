export async function handler(event) {
  try {
    const query = event.queryStringParameters?.q || ""

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

    const token = loginData.data.token

    const searchRes = await fetch(
      `https://api4.thetvdb.com/v4/search?query=${encodeURIComponent(query)}`,
      {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    )

    const searchData = await searchRes.json()

    return {
      statusCode: 200,
      body: JSON.stringify(searchData.data || [])
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
