import { handler as legacySearchShowsHandler } from "./searchShows.js";

const TMDB_BASE = "https://api.themoviedb.org/3";
const IMAGE_BASE = "https://image.tmdb.org/t/p";
const DEFAULT_REGION = "GB";
const MAX_TMDB_PAGE = 500;
const COMPANY_SUFFIX_WORDS = new Set([
  "channel",
  "company",
  "entertainment",
  "film",
  "films",
  "media",
  "network",
  "pictures",
  "production",
  "productions",
  "studio",
  "studios",
  "television",
  "tv",
]);

function response(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
    body: JSON.stringify(body),
  };
}

async function tmdbFetch(path, params = {}) {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) throw new Error("Missing TMDB API key");

  const searchParams = new URLSearchParams({
    api_key: apiKey,
    language: "en-GB",
    ...params,
  });

  const res = await fetch(`${TMDB_BASE}${path}?${searchParams.toString()}`);
  const data = await res.json();

  if (!res.ok) {
    throw new Error(data?.status_message || `TMDB request failed (${res.status})`);
  }

  return data;
}

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\+/g, " plus ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function rankNameMatch(name, query) {
  const normalizedName = normalizeText(name);
  const normalizedQuery = normalizeText(query);

  if (!normalizedName || !normalizedQuery) return 0;
  if (normalizedName === normalizedQuery) return 100;
  if (normalizedName.startsWith(normalizedQuery)) return 70;
  if (normalizedName.includes(normalizedQuery)) return 45;

  const queryWords = normalizedQuery.split(" ");
  const matchedWords = queryWords.filter((word) => normalizedName.includes(word));
  return matchedWords.length * 10;
}

function isSensibleCompanyMatch(name, query) {
  const normalizedName = normalizeText(name);
  const normalizedQuery = normalizeText(query);

  if (!normalizedName || !normalizedQuery) return false;
  if (normalizedName === normalizedQuery) return true;
  if (!normalizedName.startsWith(`${normalizedQuery} `)) return false;

  const remainder = normalizedName.slice(normalizedQuery.length).trim().split(" ");
  return remainder.length > 0 && remainder.every((word) => COMPANY_SUFFIX_WORDS.has(word));
}

function platformAliases(query) {
  const normalized = normalizeText(query);
  const aliases = {
    "amazon prime": ["amazon prime video", "prime video"],
    "amazon prime video": ["amazon prime video", "prime video"],
    prime: ["amazon prime video", "prime video"],
    "prime video": ["amazon prime video", "prime video"],
    disney: ["disney plus", "disney+"],
    "disney plus": ["disney plus", "disney+"],
    "disney+": ["disney plus", "disney+"],
    max: ["max", "hbo max"],
    hbo: ["max", "hbo max", "hbo"],
    "hbo max": ["max", "hbo max"],
    apple: ["apple tv plus", "apple tv+"],
    "apple tv": ["apple tv plus", "apple tv+"],
    "apple tv plus": ["apple tv plus", "apple tv+"],
    "apple tv+": ["apple tv plus", "apple tv+"],
    paramount: ["paramount plus", "paramount+"],
    "paramount plus": ["paramount plus", "paramount+"],
    "paramount+": ["paramount plus", "paramount+"],
    bbc: ["bbc iplayer"],
    iplayer: ["bbc iplayer"],
    itv: ["itvx"],
  };

  return aliases[normalized] || [query];
}

function bestMatch(items, query, getName = (item) => item?.name) {
  return [...(items || [])]
    .map((item) => ({ item, score: rankNameMatch(getName(item), query) }))
    .sort((a, b) => b.score - a.score)[0] || null;
}

async function getGenres() {
  const data = await tmdbFetch("/genre/tv/list");
  return Array.isArray(data?.genres) ? data.genres : [];
}

async function resolveGenre(query) {
  const genres = await getGenres();
  const match = bestMatch(genres, query);
  return match?.score > 0 ? { ...match.item, allGenres: genres } : null;
}

async function resolveProvider(query, region) {
  const data = await tmdbFetch("/watch/providers/tv", {
    watch_region: region,
  });
  const providers = Array.isArray(data?.results) ? data.results : [];
  const candidates = platformAliases(query);

  let best = null;
  for (const alias of candidates) {
    const match = bestMatch(providers, alias, (item) => item?.provider_name);
    if (!best || (match?.score || 0) > best.score) best = match;
  }

  return best?.score > 0 ? best.item : null;
}

async function resolveCompanies(query) {
  const data = await tmdbFetch("/search/company", { query, page: "1" });
  const results = Array.isArray(data?.results) ? data.results : [];

  const exactMatches = results.filter(
    (item) => normalizeText(item?.name) === normalizeText(query)
  );
  if (exactMatches.length) return exactMatches.slice(0, 4);

  return results
    .filter((item) => isSensibleCompanyMatch(item?.name, query))
    .sort(
      (a, b) =>
        rankNameMatch(b?.name, query) - rankNameMatch(a?.name, query) ||
        Number(b?.id || 0) - Number(a?.id || 0)
    )
    .slice(0, 4);
}

