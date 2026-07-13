const SMART_SHOW_LINKS_FLAG = "__burgrsSmartShowLinksInstalled";
const CREATOR_REVIEW_RATING_CLASS = "creator-review-rating-corner";

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || "")
  );
}

function getShowRoute(pathname) {
  const tmdbMatch = String(pathname || "").match(/^\/show\/tmdb\/(\d+)\/?$/i);
  if (tmdbMatch) {
    return { source: "tmdb", value: tmdbMatch[1] };
  }

  const showMatch = String(pathname || "").match(/^\/show\/([^/?#]+)\/?$/i);
  if (!showMatch) return null;

  return {
    source: isUuid(showMatch[1]) ? "database" : "tvdb",
    value: decodeURIComponent(showMatch[1]),
  };
}

function navigateWithinApp(destination) {
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (!destination || destination === current) return;

  window.history.pushState({}, "", destination);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

async function findDatabaseShow(supabase, route) {
  let query = supabase.from("shows").select("id, tvdb_id, tmdb_id");

  if (route.source === "database") {
    query = query.eq("id", route.value);
  } else if (route.source === "tmdb") {
    query = query.eq("tmdb_id", Number(route.value));
  } else {
    query = query.eq("tvdb_id", Number(route.value));
  }

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data || null;
}

async function getSavedShowDestination(supabase, pathname) {
  const route = getShowRoute(pathname);
  if (!route) return null;

  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData?.session?.user?.id;
  if (!userId) return null;

  const show = await findDatabaseShow(supabase, route);
  if (!show?.id) return null;

  const { data: savedShow, error: savedShowError } = await supabase
    .from("user_shows_new")
    .select("show_id, tmdb_id")
    .eq("user_id", userId)
    .eq("show_id", show.id)
    .maybeSingle();

  if (savedShowError) throw savedShowError;
  if (!savedShow) return null;

  if (show.tvdb_id) return `/my-shows/${show.tvdb_id}`;

  const tmdbId = savedShow.tmdb_id || show.tmdb_id;
  if (tmdbId) return `/my-shows/tmdb/${tmdbId}`;

  return null;
}

function positionCreatorReviewRatings(root = document) {
  const cards = root.matches?.(".creator-review-card")
    ? [root]
    : Array.from(root.querySelectorAll?.(".creator-review-card") || []);

  cards.forEach((card) => {
    const meta = card.querySelector(".creator-review-show > div > span");
    if (!meta) return;

    const metaText = String(meta.textContent || "").trim();
    const match = metaText.match(/^(.*?)(?:\s*[•·]\s*)(\d{1,3}%)$/);
    if (!match) return;

    const dateLabel = match[1].trim();
    const ratingLabel = match[2].trim();

    meta.textContent = dateLabel;
    card.style.position = "relative";

    const showLink = card.querySelector(".creator-review-show");
    if (showLink) showLink.style.paddingRight = "68px";

    let ratingBadge = card.querySelector(`.${CREATOR_REVIEW_RATING_CLASS}`);
    if (!ratingBadge) {
      ratingBadge = document.createElement("span");
      ratingBadge.className = CREATOR_REVIEW_RATING_CLASS;
      ratingBadge.setAttribute("aria-label", `User rating ${ratingLabel}`);
      Object.assign(ratingBadge.style, {
        position: "absolute",
        top: "12px",
        right: "12px",
        zIndex: "2",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth: "48px",
        height: "32px",
        padding: "0 10px",
        borderRadius: "999px",
        border: "1px solid rgba(196, 181, 253, 0.32)",
        background: "rgba(124, 58, 237, 0.24)",
        color: "#ddd6fe",
        fontSize: "14px",
        fontWeight: "950",
        lineHeight: "1",
        boxSizing: "border-box",
        boxShadow: "0 8px 20px rgba(0, 0, 0, 0.22)",
        pointerEvents: "none",
      });
      card.appendChild(ratingBadge);
    }

    ratingBadge.textContent = ratingLabel;
  });
}

function installCreatorReviewRatingPositioning() {
  const run = () => positionCreatorReviewRatings(document);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run, { once: true });
  } else {
    run();
  }

  let frameId = null;
  const observer = new MutationObserver(() => {
    if (frameId !== null) return;
    frameId = window.requestAnimationFrame(() => {
      frameId = null;
      run();
    });
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
}

export function installSmartShowLinks(supabase) {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  if (window[SMART_SHOW_LINKS_FLAG]) return;

  window[SMART_SHOW_LINKS_FLAG] = true;
  installCreatorReviewRatingPositioning();

  document.addEventListener(
    "click",
    async (event) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const anchor = event.target?.closest?.("a[href]");
      if (!anchor || anchor.hasAttribute("download")) return;
      if (anchor.target && anchor.target !== "_self") return;

      const url = new URL(anchor.href, window.location.origin);
      if (url.origin !== window.location.origin) return;
      if (!getShowRoute(url.pathname)) return;

      event.preventDefault();
      event.stopPropagation();

      const originalDestination = `${url.pathname}${url.search}${url.hash}`;

      try {
        const savedDestination = await getSavedShowDestination(
          supabase,
          url.pathname
        );
        navigateWithinApp(savedDestination || originalDestination);
      } catch (error) {
        console.warn("Failed resolving smart show link:", error);
        navigateWithinApp(originalDestination);
      }
    },
    true
  );
}
