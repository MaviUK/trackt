async function fetchExternalIds(tmdbId) {
  const res = await fetch(
    `https://api.themoviedb.org/3/tv/${tmdbId}/external_ids`,
    {
      headers: {
        accept: "application/json",
        Authorization: `Bearer ${process.env.TMDB_BEARER_TOKEN}`,
      },
    }
  );

  if (!res.ok) return null;

  const json = await res.json();
  return json;
}

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

    const baseShows = json.results || [];

    const shows = (
      await Promise.all(
        baseShows.map(async (show) => {
          const externalIds = await fetchExternalIds(show.id);

          return {
            id: show.id,
            tmdb_id: show.id,
            tvdb_id: externalIds?.tvdb_id || null,
            name: show.name || "Unknown title",
            image: show.poster_path
              ? `https://image.tmdb.org/t/p/w500${show.poster_path}`
              : null,
            overview: show.overview || "",
            year: show.first_air_date ? show.first_air_date.slice(0, 4) : null,
          };
        })
      )
    ).filter((show) => show.tvdb_id);

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
