const TVDB_BASE = "https://api4.thetvdb.com/v4";
const PAGE_SIZE = 20;
const MAX_RESULTS = 5000;
const CACHE_TTL_MS = 15 * 60 * 1000;
const COMMON_COUNTRIES = [
  "usa",
  "gbr",
  "can",
  "aus",
  "irl",
  "nzl",
  "fra",
  "deu",
  "esp",
  "ita",
  "jpn",
  "kor",
];

let cachedToken = null;
let tokenExpiresAt = 0;
const catalogueCache = new Map();
const companyResolutionCache = new Map();

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

function normalizeCountry(value) {
  const normalized = normalizeText(value).replace(/ /g, "");
  const aliases = {
    us: "usa",
    usa: "usa",
    unitedstates: "usa",
    uk: "gbr",
    gb: "gbr",
    gbr: "gbr",
    unitedkingdom: "gbr",
    england: "gbr",
    canada: "can",
    can: "can",
    australia: "aus",
    aus: "aus",
    ireland: "irl",
    irl: "irl",
    newzealand: "nzl",
    nzl: "nzl",
    france: "fra",
    fra: "fra",
    germany: "deu",
    deu: "deu",
    spain: "esp",
    esp: "esp",
    italy: "ita",
    ita: "ita",
    japan: "jpn",
    jpn: "jpn",
    southkorea: "kor",
    korea: "kor",
    kor: "kor",
  };

  return aliases[normalized] || (normalized.length === 3 ? normalized : "");
}

