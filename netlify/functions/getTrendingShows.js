import { tvdbFetch } from "./_tvdb.js";

function pickImage(series) {
  if (!series || typeof series !== "object") return null;

  if (series.image) return series.image;
  if (series.image_url) return series.image_url;
  if (series.thumbnail) return series.thumbnail;

  if (Array.isArray(series.artworks)) {
    const poster =
      series.artworks.find((art) => art?.type === 2)?.image ||
      series.artworks.find((art) => art?.image)?.image ||
      null;

    if (poster) return poster;
  }

  return null;
}

function normalizeShow(series) {
  return {
    id: series?.id ?? null,
    name: series?.name ?? series?.seriesName ?? "Unknown title",
    image: pickImage(series),
    score: Number(series?.score) || 0,
    overview: series?.overview ?? "",
    slug: series?.slug ?? null,
    year:
      series?.year ??
      (series?.firstAired ? new Date(series.firstAired).getFullYear() : null),
  };
}

export async function handler() {
  try {
    const responses = await Promise.allSettled([
      tvdbFetch("/series/filter", {
        sort: "score",
        sortType: "desc",
        page: 0,
      }),
      tvdbFetch("/series/filter", {
        sort: "score",
        sortType: "desc",
        page: 1,
      }),
    ]);

    const rawShows = responses
      .filter((result) => result.status === "fulfilled")
      .flatMap((result) => result.value?.data || []);

    const deduped = [];
    const seen = new Set();

    for (const series of rawShows) {
      const normalized = normalizeShow(series);

      if (!normalized.id || seen.has(String(normalized.id))) continue;

      seen.add(String(normalized.id));
      deduped.push(normalized);
    }

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
      body: JSON.stringify({
        shows: deduped.slice(0, 30),
      }),
    };
  } catch (error) {
    console.error("getTrendingShows error:", error);

    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
      body: JSON.stringify({
        message: "Failed to load trending shows",
        error: error.message,
      }),
    };
  }
}
