export async function handler() {
  try {
    const res = await fetch(
      "https://api.themoviedb.org/3/trending/tv/week?language=en-US",
      {
        headers: {
          accept: "application/json",
          Authorization: `Bearer ${process.env.TMDB_BEARER_TOKEN}`,
        },
      }
    );

    const json = await res.json();

    if (!res.ok) {
      return {
        statusCode: res.status,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
        body: JSON.stringify(json),
      };
    }

    const shows = (json.results || []).map((show) => ({
      id: show.id,
      name: show.name || "Unknown title",
      image: show.poster_path
        ? `https://image.tmdb.org/t/p/w500${show.poster_path}`
        : null,
      overview: show.overview || "",
      year: show.first_air_date ? show.first_air_date.slice(0, 4) : null,
    }));

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
      body: JSON.stringify({ shows }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
      body: JSON.stringify({
        message: error.message || "Failed to load TMDB trending shows",
      }),
    };
  }
}
