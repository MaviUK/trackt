import { supabase } from "./lib/supabase";

const GENERATED_ATTR = "data-generated-cover";
const GENERATED_KEY_ATTR = "data-generated-cover-key";
const MAX_SHOWS = 20;

let currentRouteKey = "";
let currentBackground = "";
let currentBackgroundSize = "";
let currentBackgroundPosition = "";
let currentBackgroundRepeat = "";
let currentLoadPromise = null;
let syncQueued = false;

function getProfileSlug() {
  const match = window.location.pathname.match(/^\/u\/([^/]+)\/?$/);
  return match ? decodeURIComponent(match[1]).replace(/^@/, "") : "";
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || "")
  );
}

function getCoverElement() {
  return document.querySelector(".creator-page .creator-cover");
}

function clearGeneratedCover(cover) {
  if (!cover || cover.getAttribute(GENERATED_ATTR) !== "true") return;

  cover.style.removeProperty("background-image");
  cover.style.removeProperty("background-size");
  cover.style.removeProperty("background-position");
  cover.style.removeProperty("background-repeat");
  cover.style.removeProperty("background-color");
  cover.classList.remove("creator-cover-generated");
  cover.removeAttribute(GENERATED_ATTR);
  cover.removeAttribute(GENERATED_KEY_ATTR);
}

function resetRoute(nextRouteKey) {
  const cover = getCoverElement();
  clearGeneratedCover(cover);

  currentRouteKey = nextRouteKey;
  currentBackground = "";
  currentBackgroundSize = "";
  currentBackgroundPosition = "";
  currentBackgroundRepeat = "";
  currentLoadPromise = null;
}

function hasUploadedCover(cover) {
  if (!cover) return false;

  const isGenerated = cover.getAttribute(GENERATED_ATTR) === "true";
  const inlineBackground = cover.style.backgroundImage || "";

  if (!isGenerated) return Boolean(inlineBackground && inlineBackground !== "none");

  if (currentBackground && inlineBackground !== currentBackground) {
    cover.classList.remove("creator-cover-generated");
    cover.removeAttribute(GENERATED_ATTR);
    cover.removeAttribute(GENERATED_KEY_ATTR);
    return Boolean(inlineBackground && inlineBackground !== "none");
  }

  return false;
}

function cssUrl(value) {
  const safe = String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"');
  return `url("${safe}")`;
}

function buildGeneratedBackground(imageUrls) {
  const overlays = [
    "linear-gradient(180deg, rgba(2, 6, 23, 0.08) 0%, rgba(2, 6, 23, 0.28) 48%, rgba(2, 6, 23, 0.82) 100%)",
    "radial-gradient(circle at 18% 10%, rgba(124, 58, 237, 0.34), transparent 38%)",
  ];

  const sizes = ["100% 100%", "100% 100%"];
  const positions = ["center", "center"];
  const repeats = ["no-repeat", "no-repeat"];

  imageUrls.forEach((url, index) => {
    const column = index % 5;
    const row = Math.floor(index / 5);
    const xPositions = ["0%", "25%", "50%", "75%", "100%"];
    const yPositions = ["0%", "33.333%", "66.667%", "100%"];

    overlays.push(cssUrl(url));
    sizes.push("20% 25%");
    positions.push(`${xPositions[column]} ${yPositions[row]}`);
    repeats.push("no-repeat");
  });

  return {
    backgroundImage: overlays.join(", "),
    backgroundSize: sizes.join(", "),
    backgroundPosition: positions.join(", "),
    backgroundRepeat: repeats.join(", "),
  };
}

async function resolveProfileId(slug) {
  let result = await supabase
    .from("profiles")
    .select("id")
    .eq("username", slug)
    .maybeSingle();

  if (!result.data && !result.error && isUuid(slug)) {
    result = await supabase
      .from("profiles")
      .select("id")
      .eq("id", slug)
      .maybeSingle();
  }

  if (result.error) throw result.error;
  return result.data?.id || null;
}

