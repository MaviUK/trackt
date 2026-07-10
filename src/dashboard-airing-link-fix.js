import { supabase } from "./lib/supabase";

const resolvedAiringLinks = new Map();

function isDashboardAiringLink(anchor) {
  if (!anchor?.matches?.("a.dashboard-episode-item")) return false;
  const href = anchor.getAttribute("href") || "";
  return href.startsWith("/my-shows/");
}

function looksLikeDatabaseUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    String(value || "")
  );
}

function getPathId(anchor) {
  const href = anchor.getAttribute("href") || "";
  return decodeURIComponent(href.replace(/^\/my-shows\//, "").split(/[?#]/)[0] || "");
}

function getShowName(anchor) {
  return anchor.querySelector(".dashboard-list-copy strong")?.textContent?.trim() || "";
}

function goTo(path) {
  if (!path) return;
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

async function resolveAiringShowLink(anchor) {
  const showName = getShowName(anchor);
  const pathId = getPathId(anchor);

  if (!looksLikeDatabaseUuid(pathId)) return anchor.getAttribute("href") || "";
  if (resolvedAiringLinks.has(pathId)) return resolvedAiringLinks.get(pathId);

  let query = supabase
    .from("shows")
    .select("id, tvdb_id, tmdb_id, name")
    .eq("id", pathId)
    .maybeSingle();

  let { data, error } = await query;

  if ((error || !data) && showName) {
    const fallback = await supabase
      .from("shows")
      .select("id, tvdb_id, tmdb_id, name")
      .eq("name", showName)
      .maybeSingle();

    data = fallback.data;
    error = fallback.error;
  }

  if (error || !data) return anchor.getAttribute("href") || "";

  const nextPath = data.tmdb_id
    ? `/my-shows/tmdb/${data.tmdb_id}`
    : data.tvdb_id
      ? `/my-shows/${data.tvdb_id}`
      : "";

  if (nextPath) resolvedAiringLinks.set(pathId, nextPath);
  return nextPath || anchor.getAttribute("href") || "";
}

if (typeof window !== "undefined") {
  document.addEventListener(
    "click",
    async (event) => {
      const anchor = event.target?.closest?.("a.dashboard-episode-item");
      if (!isDashboardAiringLink(anchor)) return;

      const pathId = getPathId(anchor);
      if (!looksLikeDatabaseUuid(pathId)) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();

      const nextPath = await resolveAiringShowLink(anchor);
      goTo(nextPath);
    },
    true
  );
}
