import { supabase } from "./lib/supabase";

const BANNER_TAGLINE_ATTR = "data-creator-banner-tagline";
const SOCIAL_LINKS_ATTR = "data-creator-social-links";
const ABOUT_TEXT_ATTR = "data-creator-about-text";
const ABOUT_CARD_MOVED_CLASS = "creator-about-card-moved";
const ABOUT_MAX_LENGTH = 160;

let routeKey = "";
let profileData = null;
let loadingPromise = null;
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

function safeExternalUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function resetForRoute(nextRouteKey) {
  routeKey = nextRouteKey;
  profileData = null;
  loadingPromise = null;
}

async function loadProfileHeaderData(slug, expectedRouteKey) {
  const fields = `
    id,
    creator_tagline,
    creator_bio,
    instagram_url,
    x_url,
    tiktok_url,
    youtube_url,
    website_url
  `;

  let result = await supabase
    .from("profiles")
    .select(fields)
    .eq("username", slug)
    .maybeSingle();

  if (!result.data && !result.error && isUuid(slug)) {
    result = await supabase
      .from("profiles")
      .select(fields)
      .eq("id", slug)
      .maybeSingle();
  }

  if (result.error) throw result.error;
  if (routeKey !== expectedRouteKey) return;

  profileData = result.data || null;
}

