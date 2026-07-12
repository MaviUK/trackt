let followingCardInstallQueued = false;

const POST_ACTIVITY_TYPES = new Set([
  "post",
  "hot take",
  "recommendation",
  "tonight's pick",
  "watchlist advice",
]);

function syncText(button, text) {
  if (button.textContent !== text) button.textContent = text;
}

function syncBooleanAttribute(node, name, value) {
  const nextValue = value ? "true" : "false";
  if (node.getAttribute(name) !== nextValue) node.setAttribute(name, nextValue);
}

function getActivityType(card) {
  return (
    card
      .querySelector(".following-meta-type")
      ?.textContent?.trim()
      .toLowerCase() || ""
  );
}

function getShareSource(card) {
  return card.querySelector(
    ".following-creator-line .burgrs-activity-share-btn"
  );
}

function getCommentsSource(card) {
  return card.querySelector(
    ".following-creator-line .following-meta-comments .feed-comments-inline-toggle"
  );
}

function syncShareProxy(card, row, proxyClass) {
  const source = getShareSource(card);
  if (!source) return;

  let proxy = row.querySelector(`.${proxyClass}`);
  if (!proxy) {
    proxy = document.createElement("button");
    proxy.type = "button";
    proxy.className = proxyClass;
    proxy.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      getShareSource(card)?.click();
    });
    row.prepend(proxy);
  }

  syncText(proxy, source.textContent?.trim() || "Share");
  if (proxy.disabled !== source.disabled) proxy.disabled = source.disabled;
}

function syncCommentsProxy(card, row, proxyClass, fallbackLabel) {
  const source = getCommentsSource(card);
  if (!source) return;

  let proxy = row.querySelector(`.${proxyClass}`);
  if (!proxy) {
    proxy = document.createElement("button");
    proxy.type = "button";
    proxy.className = proxyClass;
    proxy.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      getCommentsSource(card)?.click();
    });
    row.appendChild(proxy);
  }

  const label =
    source.querySelector("span")?.textContent?.trim() || fallbackLabel;
  const isOpen = source.getAttribute("aria-expanded") === "true";

  syncText(proxy, label);
  syncBooleanAttribute(proxy, "aria-expanded", isOpen);
  proxy.classList.toggle("is-open", isOpen);
}

function ensureListActionRow(listCard) {
  let row = listCard.querySelector(":scope > .following-list-actions-row");
  if (row) return row;

  const coverButton = listCard.querySelector(
    ":scope > .creator-list-cover-button"
  );
  if (!coverButton) return null;

  row = document.createElement("div");
  row.className = "creator-list-actions-row following-list-actions-row";
  coverButton.insertAdjacentElement("afterend", row);
  return row;
}

function installFollowingListCards() {
  document.querySelectorAll(".following-card-list").forEach((card) => {
    const listCard = card.querySelector(
      ":scope > .following-profile-list-card"
    );
    if (!listCard) return;

    card.classList.add("following-list-creator-layout");
    const row = ensureListActionRow(listCard);
    if (!row) return;

    syncShareProxy(card, row, "following-list-share-proxy");
    syncCommentsProxy(
      card,
      row,
      "following-list-comments-proxy",
      "Comments"
    );
  });
}

function ensureBottomActionRow(card, className) {
  let row = card.querySelector(`:scope > .${className}`);
  const commentsPanel = card.querySelector(
    ":scope > .feed-comments-inline-panel"
  );

  if (!row) {
    row = document.createElement("div");
    row.className = className;

    if (commentsPanel) commentsPanel.insertAdjacentElement("beforebegin", row);
    else card.appendChild(row);
  } else if (commentsPanel && row.nextElementSibling !== commentsPanel) {
    commentsPanel.insertAdjacentElement("beforebegin", row);
  }

  return row;
}

function installFollowingReviewCards() {
  document
    .querySelectorAll(".following-card:not(.following-card-list)")
    .forEach((card) => {
      if (getActivityType(card) !== "review") return;

      card.classList.add("following-review-creator-layout");
      const row = ensureBottomActionRow(card, "following-review-actions-row");

      syncShareProxy(card, row, "following-review-share-proxy");
      syncCommentsProxy(
        card,
        row,
        "following-review-comments-proxy",
        "Replies"
      );
    });
}

function installFollowingPostCards() {
  document
    .querySelectorAll(".following-card:not(.following-card-list)")
    .forEach((card) => {
      if (!POST_ACTIVITY_TYPES.has(getActivityType(card))) return;

      card.classList.add("following-post-creator-layout");
      const row = ensureBottomActionRow(card, "following-post-actions-row");

      syncCommentsProxy(
        card,
        row,
        "following-post-comments-proxy",
        "Comments"
      );
    });
}

function installFollowingCardConsistency() {
  if (window.location.pathname !== "/following") return;
  installFollowingListCards();
  installFollowingReviewCards();
  installFollowingPostCards();
}

function queueFollowingCardConsistency() {
  if (followingCardInstallQueued) return;
  followingCardInstallQueued = true;

  window.requestAnimationFrame(() => {
    followingCardInstallQueued = false;
    installFollowingCardConsistency();
  });
}

if (typeof window !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", queueFollowingCardConsistency, {
      once: true,
    });
  } else {
    queueFollowingCardConsistency();
  }

  new MutationObserver(queueFollowingCardConsistency).observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["aria-expanded", "disabled"],
  });

  window.addEventListener("popstate", queueFollowingCardConsistency);
  window.addEventListener("pageshow", queueFollowingCardConsistency);
}