async function loadTopShowImages(slug, expectedRouteKey) {
  const profileId = await resolveProfileId(slug);
  if (!profileId || currentRouteKey !== expectedRouteKey) return [];

  const { data: rankingRows, error: rankingError } = await supabase
    .from("user_show_rankings")
    .select("show_id, ladder_position")
    .eq("user_id", profileId)
    .not("ladder_position", "is", null)
    .order("ladder_position", { ascending: true })
    .limit(MAX_SHOWS);

  if (rankingError) throw rankingError;

  const showIds = (rankingRows || []).map((row) => row.show_id).filter(Boolean);
  if (!showIds.length) return [];

  const { data: showRows, error: showsError } = await supabase
    .from("shows")
    .select("id, poster_url, backdrop_url")
    .in("id", showIds);

  if (showsError) throw showsError;

  const showMap = new Map(
    (showRows || []).map((show) => [String(show.id), show])
  );

  return showIds
    .map((showId) => showMap.get(String(showId)))
    .map((show) => show?.backdrop_url || show?.poster_url || "")
    .filter(Boolean)
    .slice(0, MAX_SHOWS);
}

function applyGeneratedCover(cover, routeKey, imageUrls) {
  if (!cover || !imageUrls.length || hasUploadedCover(cover)) return;

  const generated = buildGeneratedBackground(imageUrls);
  currentBackground = generated.backgroundImage;
  currentBackgroundSize = generated.backgroundSize;
  currentBackgroundPosition = generated.backgroundPosition;
  currentBackgroundRepeat = generated.backgroundRepeat;

  cover.style.backgroundImage = currentBackground;
  cover.style.backgroundSize = currentBackgroundSize;
  cover.style.backgroundPosition = currentBackgroundPosition;
  cover.style.backgroundRepeat = currentBackgroundRepeat;
  cover.style.backgroundColor = "#020617";
  cover.classList.add("creator-cover-generated");
  cover.setAttribute(GENERATED_ATTR, "true");
  cover.setAttribute(GENERATED_KEY_ATTR, routeKey);
}

function restoreGeneratedCoverIfNeeded(cover) {
  if (!cover || cover.getAttribute(GENERATED_ATTR) !== "true") return;
  if (!currentBackground) return;

  if (!cover.style.backgroundImage || cover.style.backgroundImage === "none") {
    cover.style.backgroundImage = currentBackground;
    cover.style.backgroundSize = currentBackgroundSize;
    cover.style.backgroundPosition = currentBackgroundPosition;
    cover.style.backgroundRepeat = currentBackgroundRepeat;
    cover.style.backgroundColor = "#020617";
  }
}

function syncGeneratedBanner() {
  const slug = getProfileSlug();
  const nextRouteKey = slug ? `profile:${slug}` : "";

  if (nextRouteKey !== currentRouteKey) resetRoute(nextRouteKey);
  if (!slug) return;

  const cover = getCoverElement();
  if (!cover) return;

  if (hasUploadedCover(cover)) {
    cover.classList.remove("creator-cover-generated");
    cover.removeAttribute(GENERATED_ATTR);
    cover.removeAttribute(GENERATED_KEY_ATTR);
    return;
  }

  if (
    cover.getAttribute(GENERATED_ATTR) === "true" &&
    cover.getAttribute(GENERATED_KEY_ATTR) === nextRouteKey
  ) {
    restoreGeneratedCoverIfNeeded(cover);
    return;
  }

  if (currentLoadPromise) return;

  currentLoadPromise = loadTopShowImages(slug, nextRouteKey)
    .then((imageUrls) => {
      if (currentRouteKey !== nextRouteKey) return;
      applyGeneratedCover(getCoverElement(), nextRouteKey, imageUrls);
    })
    .catch((error) => {
      console.warn("Failed generating creator banner from ranked shows:", error);
    })
    .finally(() => {
      currentLoadPromise = null;
    });
}

function queueGeneratedBannerSync() {
  if (syncQueued) return;
  syncQueued = true;

  window.requestAnimationFrame(() => {
    syncQueued = false;
    syncGeneratedBanner();
  });
}

if (typeof window !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", queueGeneratedBannerSync, {
      once: true,
    });
  } else {
    queueGeneratedBannerSync();
  }

  new MutationObserver(queueGeneratedBannerSync).observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["style", "class"],
  });

  window.addEventListener("popstate", queueGeneratedBannerSync);
  window.addEventListener("pageshow", queueGeneratedBannerSync);
}
