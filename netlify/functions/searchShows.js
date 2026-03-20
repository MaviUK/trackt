function normalizeNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
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

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (typeof item === "string") return item.trim();
      if (item && typeof item === "object") {
        return (
          item.name ??
          item.type ??
          item.label ??
          item.value ??
          item.setting ??
          item.relationship ??
          null
        );
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

  return /^[\p{Script=Latin}\p{Number}\p{Punctuation}\p{Separator}]+$/u.test(
    String(text)
  );
}

function getYear(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.getFullYear();
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
      (existing.original_language ? 1 : 0);

    const nextScore =
      (item.image_url ? 1 : 0) +
      (item.overview ? 1 : 0) +
      ((item.genres || []).length ? 1 : 0) +
      (item.network ? 1 : 0) +
      (item.rating_average != null ? 1 : 0) +
      (item.original_language ? 1 : 0);

    if (nextScore >= existingScore) {
      map.set(item.tvdb_id, item);
    }
  }

  return Array.from(map.values());
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

function normalizeSearchResult(item) {
  const rawGenres = Array.isArray(item?.genres)
    ? item.genres
    : Array.isArray(item?.genre)
    ? item.genre
    : [];

  return {
    tvdb_id: Number(item?.tvdb_id || item?.id) || null,
    tmdb_id: null,
    name: item?.name || item?.seriesName || "Unknown title",
    overview: item?.overview || "",
    status:
      typeof item?.status === "object"
        ? item?.status?.name || null
        : item?.status || null,
    first_aired: item?.first_air_time || item?.firstAired || null,
    first_air_time: item?.first_air_time || item?.firstAired || null,
    image_url: item?.image_url || item?.image || null,
    poster_url: item?.image_url || item?.image || null,
    slug: item?.slug || null,
    network: normalizeNetwork(
      item?.network ||
        item?.originalNetwork ||
        item?.latestNetwork ||
        item?.companies
    ),
    genres: normalizeGenres(rawGenres),
    relationship_types: normalizeStringArray(
      item?.relationship_types || item?.relationshipTypes
    ),
    settings: normalizeStringArray(item?.settings),
    original_language: normalizeLanguage(
      item?.originalLanguage || item?.language || ""
    ),
    rating_average: normalizeNumber(
      item?.rating_average ?? item?.score ?? item?.siteRating ?? item?.rating
    ),
    rating_count: normalizeNumber(
      item?.rating_count ?? item?.siteRatingCount ?? item?.scoreCount
    ),
    source: "tvdb",
  };
}

function extractTagValues(series, wantedLabel) {
  const pools = [
    series?.tags,
    series?.tagOptions,
    series?.attributes,
    series?.characteristics,
    series?.traits,
    series?.lists,
  ].filter(Array.isArray);

  const wanted = String(wantedLabel || "").trim().toLowerCase();
  const values = [];

  for (const pool of pools) {
    for (const item of pool) {
      const label = String(
        item?.tagName ||
          item?.type ||
          item?.name ||
          item?.category ||
          item?.label ||
          ""
      )
        .trim()
        .toLowerCase();

      if (!label || label !== wanted) continue;

      const candidates = [
        item?.options,
        item?.values,
        item?.items,
        item?.data,
      ].filter(Array.isArray);

      if (typeof item?.value === "string") values.push(item.value);
      if (typeof item?.name === "string" && label === wanted) values.push(item.name);

      for (const candidateList of candidates) {
        for (const candidate of candidateList) {
          if (typeof candidate === "string") values.push(candidate);
          else if (candidate && typeof candidate === "object") {
            values.push(
              candidate.name ??
                candidate.value ??
                candidate.label ??
                candidate.setting ??
                candidate.relationship ??
                null
            );
          }
        }
      }
    }
  }

  return normalizeStringArray(values);
}

