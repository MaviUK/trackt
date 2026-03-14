export async function handler(event) {
  try {
    const id = event.queryStringParameters?.id;

    if (!id) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: "Missing show id" }),
      };
    }

    const loginRes = await fetch("https://api4.thetvdb.com/v4/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        apikey: process.env.TVDB_API_KEY,
        pin: process.env.TVDB_PIN,
      }),
    });

    const loginData = await loginRes.json();

    if (!loginRes.ok || !loginData?.data?.token) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          message: "Failed to authenticate with TVDB",
          details: loginData,
        }),
      };
    }

    const token = loginData.data.token;

    const showRes = await fetch(
      `https://api4.thetvdb.com/v4/series/${encodeURIComponent(id)}/extended`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      }
    );

    const showData = await showRes.json();

    if (!showRes.ok) {
      return {
        statusCode: showRes.status,
        body: JSON.stringify({
          message: "Failed to fetch show from TVDB",
          details: showData,
        }),
      };
    }

    const series = showData?.data;

    if (!series) {
      return {
        statusCode: 404,
        body: JSON.stringify({ message: "Show not found" }),
      };
    }

    const image =
      series.image ||
      series.artworks?.find((a) => a.image)?.image ||
      "";

    return {
      statusCode: 200,
      body: JSON.stringify({
        tvdb_id: String(series.id),
        name: series.name || "",
        overview: series.overview || "",
        first_aired: series.firstAired || null,
        image_url: image,
      }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: "Unexpected error loading show",
        error: error.message,
      }),
    };
  }
}
