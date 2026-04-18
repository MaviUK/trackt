export async function handler(event) {
  try {
    const tmdbId = event.queryStringParameters?.tmdbId;

    if (!tmdbId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: "Missing tmdbId" }),
      };
    }

    if (!process.env.TMDB_API_KEY) {
      return {
        statusCode: 500,
        body: JSON.stringify({ message: "Missing TMDB API key" }),
      };
    }

    const response = await fetch(
      `https://api.themoviedb.org/3/tv/${encodeURIComponent(
        tmdbId
      )}?api_key=${process.env.TMDB_API_KEY}&language=en-GB`
    );

    const data = await response.json();

    if (!response.ok) {
      return {
        statusCode: response.status,
        body: JSON.stringify({
          message: data?.status_message || "Failed to fetch TMDB show",
        }),
      };
    }

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
      body: JSON.stringify({
        id: data.id,
        tmdb_id: data.id,
        name: data.name,
        overview: data.overview || "",
        first_air_date: data.first_air_date || null,
        number_of_seasons: data.number_of_seasons || 0,
        number_of_episodes: data.number_of_episodes || 0,
        vote_average: data.vote_average || null,
        poster_url: data.poster_path
          ? `https://image.tmdb.org/t/p/w500${data.poster_path}`
          : null,
        backdrop_url: data.backdrop_path
          ? `https://image.tmdb.org/t/p/original${data.backdrop_path}`
          : null,
        seasons: Array.isArray(data.seasons) ? data.seasons : [],
      }),
    };
  } catch (error) {
    console.error("getTmdbShowDetails error", error);

    return {
      statusCode: 500,
      body: JSON.stringify({ message: "Server error" }),
    };
  }
}
