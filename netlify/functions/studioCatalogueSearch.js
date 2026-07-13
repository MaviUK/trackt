const TVDB_BASE = "https://api4.thetvdb.com/v4";
const TMDB_BASE = "https://api.themoviedb.org/3";
const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p";
const PAGE_SIZE = 20;
const MAX_RESULTS = 5000;
const MAX_TMDB_PAGE = 500;
const CACHE_TTL_MS = 10 * 60 * 1000;
const SEARCH_BUCKETS = [
  "a",
  "e",
  "i",
  "o",
  "u",
  "s",
  "t",
  "r",
  "n",
  "l",
  "m",
  "c",
  "p",
  "d",
  "b",
  "g",
  "h",
  "f",
  "w",
  "y",
];

let cachedTvdbToken = null;
let tvdbTokenExpiresAt = 0;
const fallbackCache = new Map();

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

function rankMatch(name, query) {
  const a = normalizeText(name);
  const b = normalizeText(query);
  if (!a || !b) return 0;
  if (a === b) return 100;
  if (a.startsWith(`${b} `) || b.startsWith(`${a} `)) return 80;
  if (a.includes(b) || b.includes(a)) return 60;
  return 0;
}

async function getTvdbToken() {
  if (cachedTvdbToken && Date.now() < tvdbTokenExpiresAt) {
    return cachedTvdbToken;
  }

  const apiKey = process.env.TVDB_API_KEY;
  if (!apiKey) throw new Error("Missing TVDB API key");

  const payload = { apikey: apiKey };
  if (process.env.TVDB_PIN) payload.pin = process.env.TVDB_PIN;

  const res = await fetch(`${TVDB_BASE}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  const token = data?.data?.token;

  if (!res.ok || !token) {
    throw new Error(data?.message || "TVDB login failed");
  }

  cachedTvdbToken = token;
  tvdbTokenExpiresAt = Date.now() + 27 * 24 * 60 * 60 * 1000;
  return token;
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

function extractRemoteId(item, wantedSource) {
  const wanted = normalizeText(wantedSource);
  const pools = [
    item?.remoteIds,
    item?.remote_ids,
    item?.externalIds,
    item?.external_ids,
    item?.ids,
  ].filter(Array.isArray);

  for (const pool of pools) {
    for (const entry of pool) {
      const source = normalizeText(
        entry?.sourceName ||
          entry?.source_name ||
          entry?.sourceType ||
          entry?.source_type ||
          entry?.type ||
          entry?.name
      );
      if (source && !source.includes(wanted)) continue;

      const value = Number(
        entry?.id ||
          entry?.remoteId ||
          entry?.remote_id ||
          entry?.value ||
          entry?.externalId ||
          entry?.external_id
      );
      if (Number.isFinite(value) && value > 0) return value;
    }
  }

  return null;
}

async function resolveTmdbIdFromTvdbId(tvdbId, token) {
  const numericId = Number(tvdbId);
  if (!Number.isFinite(numericId) || numericId <= 0) return null;

  try {
    const res = await fetch(
      `${TVDB_BASE}/series/${numericId}/extended?language=eng&meta=translations`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          "Accept-Language": "eng",
        },
      }
    );
    const data = await res.json();
    if (!res.ok || !data?.data) return null;

    const series = data.data;
    const direct = Number(
      series?.tmdb_id || series?.tmdbId || series?.themoviedb_id
    );
    if (Number.isFinite(direct) && direct > 0) return direct;

    return extractRemoteId(series, "tmdb");
  } catch (error) {
    console.warn("Unable to resolve TMDB ID from TVDB:", error);
    return null;
  }
}

async function resolveSourceTmdbId(sourceShowId, sourceType, tvdbToken) {
  const numericId = Number(sourceShowId);
  if (!Number.isFinite(numericId) || numericId <= 0) return null;

  if (sourceType === "tmdb") return numericId;
  if (sourceType === "tvdb") {
    return resolveTmdbIdFromTvdbId(numericId, tvdbToken);
  }

  try {
    await tmdbFetch(`/tv/${numericId}`);
    return numericId;
  } catch {
    return resolveTmdbIdFromTvdbId(numericId, tvdbToken);
  }
}

function chooseSourceEntity(details, query) {
  const networks = Array.isArray(details?.networks) ? details.networks : [];
  const companies = Array.isArray(details?.production_companies)
    ? details.production_companies
    : [];

  const rankedNetworks = networks
    .map((item) => ({ item, score: rankMatch(item?.name, query) }))
    .sort((a, b) => b.score - a.score);
  const rankedCompanies = companies
    .map((item) => ({ item, score: rankMatch(item?.name, query) }))
    .sort((a, b) => b.score - a.score);

  if (rankedNetworks[0]?.score >= 60 && rankedNetworks[0]?.item?.id) {
    return {
      type: "network",
      id: rankedNetworks[0].item.id,
      name: rankedNetworks[0].item.name,
    };
  }

  if (rankedCompanies[0]?.score >= 60 && rankedCompanies[0]?.item?.id) {
    return {
      type: "company",
      id: rankedCompanies[0].item.id,
      name: rankedCompanies[0].item.name,
    };
  }

  return null;
}

async function getTmdbGenreMap() {
  const data = await tmdbFetch("/genre/tv/list");
  return new Map(
    (Array.isArray(data?.genres) ? data.genres : []).map((genre) => [
      Number(genre.id),
      genre.name,
    ])
  );
}

function normalizeTmdbResult(item, studioName, genreMap) {
  const genres = (item?.genre_ids || [])
    .map((id) => genreMap.get(Number(id)))
    .filter(Boolean);

  return {
    tvdb_id: null,
    tmdb_id: item?.id || null,
    name: item?.name || item?.original_name || "Unknown title",
    overview: item?.overview || "",
    first_aired: item?.first_air_date || null,
    first_air_time: item?.first_air_date || null,
    image_url: item?.poster_path
      ? `${TMDB_IMAGE_BASE}/w500${item.poster_path}`
      : null,
    poster_url: item?.poster_path
      ? `${TMDB_IMAGE_BASE}/w500${item.poster_path}`
      : null,
    backdrop_url: item?.backdrop_path
      ? `${TMDB_IMAGE_BASE}/original${item.backdrop_path}`
      : null,
    genres,
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

async function searchExactSourceCatalogue({
  query,
  page,
  sourceShowId,
  sourceType,
  tvdbToken,
}) {
  if (!sourceShowId) return null;

  const tmdbId = await resolveSourceTmdbId(
    sourceShowId,
    sourceType,
    tvdbToken
  );
  if (!tmdbId) return null;

  try {
    const details = await tmdbFetch(`/tv/${tmdbId}`);
    const entity = chooseSourceEntity(details, query);
    if (!entity) return null;

    const params = {
      page: String(Math.min(MAX_TMDB_PAGE, page)),
      sort_by: "popularity.desc",
      include_adult: "false",
      include_null_first_air_dates: "false",
    };

    if (entity.type === "network") {
      params.with_networks = String(entity.id);
    } else {
      params.with_companies = String(entity.id);
    }

    const [discovered, genreMap] = await Promise.all([
      tmdbFetch("/discover/tv", params),
      getTmdbGenreMap(),
    ]);

    const totalPages = Math.min(
      MAX_TMDB_PAGE,
      Math.max(1, Number(discovered?.total_pages || 1))
    );
    const results = (Array.isArray(discovered?.results)
      ? discovered.results
      : []
    )
      .map((item) => normalizeTmdbResult(item, entity.name, genreMap))
      .filter((item) => item.tmdb_id);

    return {
      results,
      matched: entity.name,
      totalResults: Number(discovered?.total_results || results.length),
      totalPages,
      hasMore: page < totalPages,
      matchType: `tmdb-${entity.type}`,
    };
  } catch (error) {
    console.warn("Exact studio catalogue search failed:", error);
    return null;
  }
}

function normalizeGenres(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((genre) => {
      if (typeof genre === "string") return genre;
      return genre?.name || genre?.genre || genre?.value || null;
    })
    .filter(Boolean);
}

function normalizeTvdbResult(item, studioName) {
  const tvdbId = Number(item?.tvdb_id || item?.id);
  const image = item?.image_url || item?.image || item?.thumbnail || null;
  const firstAired =
    item?.first_air_time || item?.firstAired || item?.first_air_date || null;

  return {
    tvdb_id: Number.isFinite(tvdbId) && tvdbId > 0 ? tvdbId : null,
    tmdb_id: extractRemoteId(item, "tmdb"),
    name: item?.name || item?.seriesName || item?.title || "Unknown title",
    overview: item?.overview || item?.description || "",
    first_aired: firstAired,
    first_air_time: firstAired,
    image_url: image,
    poster_url: image,
    backdrop_url: item?.background || item?.background_url || null,
    genres: normalizeGenres(item?.genres || item?.genre),
    network: null,
    platform: null,
    studio: studioName,
    studios: [studioName],
    rating_average:
      Number(item?.score || item?.rating || item?.siteRating) || null,
    rating_count: Number(item?.rating_count || item?.siteRatingCount) || 0,
    popularity: Number(item?.score || 0),
    original_language: item?.primary_language || item?.language || null,
    source: "tvdb",
  };
}

async function requestTvdbBucket(token, query, studioName, filterName) {
  const params = new URLSearchParams({
    query,
    type: "series",
    offset: "0",
    limit: "1000",
    language: "eng",
    meta: "translations",
  });
  params.set(filterName, studioName);

  const res = await fetch(`${TVDB_BASE}/search?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Accept-Language": "eng",
    },
  });
  const data = await res.json();

  if (!res.ok) {
    throw new Error(data?.message || "TVDB studio search failed");
  }

  return (Array.isArray(data?.data) ? data.data : [])
    .filter((item) => {
      const type = normalizeText(item?.type);
      return !type || type === "series";
    })
    .map((item) => normalizeTvdbResult(item, studioName))
    .filter((item) => item.tvdb_id);
}

