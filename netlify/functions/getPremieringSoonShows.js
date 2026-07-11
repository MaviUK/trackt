const MAX_DISCOVER_PAGES = 20;
const MAX_SHOWS = 36;

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=300, s-maxage=3600",
    },
    body: JSON.stringify(body),
  };
}

function formatDateOnly(date) {
  return date.toISOString().slice(0, 10);
}

function getTmdbHeaders() {
  const headers = { accept: "application/json" };

  if (process.env.TMDB_BEARER_TOKEN) {
    headers.Authorization = `Bearer ${process.env.TMDB_BEARER_TOKEN}`;
  }

  return headers;
}

function withApiKey(url) {
  if (!process.env.TMDB_API_KEY) return url;

  const parsed = new URL(url);
  parsed.searchParams.set("api_key", process.env.TMDB_API_KEY);
  return parsed.toString();
}

async function fetchTmdb(url) {
  const response = await fetch(withApiKey(url), {
    headers: getTmdbHeaders(),
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(
      payload?.status_message || `TMDB request failed with ${response.status}`
    );
  }

  return payload;
}

function buildDiscoverUrl({ from, to, page }) {
  const params = new URLSearchParams({
    language: "en-GB",
    sort_by: "first_air_date.asc",
    first_air_date_gte: from,
    first_air_date_lte: to,
    include_adult: "false",
    include_null_first_air_dates: "false",
    page: String(page),
  });

  return `https://api.themoviedb.org/3/discover/tv?${params.toString()}`;
}

async function fetchSeasonOneEpisodeOne(tmdbId) {
  const season = await fetchTmdb(
    `https://api.themoviedb.org/3/tv/${encodeURIComponent(
      tmdbId
    )}/season/1?language=en-GB`
  );

  return (season?.episodes || []).find(
    (episode) => Number(episode?.episode_number) === 1
  );
}

function normalizeShow(show, episode) {
  if (!show?.id || !show?.poster_path || !episode?.air_date) return null;

  return {
    id: show.id,
    tmdb_id: show.id,
    tvdb_id: null,
    name: show.name || show.original_name || "Unknown title",
    original_name: show.original_name || null,
    image: `https://image.tmdb.org/t/p/w500${show.poster_path}`,
    poster_url: `https://image.tmdb.org/t/p/w500${show.poster_path}`,
    overview: show.overview || "",
    first_air_date: episode.air_date,
    premiere_date: episode.air_date,
    premiere_season_number: 1,
    premiere_episode_number: 1,
    premiere_episode_name: episode.name || "Episode 1",
    popularity: Number(show.popularity || 0),
    vote_average: Number(show.vote_average || 0),
    vote_count: Number(show.vote_count || 0),
    original_language: show.original_language || null,
    origin_country: Array.isArray(show.origin_country)
      ? show.origin_country
      : [],
  };
}

async function mapInBatches(items, batchSize, mapper) {
  const results = [];

  for (let index = 0; index < items.length; index += batchSize) {
    const batch = items.slice(index, index + batchSize);
    const batchResults = await Promise.all(batch.map(mapper));
    results.push(...batchResults);
  }

  return results;
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

    const inSevenDays = new Date(today);
    inSevenDays.setDate(inSevenDays.getDate() + 7);

    const from = formatDateOnly(today);
    const to = formatDateOnly(inSevenDays);

    const firstPage = await fetchTmdb(
      buildDiscoverUrl({ from, to, page: 1 })
    );
    const totalPages = Math.max(
      1,
      Math.min(Number(firstPage?.total_pages || 1), MAX_DISCOVER_PAGES)
    );

    const remainingPages =
      totalPages > 1
        ? await Promise.all(
            Array.from({ length: totalPages - 1 }, (_, index) =>
              fetchTmdb(buildDiscoverUrl({ from, to, page: index + 2 }))
            )
          )
        : [];

    const candidatesById = new Map();

    [firstPage, ...remainingPages].forEach((pagePayload) => {
      (pagePayload?.results || []).forEach((show) => {
        if (!show?.id || !show?.poster_path) return;
        candidatesById.set(String(show.id), show);
      });
    });

    const verified = await mapInBatches(
      [...candidatesById.values()],
      8,
      async (show) => {
        try {
          const episode = await fetchSeasonOneEpisodeOne(show.id);

          if (!episode?.air_date) return null;
          if (episode.air_date < from || episode.air_date > to) return null;

          return normalizeShow(show, episode);
        } catch (error) {
          console.warn(`Failed verifying S01E01 for TMDB ${show.id}`, error);
          return null;
        }
      }
    );

    const shows = verified
      .filter(Boolean)
      .sort((a, b) => {
        if (a.premiere_date !== b.premiere_date) {
          return a.premiere_date.localeCompare(b.premiere_date);
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
        candidatesChecked: candidatesById.size,
        count: shows.length,
        criteria: "season 1 episode 1 airing within the next 7 days",
      },
    });
  } catch (error) {
    console.error("getPremieringSoonShows error", error);

    return jsonResponse(500, {
      message: error?.message || "Failed to load S01E01 premieres",
    });
  }
}
