const TVDB_BASE_URL = "https://api4.thetvdb.com/v4";

let cachedToken = null;
let tokenExpiry = 0;

async function getToken() {
  const now = Date.now();

  if (cachedToken && now < tokenExpiry) return cachedToken;

  const res = await fetch(`${TVDB_BASE_URL}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      apikey: process.env.TVDB_API_KEY,
      pin: process.env.TVDB_PIN,
    }),
  });

  const json = await res.json();

  cachedToken = json.data.token;
  tokenExpiry = now + 23 * 60 * 60 * 1000;

  return cachedToken;
}

export async function handler() {
  try {
    const token = await getToken();

    // Using filter sorted by score as "trending"
    const res = await fetch(
      `${TVDB_BASE_URL}/series/filter?sort=score&sortType=desc&page=0`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    const json = await res.json();

    const shows = (json.data || []).slice(0, 20).map((s) => ({
      id: s.id,
      name: s.name,
      image: s.image || s.image_url,
      score: s.score,
    }));

    return {
      statusCode: 200,
      body: JSON.stringify(shows),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
}
