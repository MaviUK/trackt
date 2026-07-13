const TVDB_BASE = "https://api4.thetvdb.com/v4";
const PAGE_SIZE = 20;
const MAX_RESULTS = 5000;

let cachedToken = null;
let tokenExpiresAt = 0;

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
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function getToken() {
  if (cachedToken && Date.now() < tokenExpiresAt) return cachedToken;

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

  cachedToken = token;
  tokenExpiresAt = Date.now() + 27 * 24 * 60 * 60 * 1000;
  return token;
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

function normalizeResult(item, studioName) {
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

    const token = await getToken();
    const offset = Math.max(0, (page - 1) * PAGE_SIZE);
    const params = new URLSearchParams({
      query,
      company: query,
      type: "series",
      offset: String(offset),
      limit: String(PAGE_SIZE),
      language: "eng",
      meta: "translations",
    });

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

    const rawResults = Array.isArray(data?.data) ? data.data : [];
    const results = rawResults
      .filter((item) => {
        const type = normalizeText(item?.type);
        return !type || type === "series";
      })
      .map((item) => normalizeResult(item, query))
      .filter((item) => item.tvdb_id);

    const links = data?.links || {};
    const totalCandidates = [
      links?.total_items,
      links?.totalItems,
      links?.total,
      data?.total_items,
      data?.totalItems,
      data?.total,
    ];
    const totalResults =
      totalCandidates
        .map(Number)
        .find((value) => Number.isFinite(value) && value >= 0) || 0;

    const hasMore =
      Boolean(links?.next || links?.nextPage) ||
      (results.length === PAGE_SIZE &&
        offset + results.length < MAX_RESULTS &&
        (!totalResults || offset + results.length < totalResults));

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
      totalPages: totalResults
        ? Math.ceil(Math.min(totalResults, MAX_RESULTS) / PAGE_SIZE)
        : page + (hasMore ? 1 : 0),
      totalResults,
      hasMore,
      results,
      matchType: "tvdb-company",
    });
  } catch (error) {
    console.error("studioSearchShows error", error);
    return response(500, {
      message: error?.message || "Studio search failed.",
    });
  }
}
