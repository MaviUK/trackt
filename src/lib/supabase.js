import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Rank'd can become very slow for users with lots of shows because it tries to
// load every eligible-season check and every historical matchup before drawing
// the first matchup. These requests are useful, but they are not required for
// the first screen. Return cached data when available, otherwise let Rank'd open
// immediately and warm the cache in the background.
const RANKD_HISTORY_FRONTLOAD_REQUESTS = 0;
const RANKD_CACHE_PREFIX = "rankd-fast-cache:";
const RANKD_CACHE_TTL_MS = 1000 * 60 * 10;

let rankdHistoryRequestCount = 0;
let rankdHistoryWindowStartedAt = 0;
let rankdHistoryPath = "";

const nativeFetch = (...args) => fetch(...args);

function getRequestUrl(resource) {
  if (typeof resource === "string") return resource;
  if (resource instanceof URL) return resource.toString();
  return resource?.url || "";
}

function getRequestMethod(resource, options) {
  return String(options?.method || resource?.method || "GET").toUpperCase();
}

function isRankdPage() {
  if (typeof window === "undefined") return false;
  return window.location.pathname.startsWith("/rankd");
}

function getDecodedUrl(resource) {
  const rawUrl = getRequestUrl(resource);
  if (!rawUrl) return "";

  try {
    return decodeURIComponent(rawUrl);
  } catch {
    return rawUrl;
  }
}

function isRankdHistoryRequest(resource, options) {
  if (!isRankdPage()) return false;
  if (getRequestMethod(resource, options) !== "GET") return false;

  const decodedUrl = getDecodedUrl(resource);

  return (
    decodedUrl.includes("/rest/v1/rankd_matchups") &&
    decodedUrl.includes("select=*") &&
    decodedUrl.includes("show_a_id=in.(") &&
    decodedUrl.includes("show_b_id=in.(") &&
    !decodedUrl.includes("pair_key")
  );
}

function isRankdEligibilityRequest(resource, options) {
  if (!isRankdPage()) return false;
  if (getRequestMethod(resource, options) !== "GET") return false;

  const decodedUrl = getDecodedUrl(resource);

  const isEpisodeBulkCheck =
    decodedUrl.includes("/rest/v1/episodes") &&
    decodedUrl.includes("show_id=in.(") &&
    decodedUrl.includes("season_number=gt.0");

  const isWatchedBulkCheck =
    decodedUrl.includes("/rest/v1/watched_episodes") &&
    decodedUrl.includes("episode_id=in.(") &&
    decodedUrl.includes("user_id=eq.");

  return isEpisodeBulkCheck || isWatchedBulkCheck;
}

function isRankdFastBackgroundRequest(resource, options) {
  return isRankdHistoryRequest(resource, options) || isRankdEligibilityRequest(resource, options);
}

function resetRankdHistoryCounterIfNeeded() {
  if (typeof window === "undefined") return;

  const now = Date.now();
  const path = window.location.pathname;

  if (
    rankdHistoryPath !== path ||
    !rankdHistoryWindowStartedAt ||
    now - rankdHistoryWindowStartedAt > 30000
  ) {
    rankdHistoryPath = path;
    rankdHistoryWindowStartedAt = now;
    rankdHistoryRequestCount = 0;
  }
}

function makeEmptyJsonResponse() {
  return new Response("[]", {
    status: 200,
    statusText: "OK",
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-range": "0-0/0",
    },
  });
}

function getCacheKey(resource) {
  return `${RANKD_CACHE_PREFIX}${getRequestUrl(resource)}`;
}

function getCachedResponse(resource) {
  if (typeof sessionStorage === "undefined") return null;

  try {
    const raw = sessionStorage.getItem(getCacheKey(resource));
    if (!raw) return null;

    const cached = JSON.parse(raw);
    if (!cached?.body || !cached?.createdAt) return null;

    if (Date.now() - cached.createdAt > RANKD_CACHE_TTL_MS) {
      sessionStorage.removeItem(getCacheKey(resource));
      return null;
    }

    return new Response(cached.body, {
      status: cached.status || 200,
      statusText: cached.statusText || "OK",
      headers: cached.headers || {
        "content-type": "application/json; charset=utf-8",
      },
    });
  } catch (error) {
    console.warn("Rankd fast cache read failed:", error);
    return null;
  }
}

async function cacheResponse(resource, response) {
  if (typeof sessionStorage === "undefined") return;
  if (!response?.ok) return;

  try {
    const body = await response.clone().text();
    sessionStorage.setItem(
      getCacheKey(resource),
      JSON.stringify({
        createdAt: Date.now(),
        status: response.status,
        statusText: response.statusText,
        headers: {
          "content-type": response.headers.get("content-type") || "application/json; charset=utf-8",
          "content-range": response.headers.get("content-range") || "0-0/*",
        },
        body,
      })
    );
  } catch (error) {
    console.warn("Rankd fast cache write failed:", error);
  }
}

function fetchInBackground(resource, options, label = "Rankd background request") {
  nativeFetch(resource, options)
    .then((response) => cacheResponse(resource, response))
    .catch((error) => {
      console.warn(`${label} failed:`, error);
    });
}

async function burgrsFetch(resource, options) {
  if (!isRankdFastBackgroundRequest(resource, options)) {
    return nativeFetch(resource, options);
  }

  const cached = getCachedResponse(resource);
  if (cached) return cached;

  if (isRankdHistoryRequest(resource, options)) {
    resetRankdHistoryCounterIfNeeded();
    rankdHistoryRequestCount += 1;

    if (rankdHistoryRequestCount <= RANKD_HISTORY_FRONTLOAD_REQUESTS) {
      const response = await nativeFetch(resource, options);
      await cacheResponse(resource, response);
      return response;
    }
  }

  fetchInBackground(resource, options, "Rankd background preload");
  return makeEmptyJsonResponse();
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: {
    fetch: burgrsFetch,
  },
});
