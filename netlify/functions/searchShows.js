function normalizeNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function normalizeTextArray(value) {
  if (!Array.isArray(value)) return [];

  return Array.from(
    new Set(
      value
        .map((item) => {
          if (typeof item === "string") return item.trim();
          if (item && typeof item === "object") {
            return String(item.name ?? item.value ?? item.label ?? "").trim();
          }
          return "";
        })
        .filter(Boolean)
    )
  );
}

function normalizeGenres(value) {
  if (!Array.isArray(value)) return [];

  return value
    .map((genre) => {
      if (typeof genre === "string") return genre;
      if (genre && typeof genre === "object") {
        return genre.name ?? genre.genre ?? null;
      }
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

  if (typeof value === "object") {
    return value.name ?? null;
  }

  return value;
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

function looksMostlyLatin(text) {
  if (!text) return true;
  return /^[\p{Script=Latin}\p{Number}\p{Punctuation}\p{Separator}]+$/u.test(String(text));
}

function getYear(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.getFullYear();
}

function dedupeByValue(values) {
  return Array.from(
    new Set(
      values
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    )
  );
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
    const existingScore =
      (existing.image_url ? 1 : 0) +
      (existing.overview ? 1 : 0) +
      ((existing.genres || []).length ? 1 : 0) +
      (existing.network ? 1 : 0) +
      (existing.rating_average != null ? 1 : 0) +
      (existing.original_language ? 1 : 0) +
      ((existing.relationship_types || []).length ? 1 : 0) +
      ((existing.settings || []).length ? 1 : 0);

    const nextScore =
      (item.image_url ? 1 : 0) +
      (item.overview ? 1 : 0) +
      ((item.genres || []).length ? 1 : 0) +
      (item.network ? 1 : 0) +
      (item.rating_average != null ? 1 : 0) +
      (item.original_language ? 1 : 0) +
      ((item.relationship_types || []).length ? 1 : 0) +
      ((item.settings || []).length ? 1 : 0);

    if (nextScore >= existingScore) map.set(item.tvdb_id, item);
  }

  return Array.from(map.values());
}

function normalizeSearchResult(item) {
  const rawGenres = Array.isArray(item?.genres)
    ? item.genres
    : Array.isArray(item?.genre)
    ? item.genre
    : [];

  return {
    tvdb_id: Number(item?.tvdb_id || item?.id) || null,
    name: item?.name || item?.seriesName || "Unknown title",
    overview: item?.overview || "",
    status:
      typeof item?.status === "object"
        ? item?.status?.name || null
        : item?.status || null,
    first_aired: item?.first_air_time || item?.firstAired || null,
    first_air_time: item?.first_air_time || item?.firstAired || null,
    image_url: item?.image_url || item?.image || null,
    slug: item?.slug || null,
    network: normalizeNetwork(
      item?.network || item?.originalNetwork || item?.latestNetwork || item?.companies
    ),
    genres: normalizeGenres(rawGenres),
    original_language: normalizeLanguage(item?.originalLanguage || item?.language || ""),
    relationship_types: normalizeTextArray(item?.relationship_types),
    settings: normalizeTextArray(item?.settings),
    rating_average: normalizeNumber(item?.rating_average ?? item?.score ?? item?.siteRating ?? item?.rating),
    rating_count: normalizeNumber(item?.rating_count ?? item?.siteRatingCount ?? item?.scoreCount),
  };
}

function normalizeSeriesDetails(series) {
  const genres = Array.isArray(series?.genres)
    ? series.genres.map((genre) => genre?.name).filter(Boolean)
    : [];

  const companies = Array.isArray(series?.companies) ? series.companies : [];
  const primaryCompany = companies.find((company) => company?.primaryCompanyType === 1) || companies[0] || null;
  const artworks = Array.isArray(series?.artworks) ? series.artworks : [];
  const poster = artworks.find((art) => art?.type === 2)?.image || series?.image || null;

  return {
    tvdb_id: Number(series?.id) || null,
    name: series?.name || "Unknown title",
    overview: series?.overview || "",
    status:
      typeof series?.status === "object"
        ? series?.status?.name || null
        : series?.status || null,
    first_aired: series?.firstAired || null,
    first_air_time: series?.firstAired || null,
    image_url: poster,
    slug: series?.slug || null,
    network: primaryCompany?.name || null,
    genres,
    original_language: normalizeLanguage(series?.originalLanguage || series?.language || ""),
    relationship_types: normalizeTextArray(series?.relationship_types),
    settings: normalizeTextArray(series?.settings),
    rating_average: normalizeNumber(series?.score ?? series?.siteRating ?? series?.averageScore ?? series?.rating_average),
    rating_count: normalizeNumber(series?.siteRatingCount ?? series?.scoreCount ?? series?.ratingCount ?? series?.rating_count),
  };
}

const RELATED_GENRES = {
  drama: ["drama", "thriller", "crime", "mystery", "romance"],
  thriller: ["thriller", "crime", "mystery", "drama", "horror", "suspense"],
  crime: ["crime", "thriller", "drama", "mystery", "police"],
  mystery: ["mystery", "thriller", "crime", "drama", "supernatural"],
  horror: ["horror", "thriller", "mystery", "supernatural", "drama"],
  comedy: ["comedy", "sitcom", "family", "romance"],
  romance: ["romance", "drama", "comedy"],
  action: ["action", "adventure", "thriller", "crime", "drama"],
  adventure: ["adventure", "action", "fantasy", "science fiction", "drama"],
  fantasy: ["fantasy", "science fiction", "adventure", "drama"],
  "science fiction": ["science fiction", "sci-fi", "fantasy", "adventure", "thriller"],
  "sci-fi": ["sci-fi", "science fiction", "fantasy", "adventure", "thriller"],
  animation: ["animation", "family", "comedy", "fantasy"],
};

function buildSeedTerms({ query, genre, network, relationshipType, setting }) {
  if (query) return [query];

  if (network) {
    return dedupeByValue([
      network,
      `${network} series`,
      `${network} show`,
      `${network} original series`,
      "top rated series",
      "popular series",
    ]);
  }

  if (relationshipType || setting || genre) {
    return [
      "top rated series",
      "popular series",
      "best tv series",
      "hit television series",
      "award winning series",
      "trending series",
    ];
  }

  return [];
}

async function loginToTvdb() {
  const loginRes = await fetch("https://api4.thetvdb.com/v4/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      apikey: process.env.TVDB_API_KEY,
      pin: process.env.TVDB_PIN,
    }),
  });

  const loginData = await loginRes.json();
  if (!loginRes.ok) {
    throw new Error(`TVDB login failed: ${loginData?.message || JSON.stringify(loginData)}`);
  }

  const token = loginData?.data?.token;
  if (!token) throw new Error("TVDB token missing after login");
  return token;
}

