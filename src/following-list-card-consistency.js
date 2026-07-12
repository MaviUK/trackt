let followingListInstallQueued = false;

function syncText(button, text) {
  if (button.textContent !== text) button.textContent = text;
}

function syncBooleanAttribute(node, name, value) {
  const nextValue = value ? "true" : "false";
  if (node.getAttribute(name) !== nextValue) node.setAttribute(name, nextValue);
}

function ensureActionRow(listCard) {
  let row = listCard.querySelector(":scope > .following-list-actions-row");
  if (row) return row;

  const coverButton = listCard.querySelector(":scope > .creator-list-cover-button");
  if (!coverButton) return null;

  row = document.createElement("div");
  row.className = "creator-list-actions-row following-list-actions-row";
  coverButton.insertAdjacentElement("afterend", row);
  return row;
}

function ensureShareProxy(card, row) {
  const source = card.querySelector(
    ".following-creator-line .burgrs-activity-share-btn"
  );
  if (!source) return;

  let proxy = row.querySelector(".following-list-share-proxy");
  if (!proxy) {
    proxy = document.createElement("button");
    proxy.type = "button";
    proxy.className = "following-list-share-proxy";
    proxy.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      card
        .querySelector(".following-creator-line .burgrs-activity-share-btn")
        ?.click();
    });
    row.prepend(proxy);
  }

  syncText(proxy, source.textContent?.trim() || "Share");
  if (proxy.disabled !== source.disabled) proxy.disabled = source.disabled;
}

function ensureCommentsProxy(card, row) {
  const source = card.querySelector(
    ".following-creator-line .following-meta-comments .feed-comments-inline-toggle"
  );
  if (!source) return;

  let proxy = row.querySelector(".following-list-comments-proxy");
  if (!proxy) {
    proxy = document.createElement("button");
    proxy.type = "button";
    proxy.className = "following-list-comments-proxy";
    proxy.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      card
        .querySelector(
          ".following-creator-line .following-meta-comments .feed-comments-inline-toggle"
        )
        ?.click();
    });
    row.appendChild(proxy);
  }

  const label = source.querySelector("span")?.textContent?.trim() || "Comments";
  const isOpen = source.getAttribute("aria-expanded") === "true";

  syncText(proxy, label);
  syncBooleanAttribute(proxy, "aria-expanded", isOpen);
  proxy.classList.toggle("is-open", isOpen);
}

function installFollowingListCardConsistency() {
  if (window.location.pathname !== "/following") return;

  document.querySelectorAll(".following-card-list").forEach((card) => {
    const listCard = card.querySelector(":scope > .following-profile-list-card");
    if (!listCard) return;

    card.classList.add("following-list-creator-layout");
    const row = ensureActionRow(listCard);
    if (!row) return;

    ensureShareProxy(card, row);
    ensureCommentsProxy(card, row);
  });
}

function queueFollowingListCardConsistency() {
  if (followingListInstallQueued) return;
  followingListInstallQueued = true;

  window.requestAnimationFrame(() => {
    followingListInstallQueued = false;
    installFollowingListCardConsistency();
  });
}

if (typeof window !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", queueFollowingListCardConsistency, {
      once: true,
    });
  } else {
    queueFollowingListCardConsistency();
  }

  new MutationObserver(queueFollowingListCardConsistency).observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["aria-expanded", "disabled"],
  });

  window.addEventListener("popstate", queueFollowingListCardConsistency);
  window.addEventListener("pageshow", queueFollowingListCardConsistency);
}
