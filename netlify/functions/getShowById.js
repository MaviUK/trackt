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
      `https://api4.thetvdb.com/v4/series/${encodeURIComponent(tvdbId)}/extended`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
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

    const series = showData?.data;

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
      name: pickBestTitle(series?.name, series?.seriesName, series?.series_name, series?.title),
      original_name: series?.originalName ?? null,
      overview: pickBestOverview(series?.overview, series?.description, series?.plot),
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
function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function looksLikeOverview(text) {
  const value = cleanText(text);
  if (!value) return false;
  if (value.length > 120) return true;
  if (value.includes("\n")) return true;
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length > 14) return true;
  if (/[.!?]$/.test(value) && words.length > 6) return true;
  if (/[,;:]/.test(value) && words.length > 10) return true;
  return false;
}

function pickBestTitle(...candidates) {
  const cleaned = candidates.map(cleanText).filter(Boolean);
  const strict = cleaned.filter((value) => !looksLikeOverview(value));
  return strict[0] || cleaned[0] || null;
}

function pickBestOverview(...candidates) {
  const cleaned = candidates.map(cleanText).filter(Boolean);
  return cleaned.find((value) => value.length > 20) || cleaned[0] || null;
}

