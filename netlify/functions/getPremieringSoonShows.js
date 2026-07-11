const MAX_PAGES = 4;
const MAX_SHOWS = 36;

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=900, s-maxage=21600",
    },
    body: JSON.stringify(body),
  };
}

function formatDateOnly(date) {
  return date.toISOString().slice(0, 10);
}

function buildTmdbUrl({ from, to, page }) {
  const params = new URLSearchParams({
    language: "en-GB",
    sort_by: "popularity.desc",
    first_air_date_gte: from,
    first_air_date_lte: to,
    include_adult: "false",
    include_null_first_air_dates: "false",
    page: String(page),
  });

  if (process.env.TMDB_API_KEY) {
    params.set("api_key", process.env.TMDB_API_KEY);
  }

  return `https://api.themoviedb.org/3/discover/tv?${params.toString()}`;
}

async function fetchTmdbPage({ from, to, page }) {
  const headers = { accept: "application/json" };

  if (process.env.TMDB_BEARER_TOKEN) {
    headers.Authorization = `Bearer ${process.env.TMDB_BEARER_TOKEN}`;
  }

  const response = await fetch(buildTmdbUrl({ from, to, page }), { headers });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(
      payload?.status_message || `TMDB request failed with ${response.status}`
    );
  }

  return payload;
}

function normalizeShow(show) {
  if (!show?.id || !show?.first_air_date || !show?.poster_path) return null;

  return {
    id: show.id,
    tmdb_id: show.id,
    tvdb_id: null,
    name: show.name || show.original_name || "Unknown title",
    original_name: show.original_name || null,
    image: `https://image.tmdb.org/t/p/w500${show.poster_path}`,
    poster_url: `https://image.tmdb.org/t/p/w500${show.poster_path}`,
    overview: show.overview || "",
    first_air_date: show.first_air_date,
    popularity: Number(show.popularity || 0),
    vote_average: Number(show.vote_average || 0),
    vote_count: Number(show.vote_count || 0),
    original_language: show.original_language || null,
    origin_country: Array.isArray(show.origin_country)
      ? show.origin_country
      : [],
  };
}

export async function handler() {
  try {
    if (!process.env.TMDB_BEARER_TOKEN && !process.env.TMDB_API_KEY) {
      return jsonResponse(500, {
        message: "Missing TMDB_BEARER_TOKEN or TMDB_API_KEY",
      });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const in30Days = new Date(today);
    in30Days.setDate(in30Days.getDate() + 30);

    const from = formatDateOnly(today);
    const to = formatDateOnly(in30Days);

    const firstPage = await fetchTmdbPage({ from, to, page: 1 });
    const totalPages = Math.max(
      1,
      Math.min(Number(firstPage?.total_pages || 1), MAX_PAGES)
    );

    const remainingPages =
      totalPages > 1
        ? await Promise.all(
            Array.from({ length: totalPages - 1 }, (_, index) =>
              fetchTmdbPage({ from, to, page: index + 2 })
            )
          )
        : [];

    const deduped = new Map();

    [firstPage, ...remainingPages].forEach((pagePayload) => {
      (pagePayload?.results || []).forEach((rawShow) => {
        const show = normalizeShow(rawShow);
        if (!show) return;

        const existing = deduped.get(String(show.tmdb_id));
        if (!existing || show.popularity > existing.popularity) {
          deduped.set(String(show.tmdb_id), show);
        }
      });
    });

    const shows = [...deduped.values()]
      .sort((a, b) => {
        if (a.first_air_date !== b.first_air_date) {
          return a.first_air_date.localeCompare(b.first_air_date);
        }

        return b.popularity - a.popularity;
      })
      .slice(0, MAX_SHOWS);

    return jsonResponse(200, {
      shows,
      meta: {
        from,
        to,
        pagesFetched: totalPages,
        count: shows.length,
      },
    });
  } catch (error) {
    console.error("getPremieringSoonShows error", error);

    return jsonResponse(500, {
      message: error?.message || "Failed to load premiering soon shows",
    });
  }
}
