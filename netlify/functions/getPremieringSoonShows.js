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
  return res.json();
}

function formatDateOnly(date) {
  return date.toISOString().slice(0, 10);
}

export async function handler() {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const in30Days = new Date(today);
    in30Days.setDate(in30Days.getDate() + 30);

    const from = formatDateOnly(today);
    const to = formatDateOnly(in30Days);

    const res = await fetch(
      `https://api.themoviedb.org/3/discover/tv?language=en-US&sort_by=first_air_date.asc&first_air_date.gte=${from}&first_air_date.lte=${to}&page=1`,
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
            first_air_date: show.first_air_date || null,
          };
        })
      )
    )
      .filter((show) => show.tvdb_id && show.first_air_date)
      .sort(
        (a, b) => new Date(a.first_air_date) - new Date(b.first_air_date)
      );

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
        message: error.message || "Failed to load premiering soon shows",
      }),
    };
  }
}
