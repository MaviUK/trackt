const CACHE_PREFIX = "episodes_cache_v2_";
const CACHE_TTL_MS = 1000 * 60 * 60 * 6;

export async function getCachedEpisodes(tvdbId) {
  const cacheKey = `${CACHE_PREFIX}${tvdbId}`;

  try {
    const cached = JSON.parse(localStorage.getItem(cacheKey) || "null");

    if (cached && cached.fetchedAt && Array.isArray(cached.episodes)) {
      const age = Date.now() - new Date(cached.fetchedAt).getTime();

      if (age < CACHE_TTL_MS) {
        return cached.episodes;
      }
    }
  } catch (error) {
    console.error("Failed reading episode cache:", error);
  }

  const res = await fetch(`/.netlify/functions/getEpisodes?tvdb_id=${tvdbId}`);
  const episodes = await res.json();

  localStorage.setItem(
    cacheKey,
    JSON.stringify({
      fetchedAt: new Date().toISOString(),
      episodes: episodes || [],
    })
  );

  return episodes || [];
}

export function clearEpisodesCache(tvdbId) {
  const cacheKey = `${CACHE_PREFIX}${tvdbId}`;
  localStorage.removeItem(cacheKey);
}

export function clearAllEpisodesCache() {
  Object.keys(localStorage)
    .filter((key) => key.startsWith(CACHE_PREFIX))
    .forEach((key) => localStorage.removeItem(key));
}
