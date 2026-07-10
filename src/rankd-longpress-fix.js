function isRankdInteractiveTarget(target) {
  return Boolean(
    target?.closest?.(
      "button, input, textarea, select, .rankd-search-panel, .rankd-search-results"
    )
  );
}

function getRankdPressRow(target) {
  if (window.location.pathname !== "/rankd") return null;
  if (isRankdInteractiveTarget(target)) return null;
  return target?.closest?.(".rankd-page .rankd-leaderboard-row") || null;
}

function isRankdDragging() {
  return document.body.classList.contains("rankd-drag-active");
}

if (typeof window !== "undefined") {
  window.addEventListener(
    "contextmenu",
    (event) => {
      const row = getRankdPressRow(event.target);
      if (!row) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
    },
    true
  );

  window.addEventListener(
    "dragstart",
    (event) => {
      const row = getRankdPressRow(event.target);
      if (!row) return;

      event.preventDefault();
      event.stopPropagation();
    },
    true
  );

  window.addEventListener(
    "touchmove",
    (event) => {
      if (!isRankdDragging()) return;

      event.preventDefault();
    },
    { capture: true, passive: false }
  );

  window.addEventListener(
    "wheel",
    (event) => {
      if (!isRankdDragging()) return;

      event.preventDefault();
    },
    { capture: true, passive: false }
  );
}
