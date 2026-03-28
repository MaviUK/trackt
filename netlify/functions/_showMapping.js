import fetch from "node-fetch";

const TVDB_BASE = "https://api4.thetvdb.com/v4";

let cachedToken = null;
let tokenExpiry = 0;

async function getTvdbToken() {
  if (cachedToken && Date.now() < tokenExpiry) {
    return cachedToken;
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

  if (!data?.data?.token) {
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

async function searchTvdbShow(name, year) {
  const token = await getTvdbToken();

  const res = await fetch(
    `${TVDB_BASE}/search?query=${encodeURIComponent(name)}&type=series`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
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
}

export async function enrichShowsWithMappings(shows = []) {
  const results = [];

  for (const show of shows) {
    try {
      const year = show?.first_air_date
        ? String(show.first_air_date).slice(0, 4)
        : null;

      const match = await searchTvdbShow(show.name, year);

      if (match?.tvdb_id) {
        results.push({
          ...show,
          tvdb_id: match.tvdb_id,
          mapping_status: "matched",
          mapping_confidence: 1,
        });
      } else {
        results.push({
          ...show,
          tvdb_id: null,
          mapping_status: "no_match",
          mapping_confidence: 0,
        });
      }
    } catch (err) {
      console.error("Mapping error:", err);

      results.push({
        ...show,
        tvdb_id: null,
        mapping_status: "error",
        mapping_confidence: 0,
      });
    }
  }

  return results;
}