function normalizeSeriesDetails(series) {
  const genres = Array.isArray(series?.genres)
    ? series.genres.map((genre) => genre?.name).filter(Boolean)
    : [];

  const companies = Array.isArray(series?.companies) ? series.companies : [];
  const primaryCompany =
    companies.find((company) => company?.primaryCompanyType === 1) ||
    companies[0] ||
    null;

  const artworks = Array.isArray(series?.artworks) ? series.artworks : [];

  const poster =
    artworks.find((art) => art?.type === 2)?.image || series?.image || null;

  return {
    tvdb_id: Number(series?.id) || null,
    tmdb_id: null,
    name: series?.name || "Unknown title",
    overview: series?.overview || "",
    status:
      typeof series?.status === "object"
        ? series?.status?.name || null
        : series?.status || null,
    first_aired: series?.firstAired || null,
    first_air_time: series?.firstAired || null,
    image_url: poster,
    poster_url: poster,
    slug: series?.slug || null,
    network: primaryCompany?.name || null,
    genres,
    relationship_types:
      normalizeStringArray(series?.relationship_types).length > 0
        ? normalizeStringArray(series?.relationship_types)
        : extractTagValues(series, "relationship types"),
    settings:
      normalizeStringArray(series?.settings).length > 0
        ? normalizeStringArray(series?.settings)
        : extractTagValues(series, "setting"),
    original_language: normalizeLanguage(
      series?.originalLanguage || series?.language || ""
    ),
    rating_average: normalizeNumber(
      series?.score ??
        series?.siteRating ??
        series?.averageScore ??
        series?.rating_average
    ),
    rating_count: normalizeNumber(
      series?.siteRatingCount ??
        series?.scoreCount ??
        series?.ratingCount ??
        series?.rating_count
    ),
    source: "tvdb",
  };
}

function normalizeTmdbShow(item, networkName = "") {
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
    network: networkName || null,
    genres: [],
    relationship_types: [],
    settings: [],
    original_language: normalizeLanguage(item?.original_language || ""),
    rating_average: normalizeNumber(item?.vote_average),
    rating_count: normalizeNumber(item?.vote_count),
    source: "tmdb",
  };
}

function isExcludedNetworkResult(show) {
  const title = String(show?.name || "").toLowerCase();
  const overview = String(show?.overview || "").toLowerCase();

  const blockedTitleTerms = [
    "news",
    "nightly news",
    "morning news",
    "evening news",
    "today",
    "dateline",
    "late night",
    "tonight show",
    "daily",
    "weekend news",
    "meet the press",
    "soap opera",
  ];

  const blockedOverviewTerms = [
    "news program",
    "newsmagazine",
    "daily news",
    "morning news",
    "evening news",
    "late-night",
    "talk show",
    "public affairs",
    "current affairs",
    "soap opera",
    "variety show",
    "broadcast journalist",
    "broadcast on",
    "broadcast from",
  ];

  if (blockedTitleTerms.some((term) => title.includes(term))) return true;
  if (blockedOverviewTerms.some((term) => overview.includes(term))) return true;

  return false;
}

function sortNewestToOldest(items) {
  return [...items].sort((a, b) => {
    const aTime = a.first_aired ? new Date(a.first_aired).getTime() : 0;
    const bTime = b.first_aired ? new Date(b.first_aired).getTime() : 0;
    return bTime - aTime;
  });
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
  "science fiction": [
    "science fiction",
    "sci-fi",
    "fantasy",
    "adventure",
    "thriller",
  ],
  "sci-fi": ["sci-fi", "science fiction", "fantasy", "adventure", "thriller"],
  animation: ["animation", "family", "comedy", "fantasy"],
};

function buildSeedTerms({
  query,
  genre,
  network,
  relationshipType,
  setting,
}) {
  if (query) {
    return [query];
  }

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

  if (relationshipType || setting) {
    return [
      "top rated series",
      "popular series",
      "best tv series",
      "award winning series",
      "trending series",
    ];
  }

  if (genre) {
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
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      apikey: process.env.TVDB_API_KEY,
      pin: process.env.TVDB_PIN,
    }),
  });

  const loginData = await loginRes.json();

  if (!loginRes.ok) {
    throw new Error(
      `TVDB login failed: ${loginData?.message || JSON.stringify(loginData)}`
    );
  }

  const token = loginData?.data?.token;

  if (!token) {
    throw new Error("TVDB token missing after login");
  }

  return token;
}

