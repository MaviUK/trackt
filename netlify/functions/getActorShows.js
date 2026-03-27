function normalizeNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function normalizeLanguage(value) {
  if (!value) return "";

  const str = String(value).trim().toLowerCase();

  const map = {
    eng: "english",
    en: "english",
    english: "english",
    jpn: "japanese",
    ja: "japanese",
    japanese: "japanese",
    kor: "korean",
    ko: "korean",
    korean: "korean",
    spa: "spanish",
    es: "spanish",
    spanish: "spanish",
    fra: "french",
    fr: "french",
    french: "french",
    deu: "german",
    de: "german",
    german: "german",
    swe: "swedish",
    sv: "swedish",
    swedish: "swedish",
  };

  return map[str] || str;
}

function normalizeTmdbShow(item) {
  return {
    tvdb_id: null,
    tmdb_id: Number(item?.id) || null,
    name: item?.name || item?.original_name || "Unknown title",
    overview: item?.overview || "",
    status: null,
    first_aired: item?.first_air_date || null,
    first_air_time: item?.first_air_date || null,
    image_url: item?.poster_path
      ? `https://image.tmdb.org/t/p/w500${item.poster_path}`
      : null,
    poster_url: item?.poster_path
      ? `https://image.tmdb.org/t/p/w500${item.poster_path}`
      : null,
    slug: null,
    network: null,
    genres: [],
    relationship_types: [],
    settings: [],
    original_language: normalizeLanguage(item?.original_language || ""),
    rating_average: normalizeNumber(item?.vote_average),
    rating_count: normalizeNumber(item?.vote_count),
    source: "tmdb",
  };
}

function dedupeMixedResults(items) {
  const map = new Map();

  for (const item of items) {
    const key = item?.tmdb_id
      ? `tmdb:${item.tmdb_id}`
      : `name:${String(item?.name || "").toLowerCase()}`;

    if (!map.has(key)) {
      map.set(key, item);
      continue;
    }

    const existing = map.get(key);

    const existingScore =
      (existing.image_url ? 1 : 0) +
      (existing.overview ? 1 : 0) +
      (existing.rating_average != null ? 1 : 0);

    const nextScore =
      (item.image_url ? 1 : 0) +
      (item.overview ? 1 : 0) +
      (item.rating_average != null ? 1 : 0);

    if (nextScore >= existingScore) {
      map.set(key, item);
    }
  }

  return Array.from(map.values());
}

async function tmdbFetch(path, params = {}) {
  const apiKey = process.env.TMDB_API_KEY;

  if (!apiKey) {
    throw new Error("Missing TMDB_API_KEY environment variable");
  }

  const url = new URL(`https://api.themoviedb.org/3${path}`);
  url.searchParams.set("api_key", apiKey);

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, value);
    }
  }

  const res = await fetch(url.toString());
  const data = await res.json();

  if (!res.ok) {
    throw new Error(data?.status_message || "TMDB request failed");
  }

  return data;
}

export async function handler(event) {
  try {
    const name = event.queryStringParameters?.name?.trim() || "";

    if (!name) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          message: "Missing actor name",
        }),
      };
    }

    const personSearch = await tmdbFetch("/search/person", {
      query: name,
      page: 1,
      include_adult: "false",
    });

    const people = Array.isArray(personSearch?.results)
      ? personSearch.results
      : [];

    if (!people.length) {
      return {
        statusCode: 200,
        body: JSON.stringify([]),
      };
    }

    const exactLower = name.toLowerCase();

    const chosen =
      people.find(
        (person) =>
          String(person?.name || "").trim().toLowerCase() === exactLower
      ) || people[0];

    if (!chosen?.id) {
      return {
        statusCode: 200,
        body: JSON.stringify([]),
      };
    }

    const credits = await tmdbFetch(`/person/${chosen.id}/tv_credits`);
    const cast = Array.isArray(credits?.cast) ? credits.cast : [];

    const normalized = cast
      .map((item) => normalizeTmdbShow(item))
      .filter((item) => item.tmdb_id);

    const results = dedupeMixedResults(normalized)
      .sort((a, b) => {
        const bRating = normalizeNumber(b.rating_average) ?? -1;
        const aRating = normalizeNumber(a.rating_average) ?? -1;
        if (bRating !== aRating) return bRating - aRating;

        const bDate = b.first_aired ? new Date(b.first_aired).getTime() : 0;
        const aDate = a.first_aired ? new Date(a.first_aired).getTime() : 0;
        return bDate - aDate;
      })
      .slice(0, 80);

    return {
      statusCode: 200,
      body: JSON.stringify(results),
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: "Function crashed",
        details: error.message,
      }),
    };
  }
}
