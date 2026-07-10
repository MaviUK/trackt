import { supabase } from "./lib/supabase";

function getParams() {
  return new URLSearchParams(window.location.search || "");
}

function isCreatorPage() {
  return window.location.pathname.startsWith("/u/");
}

function isShowPage() {
  return window.location.pathname.startsWith("/show/");
}

function text(value) {
  return String(value || "").trim();
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function clickListsTab() {
  const buttons = Array.from(document.querySelectorAll(".creator-stats-card button"));
  const listsButton = buttons.find((button) => button.textContent?.toLowerCase().includes("lists"));
  listsButton?.click();
}

function openSharedList() {
  if (!isCreatorPage()) return;

  const listId = getParams().get("list");
  if (!listId) return;

  clickListsTab();

  const run = () => {
    const cards = Array.from(document.querySelectorAll(".creator-list-card"));
    if (!cards.length) return false;

    let target = cards.find((card) => card.textContent?.includes(listId));
    if (!target) {
      target = cards.find((card) => card.querySelector(`[key='${CSS.escape(listId)}']`));
    }

    if (!target) {
      const indexMatch = cards.find((card) => card.innerHTML.includes(listId));
      target = indexMatch || cards[0];
    }

    if (!target) return false;

    const coverButton = target.querySelector(".creator-list-cover-button");
    if (coverButton && coverButton.getAttribute("aria-expanded") !== "true") {
      coverButton.click();
    }

    target.classList.add("burgrs-shared-list-highlight");
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => target.classList.remove("burgrs-shared-list-highlight"), 2600);
    return true;
  };

  window.setTimeout(() => {
    if (run()) return;
    window.setTimeout(run, 500);
    window.setTimeout(run, 1300);
  }, 350);
}

function getDisplayName(profile) {
  return (
    profile?.display_name ||
    profile?.full_name ||
    profile?.username ||
    "BURGRS user"
  );
}

async function loadReview(reviewId) {
  const { data, error } = await supabase
    .from("show_reviews")
    .select(`
      id,
      user_id,
      show_id,
      body,
      created_at,
      profiles:user_id(id, username, full_name, display_name, avatar_url),
      shows:show_id(id, name, poster_url, tmdb_id, first_aired)
    `)
    .eq("id", reviewId)
    .is("parent_id", null)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

function makeReviewCard(review) {
  const profile = review?.profiles || {};
  const show = review?.shows || {};
  const name = getDisplayName(profile);
  const handle = profile?.username ? `@${profile.username}` : "";

  const card = document.createElement("section");
  card.className = "burgrs-public-review-card";
  card.id = "shared-review";

  const top = document.createElement("div");
  top.className = "burgrs-public-review-top";

  if (profile.avatar_url) {
    const avatar = document.createElement("img");
    avatar.src = profile.avatar_url;
    avatar.alt = "";
    avatar.className = "burgrs-public-review-avatar";
    top.appendChild(avatar);
  } else {
    const avatar = document.createElement("span");
    avatar.className = "burgrs-public-review-avatar burgrs-public-review-avatar-fallback";
    avatar.textContent = name.slice(0, 1).toUpperCase();
    top.appendChild(avatar);
  }

  const copy = document.createElement("div");
  const heading = document.createElement("h2");
  heading.textContent = `${name}'s review`;
  const meta = document.createElement("p");
  meta.textContent = [handle, formatDate(review.created_at)].filter(Boolean).join(" • ");
  copy.appendChild(heading);
  copy.appendChild(meta);
  top.appendChild(copy);

  const body = document.createElement("p");
  body.className = "burgrs-public-review-body";
  body.textContent = text(review.body) || "No review text.";

  const showRow = document.createElement("div");
  showRow.className = "burgrs-public-review-show";
  if (show.poster_url) {
    const poster = document.createElement("img");
    poster.src = show.poster_url;
    poster.alt = "";
    showRow.appendChild(poster);
  }
  const showText = document.createElement("div");
  const showName = document.createElement("strong");
  showName.textContent = show.name || "Show";
  const showSub = document.createElement("small");
  showSub.textContent = show.first_aired ? String(show.first_aired).slice(0, 4) : "BURGRS review";
  showText.appendChild(showName);
  showText.appendChild(showSub);
  showRow.appendChild(showText);

  card.appendChild(top);
  card.appendChild(body);
  card.appendChild(showRow);
  return card;
}

async function showSharedReview() {
  if (!isShowPage()) return;

  const reviewId = getParams().get("review");
  if (!reviewId || document.querySelector(".burgrs-public-review-card")) return;

  try {
    const review = await loadReview(reviewId);
    if (!review?.id) return;

    const insert = () => {
      const shell = document.querySelector(".msd-shell");
      const hero = document.querySelector(".msd-hero");
      if (!shell || !hero) return false;

      const card = makeReviewCard(review);
      hero.insertAdjacentElement("afterend", card);
      window.setTimeout(() => {
        card.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 250);
      return true;
    };

    window.setTimeout(() => {
      if (insert()) return;
      window.setTimeout(insert, 500);
      window.setTimeout(insert, 1300);
    }, 350);
  } catch (error) {
    console.warn("Could not load public shared review:", error);
  }
}

function runPublicSharedContent() {
  openSharedList();
  showSharedReview();
}

if (typeof window !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", runPublicSharedContent, { once: true });
  } else {
    runPublicSharedContent();
  }

  window.addEventListener("popstate", () => window.setTimeout(runPublicSharedContent, 150));
}
