const TVDB_BASE_URL = "https://api4.thetvdb.com/v4";

let cachedToken = null;
let cachedTokenExpiresAt = 0;

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
    body: JSON.stringify(body),
  };
}

async function readJsonSafe(response) {
  const text = await response.text();

  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

async function getTvdbToken() {
  const now = Date.now();

  if (cachedToken && now < cachedTokenExpiresAt) {
    return cachedToken;
  }

  const apikey = process.env.TVDB_API_KEY;
  const pin = process.env.TVDB_PIN;

  if (!apikey) {
    throw new Error("Missing TVDB_API_KEY environment variable");
  }

  const payload = { apikey };
  if (pin) payload.pin = pin;

  const loginRes = await fetch(`${TVDB_BASE_URL}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const loginJson = await readJsonSafe(loginRes);

  if (!loginRes.ok) {
    throw new Error(
      `TVDB login failed (${loginRes.status}): ${
        loginJson?.message || loginJson?.status || "Unknown error"
      }`
    );
  }

  const token = loginJson?.data?.token;

  if (!token) {
    throw new Error("TVDB login succeeded but no token was returned");
  }

  cachedToken = token;
  cachedTokenExpiresAt = now + 27 * 24 * 60 * 60 * 1000;
  return token;
}

async function tvdbGet(path) {
  const token = await getTvdbToken();

  const res = await fetch(`${TVDB_BASE_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });

  const json = await readJsonSafe(res);

  if (!res.ok) {
    throw new Error(
      `TVDB request failed (${res.status}) for ${path}: ${
        json?.message || json?.status || "Unknown error"
      }`
    );
  }

  return json;
}

function normalizeNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function normalizeGenres(value) {
  if (!Array.isArray(value)) return [];

  return value
    .map((genre) => {
      if (typeof genre === "string") return genre;
      if (genre && typeof genre === "object") return genre.name ?? genre.genre ?? null;
      return null;
    })
    .filter(Boolean);
}

function normalizeNetwork(value) {
  if (!value) return null;

  if (Array.isArray(value)) {
    const names = value
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object") return item.name ?? null;
        return null;
      })
      .filter(Boolean);

    return names.length ? names.join(", ") : null;
  }

  if (typeof value === "object") return value.name ?? null;
  return value;
}

function pickPoster(item) {
  if (item?.image_url) return item.image_url;
  if (item?.image) return item.image;
  if (item?.poster) return item.poster;

  if (Array.isArray(item?.artworks)) {
    const poster = item.artworks.find((art) => Number(art?.type) === 2 && art?.image);
    if (poster?.image) return poster.image;
  }

  return null;
}

function normalizeShow(item) {
  return {
    tvdb_id: Number(item?.tvdb_id || item?.id) || null,
    slug: item?.slug || null,
    name: item?.name || item?.seriesName || "Unknown title",
    overview: item?.overview || "",
    status:
      typeof item?.status === "object"
        ? item?.status?.name || null
        : item?.status || null,
    first_aired: item?.firstAired || item?.first_air_time || null,
    image_url: pickPoster(item),
    network: normalizeNetwork(
      item?.network || item?.latestNetwork || item?.originalNetwork || item?.companies
    ),
    genres: normalizeGenres(item?.genres || item?.genre || []),
    score: normalizeNumber(item?.score ?? item?.siteRating ?? item?.rating_average),
  };
}

function dedupeByTvdbId(items) {
  const map = new Map();

  for (const item of items) {
    if (!item?.tvdb_id) continue;
    if (!map.has(item.tvdb_id)) {
      map.set(item.tvdb_id, item);
      continue;
    }

    const existing = map.get(item.tvdb_id);
    const existingScore = (existing.image_url ? 2 : 0) + (existing.overview ? 1 : 0) + (existing.score ?? 0);
    const nextScore = (item.image_url ? 2 : 0) + (item.overview ? 1 : 0) + (item.score ?? 0);

    if (nextScore >= existingScore) {
      map.set(item.tvdb_id, item);
    }
  }

  return Array.from(map.values());
}

async function fetchCandidateLists(limit) {
  const candidates = [
    `/series/filter?sort=score&sortType=desc&page=0`,
    `/series/filter?sort=score&page=0`,
    `/series?page=0`,
  ];

  const collected = [];
  const debug = [];

  for (const path of candidates) {
    try {
      const json = await tvdbGet(path);
      const items = Array.isArray(json?.data) ? json.data : [];
      debug.push({ path, count: items.length, ok: true });
      if (items.length) {
        collected.push(...items);
      }
    } catch (error) {
      debug.push({ path, ok: false, error: error.message });
    }
  }

  const normalized = dedupeByTvdbId(collected.map(normalizeShow))
    .filter((item) => item.tvdb_id && item.name && item.image_url)
    .sort((a, b) => {
      const scoreDiff = (b.score ?? 0) - (a.score ?? 0);
      if (scoreDiff !== 0) return scoreDiff;
      const aDate = a.first_aired ? new Date(a.first_aired).getTime() : 0;
      const bDate = b.first_aired ? new Date(b.first_aired).getTime() : 0;
      return bDate - aDate;
    })
    .slice(0, Math.max(limit * 3, 30));

  return { items: normalized, debug };
}

export async function handler(event) {
  try {
    const limitRaw = event.queryStringParameters?.limit;
    const excludeRaw = event.queryStringParameters?.exclude || "";
    const limit = Math.min(Math.max(Number(limitRaw) || 18, 1), 30);
    const excludedIds = new Set(
      excludeRaw
        .split(",")
        .map((value) => Number(value.trim()))
        .filter((value) => Number.isFinite(value) && value > 0)
    );

    const { items, debug } = await fetchCandidateLists(limit);

    const filtered = items.filter((item) => !excludedIds.has(Number(item.tvdb_id))).slice(0, limit);

    return jsonResponse(200, {
      shows: filtered,
      debug,
    });
  } catch (error) {
    console.error("getTrendingShows failed:", error);
    return jsonResponse(500, {
      message: error.message || "Failed to load trending shows",
      shows: [],
    });
  }
}