function iconSvg(type) {
  const icons = {
    instagram: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" stroke-width="2"/>
        <circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="2"/>
        <circle cx="17.4" cy="6.7" r="1.1" fill="currentColor"/>
      </svg>
    `,
    x: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 4l14 16M19 4 5 20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
      </svg>
    `,
    tiktok: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M14 4v10.2a4.4 4.4 0 1 1-3.4-4.3" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M14 4c.8 2.6 2.4 4 5 4.4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
      </svg>
    `,
    youtube: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M21 12c0-2.2-.2-4-.5-5-.2-.8-.8-1.4-1.6-1.6C17.5 5 14.7 5 12 5s-5.5 0-6.9.4C4.3 5.6 3.7 6.2 3.5 7 3.2 8 3 9.8 3 12s.2 4 .5 5c.2.8.8 1.4 1.6 1.6 1.4.4 4.2.4 6.9.4s5.5 0 6.9-.4c.8-.2 1.4-.8 1.6-1.6.3-1 .5-2.8.5-5Z" fill="none" stroke="currentColor" stroke-width="1.8"/>
        <path d="m10 9 5 3-5 3V9Z" fill="currentColor"/>
      </svg>
    `,
    website: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/>
        <path d="M3.5 12h17M12 3c2.2 2.4 3.2 5.4 3.2 9S14.2 18.6 12 21M12 3C9.8 5.4 8.8 8.4 8.8 12S9.8 18.6 12 21" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
      </svg>
    `,
  };

  return icons[type] || icons.website;
}

function ensureBannerTagline() {
  const cover = document.querySelector(".creator-page .creator-cover");
  if (!cover) return;

  let tagline = cover.querySelector(`[${BANNER_TAGLINE_ATTR}]`);
  const text = String(profileData?.creator_tagline || "").trim();

  if (!text) {
    tagline?.remove();
    return;
  }

  if (!tagline) {
    tagline = document.createElement("p");
    tagline.className = "creator-banner-tagline-overlay";
    tagline.setAttribute(BANNER_TAGLINE_ATTR, "true");
    cover.appendChild(tagline);
  }

  if (tagline.textContent !== text) tagline.textContent = text;
}

function ensureSocialLinks() {
  const handle = document.querySelector(".creator-page .creator-handle");
  const heroContent = document.querySelector(".creator-page .creator-hero-content");
  if (!heroContent) return null;

  let row = heroContent.querySelector(`[${SOCIAL_LINKS_ATTR}]`);

  const links = [
    ["instagram", "Instagram", safeExternalUrl(profileData?.instagram_url)],
    ["x", "X / Twitter", safeExternalUrl(profileData?.x_url)],
    ["tiktok", "TikTok", safeExternalUrl(profileData?.tiktok_url)],
    ["youtube", "YouTube", safeExternalUrl(profileData?.youtube_url)],
    ["website", "Website", safeExternalUrl(profileData?.website_url)],
  ].filter(([, , href]) => Boolean(href));

  if (!links.length) {
    row?.remove();
    return null;
  }

  if (!row) {
    row = document.createElement("div");
    row.className = "creator-social-links";
    row.setAttribute(SOCIAL_LINKS_ATTR, "true");

    if (handle) handle.insertAdjacentElement("afterend", row);
    else heroContent.querySelector("h1")?.insertAdjacentElement("afterend", row);
  }

  const signature = JSON.stringify(links);
  if (row.dataset.signature !== signature) {
    row.replaceChildren();
    row.dataset.signature = signature;

    links.forEach(([type, label, href]) => {
      const link = document.createElement("a");
      link.className = `creator-social-link creator-social-link-${type}`;
      link.href = href;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.setAttribute("aria-label", label);
      link.title = label;
      link.innerHTML = iconSvg(type);
      row.appendChild(link);
    });
  }

  return row;
}

function markOriginalAboutCardMoved() {
  document.querySelectorAll(".creator-page > .creator-card").forEach((card) => {
    const heading = card.querySelector(":scope > .creator-section-head h2");
    if (heading?.textContent?.trim().toLowerCase() === "about") {
      card.classList.add(ABOUT_CARD_MOVED_CLASS);
    }
  });
}

function ensureAboutText(socialRow) {
  const heroContent = document.querySelector(".creator-page .creator-hero-content");
  const handle = document.querySelector(".creator-page .creator-handle");
  if (!heroContent) return;

  const text = String(profileData?.creator_bio || "")
    .trim()
    .slice(0, ABOUT_MAX_LENGTH);

  let about = heroContent.querySelector(`[${ABOUT_TEXT_ATTR}]`);

  if (!text) {
    about?.remove();
    markOriginalAboutCardMoved();
    return;
  }

  if (!about) {
    about = document.createElement("p");
    about.className = "creator-about-inline";
    about.setAttribute(ABOUT_TEXT_ATTR, "true");
  }

  const anchor = socialRow || handle || heroContent.querySelector("h1");
  if (anchor && about.previousElementSibling !== anchor) {
    anchor.insertAdjacentElement("afterend", about);
  }

  if (about.textContent !== text) about.textContent = text;
  markOriginalAboutCardMoved();
}

function renderProfileHeader() {
  if (!profileData) return;
  ensureBannerTagline();
  const socialRow = ensureSocialLinks();
  ensureAboutText(socialRow);
}

function syncProfileHeaderLayout() {
  const slug = getProfileSlug();
  const nextRouteKey = slug ? `profile:${slug}` : "";

  if (nextRouteKey !== routeKey) resetForRoute(nextRouteKey);
  if (!slug) return;

  if (profileData) {
    renderProfileHeader();
    return;
  }

  if (loadingPromise) return;

  loadingPromise = loadProfileHeaderData(slug, nextRouteKey)
    .then(() => {
      if (routeKey === nextRouteKey) renderProfileHeader();
    })
    .catch((error) => {
      console.warn("Failed loading creator header links:", error);
    })
    .finally(() => {
      loadingPromise = null;
    });
}

function queueProfileHeaderSync() {
  if (syncQueued) return;
  syncQueued = true;

  window.requestAnimationFrame(() => {
    syncQueued = false;
    syncProfileHeaderLayout();
  });
}

if (typeof window !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", queueProfileHeaderSync, {
      once: true,
    });
  } else {
    queueProfileHeaderSync();
  }

  new MutationObserver(queueProfileHeaderSync).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  window.addEventListener("popstate", queueProfileHeaderSync);
  window.addEventListener("pageshow", queueProfileHeaderSync);
}
