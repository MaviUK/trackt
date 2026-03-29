const TVDB_BASE = "https://api4.thetvdb.com/v4";

let cachedToken = null;
let tokenExpiry = 0;

async function getTvdbToken() {
  if (cachedToken && Date.now() < tokenExpiry) {
    return cachedToken;
  }

  if (!process.env.TVDB_API_KEY) {
    throw new Error("Missing TVDB_API_KEY env var");
  }

  const res = await fetch(`${TVDB_BASE}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      apikey: process.env.TVDB_API_KEY,
      pin: process.env.TVDB_PIN || undefined,
    }),
  });

  const data = await res.json();

  if (!res.ok || !data?.data?.token) {
    console.error("TVDB login failed:", data);
    throw new Error("TVDB auth failed");
  }

  cachedToken = data.data.token;
  tokenExpiry = Date.now() + 60 * 60 * 1000;

  return cachedToken;
}

function normalize(str) {
  return String(str || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function scoreMatch(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 100;
  if (a.includes(b) || b.includes(a)) return 70;
  return 0;
}

function buildPosterUrl(posterPath) {
  return posterPath ? `https://image.tmdb.org/t/p/w500${posterPath}` : "";
}

async function searchTvdbShow(name, year) {
  try {
    const token = await getTvdbToken();

    const res = await fetch(
      `${TVDB_BASE}/search?query=${encodeURIComponent(name)}&type=series`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      }
    );

    const json = await res.json();
    const results = json?.data || [];

    const targetName = normalize(name);

    let best = null;
    let bestScore = 0;

    for (const item of results) {
      const itemName = normalize(item?.name);
      const itemYear = item?.firstAired
        ? String(item.firstAired).slice(0, 4)
        : "";

      let score = scoreMatch(targetName, itemName);

      if (year && itemYear === year) {
        score += 30;
      }

      if (score > bestScore) {
        best = item;
        bestScore = score;
      }
    }

    if (bestScore < 70) return null;

    return best;
  } catch (err) {
    console.error("TVDB search failed:", err);
    return null;
  }
}

export async function enrichShowsWithMappings(shows = []) {
  if (!Array.isArray(shows) || shows.length === 0) {
    return [];
  }

  const results = [];

  for (const show of shows) {
    try {
      const year = show?.first_air_date
        ? String(show.first_air_date).slice(0, 4)
        : null;

      const match = await searchTvdbShow(
        show?.name || show?.title || show?.show_name || "",
        year
      );

      const posterPath = show?.poster_path || "";
      const posterUrl =
        show?.poster_url ||
        show?.posterUrl ||
        show?.image_url ||
        show?.image ||
        buildPosterUrl(posterPath);

      results.push({
        ...show,
        id: show?.id ?? null,
        tmdb_id: show?.tmdb_id ?? show?.id ?? null,
        name: show?.name || show?.title || show?.show_name || "",
        first_air_date:
          show?.first_air_date || show?.firstAired || show?.first_aired || "",
        overview: show?.overview || "",
        poster_path: posterPath,
        poster_url: posterUrl,
        posterUrl: posterUrl,
        image_url: posterUrl,
        image: posterUrl,
        tvdb_id: match?.tvdb_id ?? match?.id ?? null,
        mapping_status: match ? "matched" : "no_match",
        mapping_confidence: match ? 1 : 0,
        source: "tmdb",
      });
    } catch (err) {
      console.error("Mapping error:", err);

      const posterPath = show?.poster_path || "";
      const posterUrl =
        show?.poster_url ||
        show?.posterUrl ||
        show?.image_url ||
        show?.image ||
        buildPosterUrl(posterPath);

      results.push({
        ...show,
        id: show?.id ?? null,
        tmdb_id: show?.tmdb_id ?? show?.id ?? null,
        name: show?.name || show?.title || show?.show_name || "",
        first_air_date:
          show?.first_air_date || show?.firstAired || show?.first_aired || "",
        overview: show?.overview || "",
        poster_path: posterPath,
        poster_url: posterUrl,
        posterUrl: posterUrl,
        image_url: posterUrl,
        image: posterUrl,
        tvdb_id: null,
        mapping_status: "error",
        mapping_confidence: 0,
        source: "tmdb",
      });
    }
  }

  return results;
}
