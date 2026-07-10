import { shareActivity } from "./lib/shareActivity";

let shareStatusTimer = null;

function showShareToast(message) {
  let toast = document.querySelector(".burgrs-share-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.className = "burgrs-share-toast";
    document.body.appendChild(toast);
  }

  toast.textContent = message;
  toast.classList.add("is-visible");
  window.clearTimeout(shareStatusTimer);
  shareStatusTimer = window.setTimeout(() => {
    toast.classList.remove("is-visible");
  }, 1800);
}

function getText(node, selector) {
  return node?.querySelector?.(selector)?.textContent?.trim() || "";
}

function getHref(node, selector) {
  return node?.querySelector?.(selector)?.getAttribute?.("href") || "";
}

function makeAbsolute(path) {
  if (!path) return window.location.href;
  if (path.startsWith("http")) return path;
  return `${window.location.origin}${path}`;
}

function makeShareButton(options) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "burgrs-activity-share-btn";
  button.textContent = "Share";
  button.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();

    const payload = typeof options === "function" ? options() : options;
    const result = await shareActivity(payload);

    if (result?.copied) showShareToast("Share text copied");
    else if (result?.ok) showShareToast("Share opened");
    else if (!result?.cancelled) showShareToast("Could not share");
  });

  return button;
}

function addShareButton(container, options) {
  if (!container || container.querySelector(".burgrs-activity-share-btn")) return;

  const button = makeShareButton(options);
  const commentsArea = container.querySelector(".following-meta-comments");

  if (commentsArea) {
    commentsArea.insertBefore(button, commentsArea.firstChild);
    return;
  }

  const target = container.querySelector(".creator-list-expanded-body") || container;
  target.appendChild(button);
}

function addCreatorReviewShares() {
  document.querySelectorAll(".creator-page .creator-review-card").forEach((card) => {
    addShareButton(card, () => {
      const showName = getText(card, ".creator-review-show strong") || "this show";
      const reviewText = getText(card, "p");
      const showHref = getHref(card, ".creator-review-show") || window.location.pathname;
      const creatorName = getText(document, ".creator-page .creator-hero-content h1") || "Someone";

      return {
        title: `${creatorName}'s review of ${showName} on BURGRS`,
        text: reviewText
          ? `${creatorName} reviewed ${showName}: "${reviewText.slice(0, 140)}${reviewText.length > 140 ? "..." : ""}"`
          : `${creatorName} reviewed ${showName} on BURGRS.`,
        url: makeAbsolute(showHref),
      };
    });
  });
}

function addCreatorListShares() {
  document.querySelectorAll(".creator-page .creator-list-card").forEach((card) => {
    addShareButton(card, () => {
      const title = getText(card, ".creator-list-cover-content h3") || "TV list";
      const subtitle = getText(card, ".creator-list-cover-content p");
      const creatorName = getText(document, ".creator-page .creator-hero-content h1") || "Someone";
      const currentUrl = window.location.href.split("#")[0];

      return {
        title: `${creatorName}'s ${title} on BURGRS`,
        text: `${creatorName} shared ${title}${subtitle ? ` - ${subtitle}` : ""} on BURGRS.`,
        url: currentUrl,
      };
    });
  });
}

function addFollowingReviewShares() {
  document.querySelectorAll(".following-page .following-card").forEach((card) => {
    const activityType = getText(card, ".following-meta-type").toLowerCase();
    if (activityType !== "review") return;

    addShareButton(card, () => {
      const creatorName = getText(card, ".following-creator-name-link strong") || "Someone";
      const showName = getText(card, ".following-show-card strong") || "this show";
      const reviewText = getText(card, ".following-review-text");
      const showHref = getHref(card, ".following-show-card") || window.location.pathname;

      return {
        title: `${creatorName}'s review of ${showName} on BURGRS`,
        text: reviewText
          ? `${creatorName} reviewed ${showName}: "${reviewText.slice(0, 140)}${reviewText.length > 140 ? "..." : ""}"`
          : `${creatorName} reviewed ${showName} on BURGRS.`,
        url: makeAbsolute(showHref),
      };
    });
  });
}

function addFollowingListShares() {
  document.querySelectorAll(".following-page .following-card-list").forEach((card) => {
    addShareButton(card, () => {
      const creatorName = getText(card, ".following-creator-name-link strong") || "Someone";
      const profileHref = getHref(card, ".following-creator-name-link") || getHref(card, ".following-avatar-link") || window.location.pathname;
      const title = getText(card, ".creator-list-cover-content h3") || "TV list";
      const subtitle = getText(card, ".creator-list-cover-content p");

      return {
        title: `${creatorName}'s ${title} on BURGRS`,
        text: `${creatorName} shared ${title}${subtitle ? ` - ${subtitle}` : ""} on BURGRS.`,
        url: makeAbsolute(profileHref),
      };
    });
  });
}

function installActivityShareButtons() {
  const path = window.location.pathname;
  if (path.startsWith("/u/")) {
    addCreatorReviewShares();
    addCreatorListShares();
  }

  if (path === "/following") {
    addFollowingReviewShares();
    addFollowingListShares();
  }
}

if (typeof window !== "undefined") {
  const queueInstall = () => window.setTimeout(installActivityShareButtons, 120);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", queueInstall, { once: true });
  } else {
    queueInstall();
  }

  const observer = new MutationObserver(queueInstall);
  observer.observe(document.body, { childList: true, subtree: true });
  window.addEventListener("popstate", queueInstall);
}
