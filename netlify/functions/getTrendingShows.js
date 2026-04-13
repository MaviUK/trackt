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
    const res = await fetch(
      "https://api.themoviedb.org/3/trending/tv/week?language=en-US",
      {
        headers: {
          accept: "application/json",
          Authorization: `Bearer ${process.env.TMDB_BEARER_TOKEN}`,
        },
      }
    );

    const json = await res.json();

    if (!res.ok) {
      return {
        statusCode: res.status,
        body: JSON.stringify(json),
      };
    }

    const shows = (json.results || []).map((show) => ({
      tmdb_id: show.id,
      name: show.name,
      image: show.poster_path
        ? `https://image.tmdb.org/t/p/w500${show.poster_path}`
        : null,
      overview: show.overview || "",
      year: show.first_air_date ? show.first_air_date.slice(0, 4) : null,
    }));

    return {
      statusCode: 200,
      body: JSON.stringify({ shows }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ message: error.message }),
    };
  }
}