async function searchTvdb(token, term) {
  const searchRes = await fetch(`https://api4.thetvdb.com/v4/search?query=${encodeURIComponent(term)}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });

  const searchData = await searchRes.json();
  if (!searchRes.ok) {
    throw new Error(`TVDB search failed: ${searchData?.message || JSON.stringify(searchData)}`);
  }

  const allResults = Array.isArray(searchData?.data) ? searchData.data : [];

  return allResults
    .filter((item) => String(item?.type || "").toLowerCase() === "series")
    .map(normalizeSearchResult)
    .filter((item) => item.tvdb_id);
}

async function fetchSeriesDetails(token, tvdbId) {
  const res = await fetch(`https://api4.thetvdb.com/v4/series/${tvdbId}/extended`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });

  const data = await res.json();
  if (!res.ok || !data?.data) return null;
  return normalizeSeriesDetails(data.data);
}

async function queryLocalShows({ genre, network, relationshipType, setting, sourceShowId, sourceYear, sourceRating, sourceLanguage }) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!url || !key) return [];

  const params = new URLSearchParams();
  params.set("select", [
    "tvdb_id",
    "name",
    "overview",
    "status",
    "first_aired",
    "poster_url",
    "network",
    "genres",
    "original_language",
    "relationship_types",
    "settings",
    "rating_average",
    "rating_count",
  ].join(","));
  params.set("order", "rating_average.desc.nullslast,first_aired.desc.nullslast");
  params.set("limit", "120");

  if (sourceShowId) params.set("tvdb_id", `neq.${sourceShowId}`);
  if (network) params.set("network", `ilike.*${network.replace(/\*/g, "") }*`);
  if (sourceLanguage) params.set("original_language", `eq.${sourceLanguage}`);
  if (sourceYear) params.set("first_aired", `gte.${Number(sourceYear) - 3}-01-01`);
  if (sourceRating != null) params.set("rating_average", `gte.${sourceRating}`);

  const res = await fetch(`${url}/rest/v1/shows?${params.toString()}`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
    },
  });

  if (!res.ok) return [];
  const rows = await res.json();

  return (Array.isArray(rows) ? rows : [])
    .map((row) => ({
      tvdb_id: Number(row.tvdb_id) || null,
      name: row.name || "Unknown title",
      overview: row.overview || "",
      status: row.status || null,
      first_aired: row.first_aired || null,
      first_air_time: row.first_aired || null,
      image_url: row.poster_url || null,
      slug: row.slug || null,
      network: row.network || null,
      genres: normalizeGenres(row.genres),
      original_language: normalizeLanguage(row.original_language || ""),
      relationship_types: normalizeTextArray(row.relationship_types),
      settings: normalizeTextArray(row.settings),
      rating_average: normalizeNumber(row.rating_average),
      rating_count: normalizeNumber(row.rating_count),
    }))
    .filter((item) => item.tvdb_id)
    .filter((item) => {
      if (genre) {
        const genreLower = genre.toLowerCase();
        const related = RELATED_GENRES[genreLower] || [genreLower];
        const itemGenres = normalizeGenres(item.genres).map((g) => g.toLowerCase());
        if (!itemGenres.includes(genreLower) && !itemGenres.some((g) => related.includes(g))) {
          return false;
        }
      }

      if (relationshipType) {
        const rels = normalizeTextArray(item.relationship_types).map((v) => v.toLowerCase());
        if (!rels.includes(String(relationshipType).toLowerCase())) return false;
      }

      if (setting) {
        const settings = normalizeTextArray(item.settings).map((v) => v.toLowerCase());
        if (!settings.includes(String(setting).toLowerCase())) return false;
      }

      return true;
    });
}

