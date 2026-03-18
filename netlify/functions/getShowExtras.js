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

  if (pin) {
    payload.pin = pin;
  }

  const loginRes = await fetch(`${TVDB_BASE_URL}/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
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

  // TVDB docs say the bearer token is valid for 1 month.
  // Cache slightly under that to be safe.
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

function pickImage(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function normalizeCastFromSeries(seriesData) {
  const rawCharacters = Array.isArray(seriesData?.characters)
    ? seriesData.characters
    : [];

  return rawCharacters
    .map((item, index) => {
      const personName =
        item?.personName ||
        item?.person_name ||
        item?.people?.name ||
        item?.person?.name ||
        item?.name ||
        null;

      const characterName =
        item?.name ||
        item?.characterName ||
        item?.character_name ||
        item?.role ||
        null;

      const image = pickImage(
        item?.image,
        item?.image_url,
        item?.personImgURL,
        item?.personImgUrl,
        item?.people?.image,
        item?.person?.image
      );

      return {
        id: item?.id || item?.peopleId || item?.personId || `cast-${index}`,
        personName,
        characterName,
        image,
        sort: typeof item?.sort === "number" ? item.sort : index,
      };
    })
    .filter((item) => item.personName)
    .sort((a, b) => a.sort - b.sort)
    .slice(0, 18)
    .map(({ id, personName, characterName, image }) => ({
      id,
      personName,
      characterName,
      image,
    }));
}

function normalizeRecommendations(seriesData) {
  const candidates = [
    ...(Array.isArray(seriesData?.recommendations)
      ? seriesData.recommendations
      : []),
    ...(Array.isArray(seriesData?.similar) ? seriesData.similar : []),
    ...(Array.isArray(seriesData?.relatedSeries) ? seriesData.relatedSeries : []),
    ...(Array.isArray(seriesData?.related_series)
      ? seriesData.related_series
      : []),
  ];

  const seen = new Set();

  return candidates
    .map((item, index) => {
      const tvdbId =
        item?.tvdb_id ||
        item?.tvdbId ||
        item?.id ||
        item?.seriesId ||
        item?.series_id ||
        null;

      const name = item?.name || item?.seriesName || item?.series_name || null;

      const posterUrl = pickImage(
        item?.poster_url,
        item?.poster,
        item?.image,
        item?.image_url
      );

      const firstAired = item?.firstAired || item?.first_aired || null;

      return {
        id: item?.id || `rec-${index}`,
        tvdb_id: tvdbId,
        name,
        poster_url: posterUrl,
        first_aired: firstAired,
      };
    })
    .filter((item) => item.tvdb_id && item.name)
    .filter((item) => {
      const key = String(item.tvdb_id);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 12);
}

export async function handler(event) {
  try {
    const tvdbIdRaw = event.queryStringParameters?.tvdbId;
    const tvdbId = Number(tvdbIdRaw);

    if (!tvdbIdRaw || Number.isNaN(tvdbId) || tvdbId <= 0) {
      return jsonResponse(400, { error: "Missing or invalid tvdbId" });
    }

    const seriesJson = await tvdbGet(`/series/${tvdbId}/extended`);
    const seriesData = seriesJson?.data || {};

    const cast = normalizeCastFromSeries(seriesData);
    const recommendations = normalizeRecommendations(seriesData);

    // TVDB v4 docs do not expose a clear streaming/watch-provider endpoint.
    const providers = [];

    return jsonResponse(200, {
      cast,
      providers,
      recommendations,
    });
  } catch (error) {
    console.error("getShowExtras failed:", error);

    return jsonResponse(500, {
      error: error.message || "Failed to load show extras",
      cast: [],
      providers: [],
      recommendations: [],
    });
  }
}
