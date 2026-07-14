const SMART_SHOW_LINKS_FLAG = "__burgrsSmartShowLinksInstalled";
const CREATOR_REVIEW_RATING_CLASS = "creator-review-rating-corner";
const REVIEW_TAB_VALUE = "reviews";
const REVIEWER_QUERY_KEY = "reviewer";

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

function addUrlSuffix(destination, sourceUrl) {
  if (!destination) return destination;
  return `${destination}${sourceUrl.search || ""}${sourceUrl.hash || ""}`;
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
    card.style.cursor = "pointer";

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

function getRequestedCommunityTab() {
  const pathname = window.location.pathname;
  if (!/^\/(?:show|my-shows)\//i.test(pathname)) return "";

  const params = new URLSearchParams(window.location.search);
  return String(params.get("tab") || params.get("community") || "").toLowerCase();
}

function getRequestedReviewer() {
  const params = new URLSearchParams(window.location.search);
  return String(params.get(REVIEWER_QUERY_KEY) || "").trim();
}

function isVisible(element) {
  if (!element) return false;
  const style = window.getComputedStyle(element);
  return style.display !== "none" && style.visibility !== "hidden";
}

function findCommunityTabButton(tabName) {
  if (tabName === "reviews") {
    const portalButton = document.getElementById("burgrs-public-show-reviews-tab");
    if (isVisible(portalButton)) return portalButton;
  }

  if (tabName === "chatboard") {
    const portalButton = document.getElementById("burgrs-public-show-chatboard-tab");
    if (isVisible(portalButton)) return portalButton;
  }

  return Array.from(document.querySelectorAll(".msd-content-tab")).find(
    (button) =>
      isVisible(button) &&
      String(button.textContent || "").trim().toLowerCase() === tabName
  );
}

function scrollCommunitySectionIntoView(tabName) {
  const selector =
    tabName === "chatboard"
      ? ".msd-chatboard-section, #burgrs-show-community-portal"
      : ".msd-reviews-section, #burgrs-show-community-portal";

  const section = document.querySelector(selector);
  if (!section) return false;

  section.scrollIntoView({ behavior: "smooth", block: "start" });
  return true;
}

function getUsernameFromProfileHref(href) {
  if (!href) return "";

  try {
    const url = new URL(href, window.location.origin);
    const match = url.pathname.match(/^\/u\/([^/?#]+)\/?$/i);
    return match ? decodeURIComponent(match[1]).replace(/^@/, "").trim() : "";
  } catch {
    return "";
  }
}

function getReviewCardReviewer(reviewCard) {
  if (!reviewCard) return "";

  const profileLink = reviewCard.querySelector(
    '.following-creator-name-link[href], .following-avatar-link[href], .msd-review-username[href], .creator-review-username[href]'
  );
  const linkedUsername = getUsernameFromProfileHref(profileLink?.href);
  if (linkedUsername) return linkedUsername;

  if (reviewCard.classList.contains("creator-review-card")) {
    const currentProfileMatch = window.location.pathname.match(/^\/u\/([^/?#]+)\/?$/i);
    if (currentProfileMatch) {
      return decodeURIComponent(currentProfileMatch[1]).replace(/^@/, "").trim();
    }
  }

  return "";
}

function isFollowingReviewCard(card) {
  if (!card?.classList?.contains("following-card")) return false;
  const typeLabel = String(
    card.querySelector(".following-meta-type")?.textContent || ""
  )
    .trim()
    .toLowerCase();
  return typeLabel === "review";
}

function findReviewItemForReviewer(reviewer) {
  const normalizedReviewer = String(reviewer || "")
    .replace(/^@/, "")
    .trim()
    .toLowerCase();
  if (!normalizedReviewer) return null;

  const rootReviewItems = Array.from(
    document.querySelectorAll(".msd-review-list > .msd-review-item")
  );

  return rootReviewItems.find((item) => {
    const profileLink = item.querySelector(
      '.msd-review-username[href], .msd-review-avatar-link[href]'
    );
    const hrefUsername = getUsernameFromProfileHref(profileLink?.href).toLowerCase();
    if (hrefUsername && hrefUsername === normalizedReviewer) return true;

    const handle = String(item.querySelector(".msd-review-handle")?.textContent || "")
      .replace(/^@/, "")
      .trim()
      .toLowerCase();
    return Boolean(handle && handle === normalizedReviewer);
  });
}

function highlightAndScrollToReview(item) {
  if (!item) return false;

  document
    .querySelectorAll('[data-burgrs-target-review="true"]')
    .forEach((element) => {
      element.removeAttribute("data-burgrs-target-review");
      element.style.removeProperty("outline");
      element.style.removeProperty("outline-offset");
      element.style.removeProperty("border-radius");
      element.style.removeProperty("transition");
    });

  item.setAttribute("data-burgrs-target-review", "true");
  item.style.outline = "2px solid rgba(167, 139, 250, 0.9)";
  item.style.outlineOffset = "5px";
  item.style.borderRadius = "18px";
  item.style.transition = "outline-color 220ms ease";
  item.scrollIntoView({ behavior: "smooth", block: "center" });

  window.setTimeout(() => {
    if (item.getAttribute("data-burgrs-target-review") !== "true") return;
    item.style.outline = "2px solid transparent";
  }, 2600);

  return true;
}

function installRequestedReviewFocus() {
  let frameId = null;
  let retryTimer = null;
  let lastFocusedRequest = "";

  function attemptFocusReview() {
    const tabName = getRequestedCommunityTab();
    const reviewer = getRequestedReviewer();

    if (tabName !== "reviews" || !reviewer) {
      lastFocusedRequest = "";
      return;
    }

    const requestKey = `${window.location.pathname}${window.location.search}`;
    if (lastFocusedRequest === requestKey) return;

    const reviewItem = findReviewItemForReviewer(reviewer);
    if (!reviewItem) {
      window.clearTimeout(retryTimer);
      retryTimer = window.setTimeout(scheduleAttempt, 180);
      return;
    }

    if (highlightAndScrollToReview(reviewItem)) {
      lastFocusedRequest = requestKey;
    }
  }

  function scheduleAttempt() {
    if (frameId !== null) return;
    frameId = window.requestAnimationFrame(() => {
      frameId = null;
      attemptFocusReview();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scheduleAttempt, { once: true });
  } else {
    scheduleAttempt();
  }

  window.addEventListener("popstate", scheduleAttempt);

  const observer = new MutationObserver(scheduleAttempt);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
}

function installRequestedCommunityTabOpening() {
  let frameId = null;
  let retryTimer = null;
  let lastCompletedRequest = "";

  function attemptOpenRequestedTab() {
    const tabName = getRequestedCommunityTab();
    if (!["reviews", "chatboard"].includes(tabName)) {
      lastCompletedRequest = "";
      return;
    }

    const requestKey = `${window.location.pathname}${window.location.search}`;
    const sectionAlreadyVisible =
      tabName === "chatboard"
        ? Boolean(document.querySelector(".msd-chatboard-section"))
        : Boolean(document.querySelector(".msd-reviews-section"));

    if (lastCompletedRequest === requestKey && sectionAlreadyVisible) return;

    const button = findCommunityTabButton(tabName);
    if (!button) return;

    if (!button.classList.contains("is-active")) {
      button.click();
    }

    window.clearTimeout(retryTimer);
    retryTimer = window.setTimeout(() => {
      if (getRequestedReviewer() && tabName === "reviews") {
        lastCompletedRequest = requestKey;
        return;
      }

      if (scrollCommunitySectionIntoView(tabName)) {
        lastCompletedRequest = requestKey;
      }
    }, 120);
  }

  function scheduleAttempt() {
    if (frameId !== null) return;
    frameId = window.requestAnimationFrame(() => {
      frameId = null;
      attemptOpenRequestedTab();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scheduleAttempt, { once: true });
  } else {
    scheduleAttempt();
  }

  window.addEventListener("popstate", scheduleAttempt);

  const observer = new MutationObserver(scheduleAttempt);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class", "style"],
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
  installRequestedCommunityTabOpening();
  installRequestedReviewFocus();

  document.addEventListener(
    "click",
    async (event) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const creatorReviewCard = event.target?.closest?.(".creator-review-card");
      const followingCard = event.target?.closest?.(".following-card");
      const followingReviewCard = isFollowingReviewCard(followingCard)
        ? followingCard
        : null;
      const reviewCard = creatorReviewCard || followingReviewCard;

      let anchor = event.target?.closest?.("a[href]");

      if (
        !anchor &&
        reviewCard &&
        !event.target?.closest?.("button, input, textarea, select")
      ) {
        anchor = creatorReviewCard
          ? creatorReviewCard.querySelector(".creator-review-show[href]")
          : followingReviewCard.querySelector(".following-show-card[href]");
      }

      if (!anchor || anchor.hasAttribute("download")) return;
      if (anchor.target && anchor.target !== "_self") return;

      const url = new URL(anchor.href, window.location.origin);
      if (url.origin !== window.location.origin) return;
      if (!getShowRoute(url.pathname)) return;

      if (reviewCard) {
        url.searchParams.set("tab", REVIEW_TAB_VALUE);
        const reviewer = getReviewCardReviewer(reviewCard);
        if (reviewer) url.searchParams.set(REVIEWER_QUERY_KEY, reviewer);
      }

      event.preventDefault();
      event.stopPropagation();

      const originalDestination = `${url.pathname}${url.search}${url.hash}`;

      try {
        const savedDestination = await getSavedShowDestination(
          supabase,
          url.pathname
        );
        navigateWithinApp(
          savedDestination
            ? addUrlSuffix(savedDestination, url)
            : originalDestination
        );
      } catch (error) {
        console.warn("Failed resolving smart show link:", error);
        navigateWithinApp(originalDestination);
      }
    },
    true
  );
}
