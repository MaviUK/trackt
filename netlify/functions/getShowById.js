function extractEnglishTranslationValue(translations, key) {
  if (!translations) return null;

  const candidateBuckets = [
    translations?.eng,
    translations?.en,
    translations?.english,
    translations?.ENG,
    translations?.EN,
  ].filter(Boolean);

  for (const bucket of candidateBuckets) {
    if (bucket && typeof bucket === "object") {
      const value = bucket[key] ?? bucket?.[key?.toLowerCase?.() ?? key] ?? null;
      if (typeof value === "string" && value.trim()) return value.trim();
    }
  }

  const flatArrays = [
    Array.isArray(translations) ? translations : null,
    Array.isArray(translations?.translations) ? translations.translations : null,
    Array.isArray(translations?.overviewTranslations) ? translations.overviewTranslations : null,
    Array.isArray(translations?.nameTranslations) ? translations.nameTranslations : null,
  ].filter(Boolean);

  for (const arr of flatArrays) {
    for (const item of arr) {
      const lang = String(
        item?.language || item?.languageCode || item?.lang || item?.iso639_2 || item?.iso639_1 || ""
      ).trim().toLowerCase();
      if (!["eng", "en", "english"].includes(lang)) continue;

      const value = item?.[key] ?? item?.value ?? item?.text ?? item?.name ?? item?.overview ?? null;
      if (typeof value === "string" && value.trim()) return value.trim();
    }
  }

  return null;
}

function applyEnglishSeriesText(series) {
  if (!series || typeof series !== "object") return series;

  const englishName =
    extractEnglishTranslationValue(series?.translations, "name") ||
    extractEnglishTranslationValue(series?.nameTranslations, "name");
  const englishOverview =
    extractEnglishTranslationValue(series?.translations, "overview") ||
    extractEnglishTranslationValue(series?.overviewTranslations, "overview");

  return {
    ...series,
    english_name: englishName || null,
    english_overview: englishOverview || null,
    name: englishName || series?.name || null,
    overview: englishOverview || series?.overview || null,
  };
}

function applyEnglishEpisodeText(episode) {
  if (!episode || typeof episode !== "object") return episode;

  const englishName =
    extractEnglishTranslationValue(episode?.translations, "name") ||
    extractEnglishTranslationValue(episode?.nameTranslations, "name");
  const englishOverview =
    extractEnglishTranslationValue(episode?.translations, "overview") ||
    extractEnglishTranslationValue(episode?.overviewTranslations, "overview");

  return {
    ...episode,
    name: englishName || episode?.name || null,
    overview: englishOverview || episode?.overview || null,
  };
}

export async function handler(event) {
  try {
    const tvdbId = event.queryStringParameters?.tvdb_id;

    if (!tvdbId) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          message: "Missing tvdb_id",
        }),
      };
    }

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
      return {
        statusCode: 500,
        body: JSON.stringify({
          message: "TVDB login failed",
          details: loginData,
        }),
      };
    }

    const token = loginData?.data?.token;

    if (!token) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          message: "TVDB token missing after login",
        }),
      };
    }

    const showRes = await fetch(
      `https://api4.thetvdb.com/v4/series/${encodeURIComponent(tvdbId)}/extended?language=eng&meta=translations`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          "Accept-Language": "eng",
        },
      }
    );

    const showData = await showRes.json();

    if (!showRes.ok) {
      return {
        statusCode: showRes.status,
        body: JSON.stringify({
          message: "TVDB show details failed",
          details: showData,
        }),
      };
    }

    const series = applyEnglishSeriesText(showData?.data);

    if (!series) {
      return {
        statusCode: 404,
        body: JSON.stringify({
          message: "Show not found",
        }),
      };
    }

    const genres = Array.isArray(series?.genres)
      ? series.genres
          .map((genre) => genre?.name)
          .filter(Boolean)
      : [];

    const aliases = Array.isArray(series?.aliases)
      ? series.aliases.filter(Boolean)
      : [];

    const companies = Array.isArray(series?.companies) ? series.companies : [];
    const primaryCompany =
      companies.find((company) => company?.primaryCompanyType === 1) ||
      companies[0] ||
      null;

    const artworks = Array.isArray(series?.artworks) ? series.artworks : [];

    const poster =
      artworks.find((art) => art?.type === 2)?.image ||
      series?.image ||
      null;

    const banner =
      artworks.find((art) => art?.type === 1)?.image ||
      null;

    const backdrop =
      artworks.find((art) => art?.type === 3)?.image ||
      null;

    const payload = {
      tvdb_id: Number(series?.id) || null,
      slug: series?.slug ?? null,
      name: series?.english_name ?? series?.name ?? null,
      original_name: series?.originalName ?? null,
      overview: series?.english_overview ?? series?.overview ?? null,
      status:
        typeof series?.status === "object"
          ? series?.status?.name ?? null
          : series?.status ?? null,
      original_country: series?.originalCountry ?? null,
      original_language: series?.originalLanguage ?? null,
      first_aired: series?.firstAired ?? null,
      last_aired: series?.lastAired ?? null,
      next_aired: series?.nextAired ?? null,
      runtime_minutes: series?.averageRuntime ?? null,
      network: primaryCompany?.name ?? null,
      content_rating: series?.contentRatings?.[0]?.name ?? null,
      genres,
      aliases,
      poster_url: poster,
      backdrop_url: backdrop,
      banner_url: banner,
      external_ids: {},
    };

    return {
      statusCode: 200,
      body: JSON.stringify(payload),
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: "Unexpected error loading show",
        error: error.message,
      }),
    };
  }
}