function normalizeResult(item, context, genreMap) {
  const genreNames = (item?.genre_ids || [])
    .map((id) => genreMap.get(Number(id)))
    .filter(Boolean);

  return {
    tvdb_id: null,
    tmdb_id: item?.id || null,
    name: item?.name || item?.original_name || "Unknown title",
    overview: item?.overview || "",
    first_aired: item?.first_air_date || null,
    first_air_time: item?.first_air_date || null,
    image_url: item?.poster_path ? `${IMAGE_BASE}/w500${item.poster_path}` : null,
    poster_url: item?.poster_path ? `${IMAGE_BASE}/w500${item.poster_path}` : null,
    backdrop_url: item?.backdrop_path
      ? `${IMAGE_BASE}/original${item.backdrop_path}`
      : null,
    genres: genreNames,
    network: context.platformName || null,
    platform: context.platformName || null,
    studio: context.studioName || null,
    studios: context.studioNames || [],
    rating_average: item?.vote_average || null,
    rating_count: item?.vote_count || 0,
    popularity: item?.popularity || 0,
    original_language: item?.original_language || null,
    source: "tmdb",
  };
}

async function legacyNetworkStudioResults(query) {
  try {
    const legacyResponse = await legacySearchShowsHandler({
      httpMethod: "GET",
      queryStringParameters: {
        network: query,
        sourceYear: "",
        sourceRating: "",
        sourceLanguage: "english",
      },
    });

    if (Number(legacyResponse?.statusCode || 500) !== 200) return [];

    const parsed = JSON.parse(legacyResponse?.body || "[]");
    if (!Array.isArray(parsed)) return [];

    return parsed.map((item) => ({
      ...item,
      network: null,
      platform: null,
      studio: item?.network || query,
      studios: [item?.network || query].filter(Boolean),
    }));
  } catch (error) {
    console.warn("Studio network fallback failed:", error);
    return [];
  }
}

function regionLabel(region) {
  return region === "GB" ? "the UK" : region;
}

export async function handler(event) {
  if (event.httpMethod && event.httpMethod !== "GET") {
    return response(405, { message: "Method not allowed" });
  }

  try {
    const mode = String(event.queryStringParameters?.mode || "")
      .trim()
      .toLowerCase();
    const query = String(event.queryStringParameters?.q || "").trim();
    const region = String(event.queryStringParameters?.region || DEFAULT_REGION)
      .trim()
      .toUpperCase();
    const requestedPage = Number(event.queryStringParameters?.page || 1);
    const page = Math.min(
      MAX_TMDB_PAGE,
      Math.max(1, Number.isFinite(requestedPage) ? Math.floor(requestedPage) : 1)
    );

    if (!query || !["genre", "platform", "studio"].includes(mode)) {
      return response(400, {
        message: "Choose Genre, Platform or Studio and enter a search term.",
      });
    }

    const genres = await getGenres();
    const genreMap = new Map(genres.map((genre) => [Number(genre.id), genre.name]));
    const discoverParams = {
      page: String(page),
      sort_by: "popularity.desc",
      include_adult: "false",
      include_null_first_air_dates: "false",
    };
    const context = {};

    if (mode === "genre") {
      const genre = await resolveGenre(query);
      if (!genre) {
        return response(404, { message: `No TV genre matched “${query}”.` });
      }
      discoverParams.with_genres = String(genre.id);
      context.genreName = genre.name;
    }

    if (mode === "platform") {
      const provider = await resolveProvider(query, region);
      if (!provider) {
        return response(404, {
          message: `No streaming platform matched “${query}” in ${regionLabel(region)}.`,
        });
      }
      discoverParams.with_watch_providers = String(provider.provider_id);
      discoverParams.watch_region = region;
      context.platformName = provider.provider_name;
    }

    if (mode === "studio") {
      const companies = await resolveCompanies(query);

      if (!companies.length) {
        const networkResults = await legacyNetworkStudioResults(query);
        if (!networkResults.length) {
          return response(404, {
            message: `No studio or TV network matched “${query}”.`,
          });
        }

        return response(200, {
          mode,
          query,
          matched: query,
          page: 1,
          totalPages: 1,
          totalResults: networkResults.length,
          hasMore: false,
          results: networkResults,
          matchType: "network",
        });
      }

      discoverParams.with_companies = companies.map((company) => company.id).join("|");
      context.studioNames = companies.map((company) => company.name);
      context.studioName = companies[0].name;
    }

    const discovered = await tmdbFetch("/discover/tv", discoverParams);
    const rawTotalPages = Number(discovered?.total_pages || 1);
    const totalPages = Math.min(MAX_TMDB_PAGE, Math.max(1, rawTotalPages));
    const results = (Array.isArray(discovered?.results) ? discovered.results : [])
      .map((item) => normalizeResult(item, context, genreMap))
      .filter((item) => item.tmdb_id);

    if (mode === "studio" && results.length === 0 && page === 1) {
      const networkResults = await legacyNetworkStudioResults(query);
      if (networkResults.length) {
        return response(200, {
          mode,
          query,
          matched: query,
          page: 1,
          totalPages: 1,
          totalResults: networkResults.length,
          hasMore: false,
          results: networkResults,
          matchType: "network",
        });
      }
    }

    return response(200, {
      mode,
      query,
      matched:
        context.genreName || context.platformName || context.studioName || query,
      page,
      totalPages,
      totalResults: Number(discovered?.total_results || results.length),
      hasMore: page < totalPages,
      results,
      matchType: mode === "studio" ? "company" : mode,
    });
  } catch (error) {
    console.error("advancedSearchShows error", error);
    return response(500, {
      message: error?.message || "Advanced show search failed.",
    });
  }
}