async function mapWithConcurrency(items, concurrency, worker) {
  const output = new Array(items.length);
  let index = 0;

  async function run() {
    while (index < items.length) {
      const current = index;
      index += 1;
      output[current] = await worker(items[current]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, run)
  );
  return output;
}

function mergeUnique(results) {
  const unique = new Map();
  results.flat().forEach((item) => {
    if (!item?.tvdb_id) return;
    const key = String(item.tvdb_id);
    const existing = unique.get(key);
    if (!existing || Number(item.popularity || 0) > Number(existing.popularity || 0)) {
      unique.set(key, item);
    }
  });

  return Array.from(unique.values()).sort(
    (a, b) =>
      Number(b.popularity || 0) - Number(a.popularity || 0) ||
      String(a.name || "").localeCompare(String(b.name || ""))
  );
}

async function buildTvdbFallbackCatalogue(token, studioName) {
  const cacheKey = `v2:${normalizeText(studioName)}`;
  const cached = fallbackCache.get(cacheKey);
  if (cached && Date.now() - cached.createdAt < CACHE_TTL_MS) {
    return cached.results;
  }

  const networkBuckets = await mapWithConcurrency(
    SEARCH_BUCKETS,
    5,
    async (bucket) => {
      try {
        return await requestTvdbBucket(token, bucket, studioName, "network");
      } catch (error) {
        console.warn(`TVDB network bucket ${bucket} failed:`, error.message);
        return [];
      }
    }
  );

  let results = mergeUnique(networkBuckets);

  if (results.length < 80) {
    const companyBuckets = await mapWithConcurrency(
      SEARCH_BUCKETS,
      5,
      async (bucket) => {
        try {
          return await requestTvdbBucket(token, bucket, studioName, "company");
        } catch (error) {
          console.warn(`TVDB company bucket ${bucket} failed:`, error.message);
          return [];
        }
      }
    );
    results = mergeUnique([results, ...companyBuckets]);
  }

  results = results.slice(0, MAX_RESULTS);
  fallbackCache.set(cacheKey, { createdAt: Date.now(), results });
  return results;
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
    const sourceShowId = String(
      event.queryStringParameters?.sourceShowId || ""
    ).trim();
    const sourceType = String(
      event.queryStringParameters?.sourceType || ""
    )
      .trim()
      .toLowerCase();
    const requestedPage = Number(event.queryStringParameters?.page || 1);
    const page = Math.max(
      1,
      Number.isFinite(requestedPage) ? Math.floor(requestedPage) : 1
    );

    if (!query) {
      return response(400, { message: "Enter a studio or network name." });
    }

    const tvdbToken = await getTvdbToken();
    const exact = await searchExactSourceCatalogue({
      query,
      page,
      sourceShowId,
      sourceType,
      tvdbToken,
    });

    if (exact?.results?.length) {
      return response(200, {
        mode: "studio",
        query,
        matched: exact.matched,
        page,
        totalPages: exact.totalPages,
        totalResults: exact.totalResults,
        hasMore: exact.hasMore,
        results: exact.results,
        matchType: exact.matchType,
      });
    }

    const catalogue = await buildTvdbFallbackCatalogue(tvdbToken, query);
    const offset = Math.max(0, (page - 1) * PAGE_SIZE);
    const results = catalogue.slice(offset, offset + PAGE_SIZE);

    if (!results.length && page === 1) {
      return response(404, {
        message: `No studio, network or production company matched “${query}”.`,
      });
    }

    return response(200, {
      mode: "studio",
      query,
      matched: query,
      page,
      totalPages: Math.max(1, Math.ceil(catalogue.length / PAGE_SIZE)),
      totalResults: catalogue.length,
      hasMore: offset + results.length < catalogue.length,
      results,
      matchType: "tvdb-network-company-catalogue",
    });
  } catch (error) {
    console.error("studioCatalogueSearch error", error);
    return response(500, {
      message: error?.message || "Studio search failed.",
    });
  }
}