async function cacheShows(items) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || !items.length) return;

  const payload = items
    .filter((item) => item.tvdb_id)
    .map((item) => ({
      tvdb_id: item.tvdb_id,
      name: item.name || "Unknown title",
      overview: item.overview || null,
      status: item.status || null,
      first_aired: item.first_aired || item.first_air_time || null,
      poster_url: item.image_url || null,
      network: item.network || null,
      genres: normalizeGenres(item.genres),
      original_language: item.original_language || null,
      relationship_types: normalizeTextArray(item.relationship_types),
      settings: normalizeTextArray(item.settings),
      rating_average: normalizeNumber(item.rating_average),
      rating_count: normalizeNumber(item.rating_count),
      last_synced_at: new Date().toISOString(),
    }));

  await fetch(`${url}/rest/v1/shows?on_conflict=tvdb_id`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates",
    },
    body: JSON.stringify(payload),
  }).catch(() => null);
}

function scoreShow(show, options) {
  const {
    query,
    genre,
    network,
    relationshipType,
    setting,
    sourceYear,
    sourceRating,
    sourceShowId,
    targetLanguage,
  } = options;

  let score = 0;

  const name = String(show.name || "").toLowerCase();
  const overview = String(show.overview || "").toLowerCase();
  const showGenres = normalizeGenres(show.genres).map((g) => g.toLowerCase());
  const showNetwork = String(show.network || "").toLowerCase();
  const showYear = getYear(show.first_aired || show.first_air_time);
  const showRating = normalizeNumber(show.rating_average);
  const showLanguage = normalizeLanguage(show.original_language || "");
  const showRelationshipTypes = normalizeTextArray(show.relationship_types).map((v) => v.toLowerCase());
  const showSettings = normalizeTextArray(show.settings).map((v) => v.toLowerCase());

  if (sourceShowId && Number(show.tvdb_id) === Number(sourceShowId)) return -9999;

  if (query) {
    const queryLower = query.toLowerCase();
    if (name.includes(queryLower)) score += 14;
    if (overview.includes(queryLower)) score += 4;
  }

  if (genre) {
    const genreLower = genre.toLowerCase();
    const related = RELATED_GENRES[genreLower] || [genreLower];
    const hasExactGenre = showGenres.includes(genreLower);
    const hasRelatedGenre = showGenres.some((g) => related.includes(g));

    if (hasExactGenre) score += 28;
    else if (hasRelatedGenre) score += 10;
    else score -= 20;

    if (name.includes(genreLower)) score -= 18;
    if (genreLower === "drama" && (showGenres.includes("animation") || showGenres.includes("family"))) score -= 14;
    if (genreLower === "thriller" && (showGenres.includes("animation") || showGenres.includes("family"))) score -= 14;
  }

  if (network) {
    const networkLower = network.toLowerCase();
    if (showNetwork === networkLower) score += 20;
    else if (showNetwork.includes(networkLower)) score += 10;
    else score -= 8;
  }

  if (relationshipType) {
    const relLower = relationshipType.toLowerCase();
    if (showRelationshipTypes.includes(relLower)) score += 18;
    else score -= 16;
  }

  if (setting) {
    const settingLower = setting.toLowerCase();
    if (showSettings.includes(settingLower)) score += 18;
    else score -= 16;
  }

  if (targetLanguage) {
    if (showLanguage === targetLanguage) score += 16;
    else if (showLanguage) score -= 20;
    else if (targetLanguage === "english") {
      if (looksMostlyLatin(show.name) && looksMostlyLatin(show.overview)) score += 8;
      else score -= 18;
    }
  }

  if (sourceYear && showYear) {
    const minYear = Number(sourceYear) - 3;
    if (showYear < minYear) score -= 30;
    else {
      score += 8;
      if (showYear >= Number(sourceYear)) score += 4;
    }
  } else if (showYear) {
    if (showYear >= 2016) score += 6;
    else if (showYear >= 2010) score += 2;
    else score -= 8;
  }

  if (sourceRating != null && showRating != null) {
    if (showRating >= Number(sourceRating)) {
      score += 10;
      score += Math.min(5, showRating - Number(sourceRating));
    } else {
      score -= 20;
    }
  } else if (showRating != null) {
    if (showRating >= 7.5) score += 8;
    else if (showRating >= 7.0) score += 4;
    else if (showRating < 6.0) score -= 8;
  }

  if (show.image_url) score += 2;
  if (show.overview) score += 2;
  if (showRating != null) score += 2;
  return score;
}

