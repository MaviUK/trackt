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
}