async function searchTvdb(token, term) {
  const searchRes = await fetch(
    `https://api4.thetvdb.com/v4/search?query=${encodeURIComponent(term)}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    }
  );

  const searchData = await searchRes.json();

  if (!searchRes.ok) {
    throw new Error(
      `TVDB search failed: ${searchData?.message || JSON.stringify(searchData)}`
    );
  }

  const allResults = Array.isArray(searchData?.data) ? searchData.data : [];

  return allResults
    .filter((item) => {
      const type = String(item?.type || "").toLowerCase();
      return type === "series";
    })
    .map(normalizeSearchResult)
    .filter((item) => item.tvdb_id);
}

async function fetchSeriesDetails(token, tvdbId) {
  const res = await fetch(
    `https://api4.thetvdb.com/v4/series/${tvdbId}/extended`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    }
  );

  const data = await res.json();

  if (!res.ok || !data?.data) {
    return null;
  }

  return normalizeSeriesDetails(data.data);
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

async function findTmdbNetworkIdByName(networkName) {
  const data = await tmdbFetch("/search/company", {
    query: networkName,
    page: 1,
  });

  const results = Array.isArray(data?.results) ? data.results : [];
  if (!results.length) return null;

  const exact = results.find(
    (item) =>
      String(item?.name || "").trim().toLowerCase() ===
      String(networkName || "").trim().toLowerCase()
  );

  return exact?.id || results[0]?.id || null;
}

async function discoverTmdbByNetwork(networkName) {
  const networkId = await findTmdbNetworkIdByName(networkName);

  if (!networkId) {
    return [];
  }

  const all = [];

  for (let page = 1; page <= 3; page += 1) {
    const data = await tmdbFetch("/discover/tv", {
      with_networks: networkId,
      sort_by: "first_air_date.desc",
      include_null_first_air_dates: "false",
      page,
    });

    const results = Array.isArray(data?.results) ? data.results : [];
    all.push(...results);

    const totalPages = Number(data?.total_pages || 1);
    if (page >= totalPages) break;
  }

  const normalized = all.map((item) => normalizeTmdbShow(item, networkName));

  const filtered = normalized.filter((item) => {
    if (isExcludedNetworkResult(item)) return false;

    const year = getYear(item.first_aired || item.first_air_time);
    if (year != null && year < 1990) return false;

    const rating = normalizeNumber(item.rating_average);
    if (rating != null && rating < 5.5) return false;

    return true;
  });

  return sortNewestToOldest(filtered).slice(0, 40);
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
  const showRelationshipTypes = normalizeStringArray(
    show.relationship_types
  ).map((v) => v.toLowerCase());
  const showSettings = normalizeStringArray(show.settings).map((v) =>
    v.toLowerCase()
  );
  const showYear = getYear(show.first_aired || show.first_air_time);
  const showRating = normalizeNumber(show.rating_average);
  const showLanguage = normalizeLanguage(show.original_language || "");

  if (sourceShowId && Number(show.tvdb_id) === Number(sourceShowId)) {
    return -9999;
  }

  if (query) {
    const queryLower = query.toLowerCase();
    if (name.includes(queryLower)) score += 20;
    if (overview.includes(queryLower)) score += 6;
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

    if (
      genreLower === "drama" &&
      (showGenres.includes("animation") || showGenres.includes("family"))
    ) {
      score -= 14;
    }

    if (
      genreLower === "thriller" &&
      (showGenres.includes("animation") || showGenres.includes("family"))
    ) {
      score -= 14;
    }
  }

  if (network) {
    const networkLower = network.toLowerCase();

    if (showNetwork === networkLower) score += 20;
    else if (showNetwork.includes(networkLower)) score += 10;
    else score -= 8;
  }

  if (relationshipType) {
    const relLower = relationshipType.toLowerCase();
    if (showRelationshipTypes.includes(relLower)) score += 24;
    else if (
      showRelationshipTypes.some((v) => v.includes(relLower) || relLower.includes(v))
    ) {
      score += 10;
    } else {
      score -= 14;
    }
  }

  if (setting) {
    const settingLower = setting.toLowerCase();
    if (showSettings.includes(settingLower)) score += 24;
    else if (
      showSettings.some(
        (v) => v.includes(settingLower) || settingLower.includes(v)
      )
    ) {
      score += 10;
    } else {
      score -= 14;
    }
  }

  if (targetLanguage) {
    if (showLanguage === targetLanguage) {
      score += 16;
    } else if (showLanguage) {
      score -= 20;
    } else if (targetLanguage === "english") {
      if (looksMostlyLatin(show.name) && looksMostlyLatin(show.overview)) {
        score += 8;
      } else {
        score -= 18;
      }
    }
  }

  if (sourceYear && showYear) {
    const minYear = Number(sourceYear) - 3;

    if (showYear < minYear) {
      score -= 30;
    } else {
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
    const relationshipType =
      event.queryStringParameters?.relationshipType?.trim() || "";
    const setting = event.queryStringParameters?.setting?.trim() || "";
    const sourceShowId = event.queryStringParameters?.sourceShowId?.trim() || "";
    const sourceYear = event.queryStringParameters?.sourceYear?.trim() || "";
    const sourceRatingRaw =
      event.queryStringParameters?.sourceRating?.trim() || "";
    const sourceLanguageRaw =
      event.queryStringParameters?.sourceLanguage?.trim() || "";

    const sourceRating = normalizeNumber(sourceRatingRaw);
    const sourceLanguage = normalizeLanguage(sourceLanguageRaw);
    const targetLanguage = sourceLanguage || "english";

    if (!query && !genre && !network && !relationshipType && !setting) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          message: "Missing search query",
        }),
      };
    }

    if (network && !genre && !relationshipType && !setting && !query) {
      const results = await discoverTmdbByNetwork(network);

      return {
        statusCode: 200,
        body: JSON.stringify(results),
      };
    }

    const token = await loginToTvdb();

    if (query && !genre && !network && !relationshipType && !setting) {
      const directResults = await searchTvdb(token, query);

      const ranked = dedupeByTvdbId(directResults)
        .map((item) => {
          const name = String(item.name || "").toLowerCase();
          const overview = String(item.overview || "").toLowerCase();
          const queryLower = query.toLowerCase();

          let score = 0;
          if (name === queryLower) score += 100;
          if (name.startsWith(queryLower)) score += 40;
          if (name.includes(queryLower)) score += 20;
          if (overview.includes(queryLower)) score += 5;
          if (item.image_url) score += 2;
          if (item.rating_average != null) score += 2;

          return { ...item, _score: score };
        })
        .sort((a, b) => {
          if (b._score !== a._score) return b._score - a._score;

          const bRating = normalizeNumber(b.rating_average) ?? -1;
          const aRating = normalizeNumber(a.rating_average) ?? -1;
          return bRating - aRating;
        })
        .slice(0, 40)
        .map(({ _score, ...item }) => item);

      return {
        statusCode: 200,
        body: JSON.stringify(ranked),
      };
    }

    const seedTerms = buildSeedTerms({
      query,
      genre,
      network,
      relationshipType,
      setting,
    });

    let candidates = [];

    for (const term of seedTerms.slice(0, 6)) {
      const results = await searchTvdb(token, term);
      candidates.push(...results);
    }

    candidates = dedupeByTvdbId(candidates);

    const enriched = [];
    for (const candidate of candidates.slice(0, 40)) {
      const details = await fetchSeriesDetails(token, candidate.tvdb_id);
      enriched.push(details || candidate);
    }

    let results = dedupeByTvdbId(enriched);

    results = results.filter((item) => {
      const itemLanguage = normalizeLanguage(item.original_language || "");

      if (targetLanguage) {
        if (itemLanguage) {
          return itemLanguage === targetLanguage;
        }

        if (targetLanguage === "english") {
          return (
            looksMostlyLatin(item.name || "") &&
            looksMostlyLatin(item.overview || "")
          );
        }
      }

      return true;
    });

    if (genre) {
      const genreLower = genre.toLowerCase();
      const related = RELATED_GENRES[genreLower] || [genreLower];

      results = results.filter((item) => {
        const itemGenres = normalizeGenres(item.genres).map((g) =>
          g.toLowerCase()
        );

        const exact = itemGenres.includes(genreLower);
        const relatedHit = itemGenres.some((g) => related.includes(g));

        if (!exact && !relatedHit) return false;

        if (
          genreLower === "drama" &&
          String(item.name || "").toLowerCase().includes("drama") &&
          (itemGenres.includes("animation") || itemGenres.includes("family"))
        ) {
          return false;
        }

        return true;
      });
    }

    if (network) {
      const networkLower = network.toLowerCase();

      results = results.filter((item) =>
        String(item.network || "")
          .toLowerCase()
          .includes(networkLower)
      );
    }

    if (relationshipType) {
      const relLower = relationshipType.toLowerCase();

      results = results.filter((item) => {
        const vals = normalizeStringArray(item.relationship_types).map((v) =>
          v.toLowerCase()
        );

        return vals.includes(relLower) ||
          vals.some((v) => v.includes(relLower) || relLower.includes(v));
      });
    }

    if (setting) {
      const settingLower = setting.toLowerCase();

      results = results.filter((item) => {
        const vals = normalizeStringArray(item.settings).map((v) =>
          v.toLowerCase()
        );

        return vals.includes(settingLower) ||
          vals.some((v) => v.includes(settingLower) || settingLower.includes(v));
      });
    }

    if (sourceYear) {
      const minYear = Number(sourceYear) - 3;

      results = results.filter((item) => {
        const itemYear = getYear(item.first_aired || item.first_air_time);
        return itemYear == null || itemYear >= minYear;
      });
    } else {
      results = results.filter((item) => {
        const itemYear = getYear(item.first_aired || item.first_air_time);
        return itemYear == null || itemYear >= 2010;
      });
    }

    if (sourceRating != null) {
      results = results.filter((item) => {
        const itemRating = normalizeNumber(item.rating_average);
        return itemRating == null || itemRating >= sourceRating;
      });
    } else {
      results = results.filter((item) => {
        const itemRating = normalizeNumber(item.rating_average);
        return itemRating == null || itemRating >= 6.5;
      });
    }

    results = results
      .map((item) => ({
        ...item,
        _score: scoreShow(item, {
          query,
          genre,
          network,
          relationshipType,
          setting,
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
