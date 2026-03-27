const TVDB_BASE_URL = "https://api4.thetvdb.com/v4";

let cachedToken = null;
let cachedTokenExpiresAt = 0;

async function readJsonSafe(response) {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

export async function getTvdbToken() {
  const now = Date.now();

  if (cachedToken && now < cachedTokenExpiresAt) {
    return cachedToken;
  }

  const apikey = process.env.TVDB_API_KEY;
  const pin = process.env.TVDB_PIN;

  if (!apikey) {
    throw new Error("Missing TVDB_API_KEY");
  }

  const response = await fetch(`${TVDB_BASE_URL}/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      apikey,
      pin,
    }),
  });

  const data = await readJsonSafe(response);

  if (!response.ok || !data?.data?.token) {
    throw new Error(data?.message || "TVDB login failed");
  }

  cachedToken = data.data.token;
  cachedTokenExpiresAt = now + 23 * 60 * 60 * 1000;

  return cachedToken;
}

export async function tvdbFetch(path, searchParams = {}) {
  const token = await getTvdbToken();

  const url = new URL(`${TVDB_BASE_URL}${path}`);

  Object.entries(searchParams).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  });

  const response = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
  });

  const data = await readJsonSafe(response);

  if (!response.ok) {
    throw new Error(data?.message || `TVDB request failed: ${response.status}`);
  }

  return data;
}