export async function handler(event) {
  try {
    const query = event.queryStringParameters?.q?.trim() || "";
    const genre = event.queryStringParameters?.genre?.trim() || "";
    const network = event.queryStringParameters?.network?.trim() || "";
    const relationshipType = event.queryStringParameters?.relationshipType?.trim() || "";
    const setting = event.queryStringParameters?.setting?.trim() || "";
    const sourceShowId = event.queryStringParameters?.sourceShowId?.trim() || "";
    const sourceYear = event.queryStringParameters?.sourceYear?.trim() || "";
    const sourceRating = normalizeNumber(event.queryStringParameters?.sourceRating?.trim() || "");
    const sourceLanguage = normalizeLanguage(event.queryStringParameters?.sourceLanguage?.trim() || "");
    const targetLanguage = sourceLanguage || "english";

    if (!query && !genre && !network && !relationshipType && !setting) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: "Missing search query" }),
      };
    }

    const useRelationshipType = Boolean(relationshipType);
    const useSetting = Boolean(setting);

    let results = await queryLocalShows({
      genre,
      network,
      relationshipType: useRelationshipType ? relationshipType : "",
      setting: useSetting ? setting : "",
      sourceShowId,
      sourceYear,
      sourceRating,
      sourceLanguage,
    });

    const needsFallback = results.length < 24;

    if (needsFallback) {
      const token = await loginToTvdb();
      const seedTerms = buildSeedTerms({ query, genre, network, relationshipType, setting });

      let candidates = [];
      for (const term of seedTerms.slice(0, 6)) {
        const found = await searchTvdb(token, term);
        candidates.push(...found);
      }

      candidates = dedupeByTvdbId(candidates);

      const enriched = [];
      for (const candidate of candidates.slice(0, 40)) {
        const details = await fetchSeriesDetails(token, candidate.tvdb_id);
        enriched.push(details || candidate);
      }

      const fallbackResults = dedupeByTvdbId(enriched).filter((item) => {
        const itemLanguage = normalizeLanguage(item.original_language || "");
        if (targetLanguage) {
          if (itemLanguage && itemLanguage !== targetLanguage) return false;
          if (!itemLanguage && targetLanguage === "english") {
            if (!looksMostlyLatin(item.name || "") || !looksMostlyLatin(item.overview || "")) {
              return false;
            }
          }
        }

        if (genre) {
          const genreLower = genre.toLowerCase();
          const related = RELATED_GENRES[genreLower] || [genreLower];
          const itemGenres = normalizeGenres(item.genres).map((g) => g.toLowerCase());
          const exact = itemGenres.includes(genreLower);
          const relatedHit = itemGenres.some((g) => related.includes(g));
          if (!exact && !relatedHit) return false;
        }

        if (network) {
          if (!String(item.network || "").toLowerCase().includes(network.toLowerCase())) return false;
        }

        if (useRelationshipType) {
          const rels = normalizeTextArray(item.relationship_types).map((v) => v.toLowerCase());
          if (rels.length && !rels.includes(relationshipType.toLowerCase())) return false;
        }

        if (useSetting) {
          const settings = normalizeTextArray(item.settings).map((v) => v.toLowerCase());
          if (settings.length && !settings.includes(setting.toLowerCase())) return false;
        }

        if (sourceYear) {
          const itemYear = getYear(item.first_aired || item.first_air_time);
          if (itemYear != null && itemYear < Number(sourceYear) - 3) return false;
        } else {
          const itemYear = getYear(item.first_aired || item.first_air_time);
          if (itemYear != null && itemYear < 2010) return false;
        }

        if (sourceRating != null) {
          const itemRating = normalizeNumber(item.rating_average);
          if (itemRating != null && itemRating < sourceRating) return false;
        } else {
          const itemRating = normalizeNumber(item.rating_average);
          if (itemRating != null && itemRating < 6.5) return false;
        }

        return true;
      });

      await cacheShows(fallbackResults);
      results = dedupeByTvdbId([...results, ...fallbackResults]);
    }

    results = results
      .map((item) => ({
        ...item,
        _score: scoreShow(item, {
          query,
          genre,
          network,
          relationshipType: useRelationshipType ? relationshipType : "",
          setting: useSetting ? setting : "",
          sourceYear,
          sourceRating,
          sourceShowId,
          targetLanguage,
        }),
      }))
      .filter((item) => item._score > -1000)
      .sort((a, b) => {
        if (b._score !== a._score) return b._score - a._score;
        const bRating = normalizeNumber(b.rating_average) ?? -1;
        const aRating = normalizeNumber(a.rating_average) ?? -1;
        if (bRating !== aRating) return bRating - aRating;
        const bYear = getYear(b.first_aired || b.first_air_time) ?? 0;
        const aYear = getYear(a.first_aired || a.first_air_time) ?? 0;
        return bYear - aYear;
      })
      .slice(0, 40)
      .map(({ _score, ...item }) => item);

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
