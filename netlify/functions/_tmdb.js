const TMDB_BASE_URL = "https://api.themoviedb.org/3";

export function buildTmdbImageUrl(path, size = "w342") {
  if (!path) return "";
  return `https://image.tmdb.org/t/p/${size}${path}`;
}

export async function tmdbFetch(path, searchParams = {}) {
  const token =
    process.env.TMDB_API_TOKEN ||
    process.env.TMDB_BEARER_TOKEN ||
    process.env.TMDB_READ_ACCESS_TOKEN;

  if (!token) {
    throw new Error(
      "Missing TMDB_API_TOKEN (or TMDB_BEARER_TOKEN / TMDB_READ_ACCESS_TOKEN)"
    );
  }

  const url = new URL(`${TMDB_BASE_URL}${path}`);

  Object.entries(searchParams).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  });

  const response = await fetch(url.toString(), {
    headers: {
      accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(
      data?.status_message ||
        data?.message ||
        `TMDB request failed: ${response.status}`
    );
  }

  return data;
}
