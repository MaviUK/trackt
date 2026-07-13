import { handler as legacyStudioSearch } from "./studioSearchShows.js";

const TMDB_BASE = "https://api.themoviedb.org/3";
const IMAGE_BASE = "https://image.tmdb.org/t/p";
const MAX_TMDB_PAGE = 500;

// TMDB does not provide a public network-name search endpoint. These aliases
// cover the network brands users most commonly select from BURGRS show pages.
const NETWORK_ALIASES = new Map([
  ["peacock", { id: 3353, name: "Peacock" }],
  ["peacock tv", { id: 3353, name: "Peacock" }],
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

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\+/g, " plus ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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

function rankName(name, query) {
  const candidate = normalizeText(name);
  const wanted = normalizeText(query);

  if (!candidate || !wanted) return 0;
  if (candidate === wanted) return 100;
  if (candidate.startsWith(`${wanted} `)) return 80;
  if (candidate.startsWith(wanted)) return 70;
  if (candidate.includes(wanted)) return 45;
  return 0;
}

async function resolveCompany(query) {
  const data = await tmdbFetch("/search/company", {
    query,
    page: "1",
  });

  const ranked = (Array.isArray(data?.results) ? data.results : [])
    .map((company) => ({
      company,
      score: rankName(company?.name, query),
    }))
    .filter((entry) => entry.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        Number(b.company?.id || 0) - Number(a.company?.id || 0)
    );

  return ranked[0]?.company || null;
}

async function getGenreMap() {
  const data = await tmdbFetch("/genre/tv/list");
  return new Map(
    (Array.isArray(data?.genres) ? data.genres : []).map((genre) => [
      Number(genre.id),
      genre.name,
    ])
  );
}

function normalizeResult(item, studioName, genreMap) {
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
    genres: (item?.genre_ids || [])
      .map((id) => genreMap.get(Number(id)))
      .filter(Boolean),
    network: null,
    platform: null,
    studio: studioName,
    studios: [studioName],
    rating_average: item?.vote_average || null,
    rating_count: item?.vote_count || 0,
    popularity: item?.popularity || 0,
    original_language: item?.original_language || null,
    source: "tmdb",
  };
}

async function searchTmdbCatalogue(query, page) {
  const normalizedQuery = normalizeText(query);
  const network = NETWORK_ALIASES.get(normalizedQuery) || null;
  const company = network ? null : await resolveCompany(query);

  if (!network && !company) return null;

  const params = {
    page: String(Math.min(MAX_TMDB_PAGE, page)),
    sort_by: "popularity.desc",
    include_adult: "false",
    include_null_first_air_dates: "false",
  };

  if (network) params.with_networks = String(network.id);
  else params.with_companies = String(company.id);

  const [discovered, genreMap] = await Promise.all([
    tmdbFetch("/discover/tv", params),
    getGenreMap(),
  ]);

  const studioName = network?.name || company?.name || query;
  const results = (Array.isArray(discovered?.results) ? discovered.results : [])
    .map((item) => normalizeResult(item, studioName, genreMap))
    .filter((item) => item.tmdb_id);
  const totalPages = Math.min(
    MAX_TMDB_PAGE,
    Math.max(1, Number(discovered?.total_pages || 1))
  );

  return {
    matched: studioName,
    results,
    totalResults: Number(discovered?.total_results || results.length),
    totalPages,
    hasMore: page < totalPages,
    matchType: network ? "tmdb-network" : "tmdb-company",
  };
}

export async function handler(event) {
  if (event.httpMethod && event.httpMethod !== "GET") {
    return response(405, { message: "Method not allowed" });
  }

  try {
    const query = String(
      event.queryStringParameters?.q ||
        event.queryStringParameters?.query ||
        ""
    ).trim();
    const requestedPage = Number(event.queryStringParameters?.page || 1);
    const page = Math.max(
      1,
      Number.isFinite(requestedPage) ? Math.floor(requestedPage) : 1
    );

    if (!query) {
      return response(400, { message: "Enter a studio or network name." });
    }

    const catalogue = await searchTmdbCatalogue(query, page);

    if (catalogue?.results?.length) {
      return response(200, {
        mode: "studio",
        query,
        matched: catalogue.matched,
        page,
        totalPages: catalogue.totalPages,
        totalResults: catalogue.totalResults,
        hasMore: catalogue.hasMore,
        results: catalogue.results,
        matchType: catalogue.matchType,
      });
    }

    // Keep the previous TVDB implementation as a safe fallback for names TMDB
    // cannot resolve, but do not use it for known networks such as Peacock.
    return legacyStudioSearch(event);
  } catch (error) {
    console.error("studioCatalogueSearch error", error);

    try {
      return await legacyStudioSearch(event);
    } catch {
      return response(500, {
        message: error?.message || "Studio search failed.",
      });
    }
  }
}
