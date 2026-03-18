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
      (existing.rating_average != null ? 1 : 0);

    const nextScore =
      (item.image_url ? 1 : 0) +
      (item.overview ? 1 : 0) +
      ((item.genres || []).length ? 1 : 0) +
      (item.network ? 1 : 0) +
      (item.rating_average != null ? 1 : 0);

    if (nextScore >= existingScore) {
      map.set(item.tvdb_id, item);
    }
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
      item?.network ||
        item?.originalNetwork ||
        item?.latestNetwork ||
        item?.companies
    ),
    genres: normalizeGenres(rawGenres),
    rating_average: normalizeNumber(
      item?.rating_average ?? item?.score ?? item?.siteRating ?? item?.rating
    ),
    rating_count: normalizeNumber(
      item?.rating_count ?? item?.siteRatingCount ?? item?.scoreCount
    ),
  };
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

function buildSeedTerms({ query, genre, network }) {
  if (query) return [query];

  if (network) {
    return [network, `${network} series`, `${network} drama`, `${network} show`];
  }

  if (genre) {
    const lower = genre.toLowerCase();
    const related = RELATED_GENRES[lower] || [lower];

    return dedupeByValue([
      genre,
      `${genre} series`,
      `${genre} show`,
      ...related,
    ]);
  }

  return [];
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
  const res = await fetch(`https://api4.thetvdb.com/v4/series/${tvdbId}/extended`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });

  const data = await res.json();

  if (!res.ok) {
    return null;
  }

  if (!data?.data) return null;

  return normalizeSeriesDetails(data.data);
}

function scoreShow(show, options) {
  const {
    query,
    genre,
    network,
    sourceYear,
    sourceRating,
    sourceShowId,
  } = options;

  let score = 0;

  const name = String(show.name || "").toLowerCase();
  const overview = String(show.overview || "").toLowerCase();
  const showGenres = normalizeGenres(show.genres).map((g) => g.toLowerCase());
  const showNetwork = String(show.network || "").toLowerCase();
  const showYear = getYear(show.first_aired || show.first_air_time);
  const showRating = normalizeNumber(show.rating_average);

  if (sourceShowId && Number(show.tvdb_id) === Number(sourceShowId)) {
    return -9999;
  }

  if (query) {
    const queryLower = query.toLowerCase();
    if (name.includes(queryLower)) score += 12;
    if (overview.includes(queryLower)) score += 4;
  }

  if (genre) {
    const genreLower = genre.toLowerCase();
    const related = RELATED_GENRES[genreLower] || [genreLower];

    if (showGenres.includes(genreLower)) {
      score += 20;
    } else if (showGenres.some((g) => related.includes(g))) {
      score += 10;
    } else {
      score -= 8;
    }
  }

  if (network) {
    const networkLower = network.toLowerCase();

    if (showNetwork === networkLower) {
      score += 20;
    } else if (showNetwork.includes(networkLower)) {
      score += 10;
    } else {
      score -= 8;
    }
  }

  if (sourceYear && showYear) {
    const minYear = Number(sourceYear) - 3;

    if (showYear < minYear) {
      score -= 30;
    } else {
      score += 8;

      if (showYear >= Number(sourceYear)) {
        score += 4;
      }
    }
  }

  if (sourceRating != null && showRating != null) {
    if (showRating >= Number(sourceRating)) {
      score += 10;
      score += Math.min(5, showRating - Number(sourceRating));
    } else {
      score -= 20;
    }
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
    const sourceShowId = event.queryStringParameters?.sourceShowId?.trim() || "";
    const sourceYear = event.queryStringParameters?.sourceYear?.trim() || "";
    const sourceRatingRaw =
      event.queryStringParameters?.sourceRating?.trim() || "";
    const sourceRating = normalizeNumber(sourceRatingRaw);

    if (!query && !genre && !network) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          message: "Missing search query",
        }),
      };
    }

    const token = await loginToTvdb();

    const seedTerms = buildSeedTerms({
      query,
      genre,
      network,
    });

    let candidates = [];

    for (const term of seedTerms.slice(0, 5)) {
      const results = await searchTvdb(token, term);
      candidates.push(...results);
    }

    candidates = dedupeByTvdbId(candidates);

    const enriched = [];
    for (const candidate of candidates.slice(0, 30)) {
      const details = await fetchSeriesDetails(token, candidate.tvdb_id);
      enriched.push(details || candidate);
    }

    let results = dedupeByTvdbId(enriched);

    if (genre) {
      const genreLower = genre.toLowerCase();
      const related = RELATED_GENRES[genreLower] || [genreLower];

      results = results.filter((item) => {
        const itemGenres = normalizeGenres(item.genres).map((g) => g.toLowerCase());
        return itemGenres.includes(genreLower) || itemGenres.some((g) => related.includes(g));
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

    if (sourceYear) {
      const minYear = Number(sourceYear) - 3;

      results = results.filter((item) => {
        const itemYear = getYear(item.first_aired || item.first_air_time);
        return itemYear == null || itemYear >= minYear;
      });
    }

    if (sourceRating != null) {
      results = results.filter((item) => {
        const itemRating = normalizeNumber(item.rating_average);
        return itemRating == null || itemRating >= sourceRating;
      });
    }

    results = results
      .map((item) => ({
        ...item,
        _score: scoreShow(item, {
          query,
          genre,
          network,
          sourceYear,
          sourceRating,
          sourceShowId,
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
