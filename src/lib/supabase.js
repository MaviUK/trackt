import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const RANKD_HISTORY_FRONTLOAD_REQUESTS = 2;
const RANKD_HISTORY_CACHE_PREFIX = "rankd-history-cache:";
const RANKD_HISTORY_CACHE_TTL_MS = 1000 * 60 * 10;

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

function isRankdHistoryRequest(resource, options) {
  if (!isRankdPage()) return false;
  if (getRequestMethod(resource, options) !== "GET") return false;

  const rawUrl = getRequestUrl(resource);
  if (!rawUrl) return false;

  const decodedUrl = decodeURIComponent(rawUrl);

  return (
    decodedUrl.includes("/rest/v1/rankd_matchups") &&
    decodedUrl.includes("select=*") &&
    decodedUrl.includes("show_a_id=in.(") &&
    decodedUrl.includes("show_b_id=in.(") &&
    !decodedUrl.includes("pair_key")
  );
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

function getHistoryCacheKey(resource) {
  return `${RANKD_HISTORY_CACHE_PREFIX}${getRequestUrl(resource)}`;
}

function getCachedHistoryResponse(resource) {
  if (typeof sessionStorage === "undefined") return null;

  try {
    const raw = sessionStorage.getItem(getHistoryCacheKey(resource));
    if (!raw) return null;

    const cached = JSON.parse(raw);
    if (!cached?.body || !cached?.createdAt) return null;

    if (Date.now() - cached.createdAt > RANKD_HISTORY_CACHE_TTL_MS) {
      sessionStorage.removeItem(getHistoryCacheKey(resource));
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
    console.warn("Rankd history cache read failed:", error);
    return null;
  }
}

async function cacheHistoryResponse(resource, response) {
  if (typeof sessionStorage === "undefined") return;
  if (!response?.ok) return;

  try {
    const body = await response.clone().text();
    sessionStorage.setItem(
      getHistoryCacheKey(resource),
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
    console.warn("Rankd history cache write failed:", error);
  }
}

function fetchRankdHistoryInBackground(resource, options) {
  nativeFetch(resource, options)
    .then((response) => cacheHistoryResponse(resource, response))
    .catch((error) => {
      console.warn("Rankd background matchup history load failed:", error);
    });
}

async function burgrsFetch(resource, options) {
  if (!isRankdHistoryRequest(resource, options)) {
    return nativeFetch(resource, options);
  }

  const cached = getCachedHistoryResponse(resource);
  if (cached) return cached;

  resetRankdHistoryCounterIfNeeded();
  rankdHistoryRequestCount += 1;

  if (rankdHistoryRequestCount <= RANKD_HISTORY_FRONTLOAD_REQUESTS) {
    const response = await nativeFetch(resource, options);
    await cacheHistoryResponse(resource, response);
    return response;
  }

  fetchRankdHistoryInBackground(resource, options);
  return makeEmptyJsonResponse();
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: {
    fetch: burgrsFetch,
  },
});