function rankName(name, query) {
  const candidate = normalizeText(name);
  const wanted = normalizeText(query);

  if (!candidate || !wanted) return 0;
  if (candidate === wanted) return 100;
  if (candidate.startsWith(`${wanted} `)) return 80;
  if (candidate.startsWith(wanted)) return 70;
  if (candidate.includes(wanted)) return 50;
  return 0;
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

async function tvdbGet(token, path, params = {}) {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      searchParams.set(key, String(value));
    }
  });

  const queryString = searchParams.toString();
  const res = await fetch(
    `${TVDB_BASE}${path}${queryString ? `?${queryString}` : ""}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "Accept-Language": "eng",
      },
    }
  );
  const data = await res.json();

  if (!res.ok) {
    const error = new Error(data?.message || `TVDB request failed (${res.status})`);
    error.statusCode = res.status;
    throw error;
  }

  return data;
}

function companyIdFromSearchResult(item) {
  const value = Number(
    item?.tvdb_id ||
      item?.tvdbId ||
      item?.id ||
      item?.company_id ||
      item?.companyId
  );
  return Number.isFinite(value) && value > 0 ? value : null;
}

function companyNameFromSearchResult(item) {
  return item?.name || item?.title || item?.company || "";
}

async function getCompanyDetails(token, candidate, query) {
  try {
    const details = await tvdbGet(token, `/companies/${candidate.id}`);
    const company = details?.data || {};
    return {
      id: candidate.id,
      name: company?.name || candidate.name || query,
      country: company?.country || candidate.item?.country || "",
      nameScore: candidate.score,
    };
  } catch (error) {
    console.warn("TVDB company details failed:", error.message);
    return {
      id: candidate.id,
      name: candidate.name || query,
      country: candidate.item?.country || "",
      nameScore: candidate.score,
    };
  }
}

async function sampleCompanySize(token, company) {
  const primaryCountry = normalizeCountry(company.country);
  const countries = Array.from(
    new Set([primaryCountry, "usa", "gbr", "can"].filter(Boolean))
  );

  let total = 0;
  for (const country of countries) {
    try {
      const data = await tvdbGet(token, "/series/filter", {
        company: company.id,
        country,
        lang: "eng",
        sort: "score",
        sortType: "desc",
      });
      total += Array.isArray(data?.data) ? data.data.length : 0;
    } catch (error) {
      console.warn(
        `TVDB company sample failed for ${company.name} in ${country}:`,
        error.message
      );
    }
  }

  return total;
}

async function resolveCompany(token, query) {
  const cacheKey = normalizeText(query);
  const cached = companyResolutionCache.get(cacheKey);
  if (cached && Date.now() - cached.createdAt < CACHE_TTL_MS) {
    return cached.company;
  }

  const searchData = await tvdbGet(token, "/search", {
    query,
    type: "company",
    offset: 0,
    limit: 100,
  });

  const candidates = (Array.isArray(searchData?.data) ? searchData.data : [])
    .map((item) => ({
      item,
      id: companyIdFromSearchResult(item),
      name: companyNameFromSearchResult(item),
      score: rankName(companyNameFromSearchResult(item), query),
    }))
    .filter((entry) => entry.id && entry.score >= 50)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, 10);

  if (!candidates.length) return null;

  const detailed = await Promise.all(
    candidates.map((candidate) => getCompanyDetails(token, candidate, query))
  );

  const measured = [];
  for (const company of detailed) {
    const catalogueSize = await sampleCompanySize(token, company);
    measured.push({ company, catalogueSize });
  }

  measured.sort(
    (a, b) =>
      b.catalogueSize - a.catalogueSize ||
      b.company.nameScore - a.company.nameScore ||
      a.company.name.localeCompare(b.company.name)
  );

  const selected = measured[0]?.company || detailed[0] || null;
  if (selected) {
    companyResolutionCache.set(cacheKey, {
      createdAt: Date.now(),
      company: selected,
    });
  }

  return selected;
}

function normalizeSeries(series, companyName) {
  const id = Number(series?.id || series?.tvdb_id || series?.tvdbId);
  if (!Number.isFinite(id) || id <= 0) return null;

  const image = series?.image || series?.image_url || series?.thumbnail || null;
  const firstAired =
    series?.firstAired || series?.first_aired || series?.first_air_time || null;

  return {
    tvdb_id: id,
    tmdb_id: null,
    name: series?.name || series?.seriesName || series?.title || "Unknown title",
    overview: series?.overview || "",
    first_aired: firstAired,
    first_air_time: firstAired,
    image_url: image,
    poster_url: image,
    backdrop_url: null,
    genres: [],
    network: null,
    platform: null,
    studio: companyName,
    studios: [companyName],
    rating_average: Number(series?.score || 0) || null,
    rating_count: 0,
    popularity: Number(series?.score || 0),
    original_language:
      series?.originalLanguage || series?.original_language || null,
    source: "tvdb",
  };
}

async function fetchCountryCatalogue(token, company, country) {
  try {
    const data = await tvdbGet(token, "/series/filter", {
      company: company.id,
      country,
      lang: "eng",
      sort: "score",
      sortType: "desc",
    });

    return (Array.isArray(data?.data) ? data.data : [])
      .map((series) => normalizeSeries(series, company.name))
      .filter(Boolean);
  } catch (error) {
    console.warn(
      `TVDB company filter failed for ${company.name} in ${country}:`,
      error.message
    );
    return [];
  }
}

async function mapWithConcurrency(items, concurrency, worker) {
  const output = new Array(items.length);
  let nextIndex = 0;

  async function run() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      output[index] = await worker(items[index], index);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, run)
  );
  return output;
}

function mergeUnique(groups) {
  const map = new Map();

  groups.flat().forEach((show) => {
    if (!show?.tvdb_id) return;
    const key = String(show.tvdb_id);
    const existing = map.get(key);

    if (
      !existing ||
      Number(show.popularity || 0) > Number(existing.popularity || 0)
    ) {
      map.set(key, show);
    }
  });

  return Array.from(map.values())
    .sort(
      (a, b) =>
        Number(b.popularity || 0) - Number(a.popularity || 0) ||
        String(a.name || "").localeCompare(String(b.name || ""))
    )
    .slice(0, MAX_RESULTS);
}

async function buildCompanyCatalogue(token, company) {
  const cacheKey = `company-id:${company.id}`;
  const cached = catalogueCache.get(cacheKey);

  if (cached && Date.now() - cached.createdAt < CACHE_TTL_MS) {
    return cached.results;
  }

  const primaryCountry = normalizeCountry(company.country);
  const countries = Array.from(
    new Set([primaryCountry, ...COMMON_COUNTRIES].filter(Boolean))
  );

  const countryResults = await mapWithConcurrency(
    countries,
    4,
    (country) => fetchCountryCatalogue(token, company, country)
  );

  const results = mergeUnique(countryResults);
  catalogueCache.set(cacheKey, {
    createdAt: Date.now(),
    results,
  });

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
    const requestedPage = Number(event.queryStringParameters?.page || 1);
    const page = Math.max(
      1,
      Number.isFinite(requestedPage) ? Math.floor(requestedPage) : 1
    );

    if (!query) {
      return response(400, { message: "Enter a studio or network name." });
    }

    const token = await getToken();
    const company = await resolveCompany(token, query);

    if (!company) {
      return response(404, {
        message: `No studio, network or production company matched “${query}”.`,
      });
    }

    const catalogue = await buildCompanyCatalogue(token, company);
    const offset = Math.max(0, (page - 1) * PAGE_SIZE);
    const results = catalogue.slice(offset, offset + PAGE_SIZE);

    if (!results.length && page === 1) {
      return response(404, {
        message: `No shows were found for ${company.name}.`,
      });
    }

    return response(200, {
      mode: "studio",
      query,
      matched: company.name,
      companyId: company.id,
      page,
      totalPages: Math.max(1, Math.ceil(catalogue.length / PAGE_SIZE)),
      totalResults: catalogue.length,
      hasMore: offset + results.length < catalogue.length,
      results,
      matchType: "tvdb-company-id-largest-catalogue",
    });
  } catch (error) {
    console.error("studioCatalogueSearch error", error);
    return response(500, {
      message: error?.message || "Studio search failed.",
    });
  }
}
