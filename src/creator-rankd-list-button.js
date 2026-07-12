const BUTTON_ATTR = "data-creator-rankd-list-button";

let syncQueued = false;

function getListsStatButton() {
  return Array.from(
    document.querySelectorAll(
      ".creator-stats-card.creator-stats-card-clickable > button"
    )
  ).find(
    (button) =>
      button.querySelector("span")?.textContent?.trim().toLowerCase() ===
      "lists"
  );
}

function openCreatorRankdList() {
  const listsButton = getListsStatButton();

  if (listsButton && !listsButton.classList.contains("is-active")) {
    listsButton.click();
  }

  window.setTimeout(() => {
    const rankdCard = document.querySelector(
      ".creator-profile-panel .creator-list-card-auto"
    );
    if (!rankdCard) return;

    const coverButton = rankdCard.querySelector(
      ".creator-list-cover-button"
    );

    if (coverButton?.getAttribute("aria-expanded") !== "true") {
      coverButton?.click();
    }

    window.setTimeout(() => {
      rankdCard.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 80);
  }, 80);
}

function installCreatorRankdListButton() {
  if (!window.location.pathname.startsWith("/u/")) return;

  const actions = document.querySelector(
    ".creator-page .creator-hero .creator-actions"
  );
  if (!actions) return;

  const isOwnProfile = Boolean(
    actions.querySelector('a[href="/profile/edit"]')
  );

  if (isOwnProfile) {
    actions.querySelector(`[${BUTTON_ATTR}]`)?.remove();
    return;
  }

  const rankdCard = document.querySelector(
    ".creator-profile-panel .creator-list-card-auto"
  );

  if (!rankdCard) return;

  let button = actions.querySelector(`[${BUTTON_ATTR}]`);
  if (button) return;

  button = document.createElement("button");
  button.type = "button";
  button.className =
    "creator-btn creator-btn-rankd creator-rankd-list-button";
  button.textContent = "Rank'd list";
  button.setAttribute(BUTTON_ATTR, "true");
  button.setAttribute("aria-label", "View this creator's Rank'd TV list");
  button.addEventListener("click", openCreatorRankdList);
  actions.appendChild(button);
}

function queueCreatorRankdListButton() {
  if (syncQueued) return;
  syncQueued = true;

  window.requestAnimationFrame(() => {
    syncQueued = false;
    installCreatorRankdListButton();
  });
}

if (typeof window !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", queueCreatorRankdListButton, {
      once: true,
    });
  } else {
    queueCreatorRankdListButton();
  }

  new MutationObserver(queueCreatorRankdListButton).observe(
    document.documentElement,
    {
      childList: true,
      subtree: true,
    }
  );

  window.addEventListener("popstate", queueCreatorRankdListButton);
  window.addEventListener("pageshow", queueCreatorRankdListButton);
}
