import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const nativeFetch = (...args) => fetch(...args);
let rankdWriteQueue = Promise.resolve();

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

function isRankdVoteSaveRequest(resource, options) {
  if (!isRankdPage()) return false;
  if (getRequestMethod(resource, options) !== "POST") return false;

  const decodedUrl = getDecodedUrl(resource);

  return (
    decodedUrl.includes("/rest/v1/user_show_rankings") ||
    decodedUrl.includes("/rest/v1/rpc/rankd_record_matchup_vote")
  );
}

function cloneResource(resource) {
  if (resource && typeof resource.clone === "function") return resource.clone();
  return resource;
}

function queueRankdWrite(resource, options) {
  const queuedResource = cloneResource(resource);
  const queuedOptions = options ? { ...options } : undefined;

  rankdWriteQueue = rankdWriteQueue
    .catch(() => null)
    .then(() => nativeFetch(queuedResource, queuedOptions))
    .then((response) => {
      if (!response.ok) {
        console.warn("Rankd background save returned an error:", response.status);
      }
      return response;
    })
    .catch((error) => {
      console.warn("Rankd background save failed:", error);
    });
}

function makeRankdSaveResponse(resource) {
  const decodedUrl = getDecodedUrl(resource);
  const body = decodedUrl.includes("/rest/v1/rpc/rankd_record_matchup_vote")
    ? "null"
    : "[]";

  return new Response(body, {
    status: 200,
    statusText: "OK",
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-range": "0-0/0",
    },
  });
}

async function burgrsFetch(resource, options) {
  if (!isRankdVoteSaveRequest(resource, options)) {
    return nativeFetch(resource, options);
  }

  queueRankdWrite(resource, options);
  return makeRankdSaveResponse(resource);
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: {
    fetch: burgrsFetch,
  },
});
