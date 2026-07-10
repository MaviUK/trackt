function getMoveRankTarget(form) {
  const modal = form?.closest?.(".login-modal-card");
  if (!modal) return null;

  const heading = modal.querySelector("h2")?.textContent?.trim().toLowerCase();
  if (heading !== "move rank") return null;

  const input = modal.querySelector('input[type="number"]');
  const rank = Number.parseInt(input?.value || "", 10);

  return Number.isFinite(rank) && rank > 0 ? rank : null;
}

function getRankdRows() {
  return Array.from(document.querySelectorAll(".rankd-page .rankd-leaderboard-row"));
}

function clearRankdHighlights() {
  getRankdRows().forEach((row) => row.classList.remove("rankd-moved-row-highlight"));
}

function highlightAndScrollRankdRow(row) {
  if (!row) return false;

  clearRankdHighlights();
  row.scrollIntoView({ behavior: "smooth", block: "center" });
  row.classList.add("rankd-moved-row-highlight");

  window.setTimeout(() => {
    row.classList.remove("rankd-moved-row-highlight");
  }, 1800);

  return true;
}

function scrollToRankdPosition(targetRank) {
  if (!targetRank || window.location.pathname !== "/rankd") return;

  const run = () => {
    const rows = getRankdRows();
    if (!rows.length) return false;

    const index = Math.max(0, Math.min(targetRank - 1, rows.length - 1));
    return highlightAndScrollRankdRow(rows[index]);
  };

  window.setTimeout(() => {
    if (run()) return;

    window.setTimeout(() => {
      run();
    }, 350);
  }, 150);
}

function getRankdRowData() {
  return getRankdRows().map((row, index) => {
    const titleText = row.querySelector(".rankd-leaderboard-title")?.textContent || "";
    const cleanedTitle = titleText.replace(/^#\d+\s*/, "").trim();

    return {
      row,
      rank: index + 1,
      title: cleanedTitle || titleText.trim() || `Rank #${index + 1}`,
      searchText: `${cleanedTitle} ${titleText}`.toLowerCase(),
    };
  });
}

function renderRankdSearchResults(panel) {
  const input = panel.querySelector(".rankd-search-input");
  const results = panel.querySelector(".rankd-search-results");
  if (!input || !results) return;

  const query = input.value.trim().toLowerCase();
  results.innerHTML = "";

  if (!query) {
    results.hidden = true;
    return;
  }

  const matches = getRankdRowData()
    .filter((item) => item.searchText.includes(query))
    .slice(0, 8);

  results.hidden = false;

  if (!matches.length) {
    const empty = document.createElement("div");
    empty.className = "rankd-search-empty";
    empty.textContent = "No matching shows found";
    results.appendChild(empty);
    return;
  }

  matches.forEach((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "rankd-search-result";
    button.innerHTML = `<strong>#${item.rank}</strong><span>${item.title}</span>`;
    button.addEventListener("click", () => {
      input.value = "";
      results.hidden = true;
      highlightAndScrollRankdRow(item.row);
    });
    results.appendChild(button);
  });
}

function ensureRankdSearch() {
  if (window.location.pathname !== "/rankd") return;

  const leaderboardCard = document.querySelector(".rankd-page .rankd-leaderboard-card");
  const leaderboardList = leaderboardCard?.querySelector(".rankd-leaderboard-list");
  if (!leaderboardCard || !leaderboardList) return;

  if (leaderboardCard.querySelector(".rankd-search-panel")) return;

  const panel = document.createElement("div");
  panel.className = "rankd-search-panel";
  panel.innerHTML = `
    <label class="rankd-search-label" for="rankd-show-search">Find a ranked show</label>
    <input id="rankd-show-search" class="rankd-search-input" type="search" placeholder="Search your Rank'd list..." autocomplete="off" />
    <div class="rankd-search-results" hidden></div>
  `;

  const input = panel.querySelector(".rankd-search-input");
  input?.addEventListener("input", () => renderRankdSearchResults(panel));
  input?.addEventListener("focus", () => renderRankdSearchResults(panel));

  document.addEventListener("click", (event) => {
    if (!panel.contains(event.target)) {
      const results = panel.querySelector(".rankd-search-results");
      if (results) results.hidden = true;
    }
  });

  leaderboardList.parentNode.insertBefore(panel, leaderboardList);
}

function startRankdHelpers() {
  ensureRankdSearch();

  let queued = false;
  const queueEnsure = () => {
    if (queued) return;
    queued = true;
    window.setTimeout(() => {
      queued = false;
      ensureRankdSearch();
    }, 120);
  };

  const observer = new MutationObserver(queueEnsure);
  observer.observe(document.body, { childList: true, subtree: true });

  window.addEventListener("popstate", queueEnsure);
  window.setInterval(ensureRankdSearch, 1200);
}

if (typeof window !== "undefined") {
  window.addEventListener(
    "submit",
    (event) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;

      const targetRank = getMoveRankTarget(form);
      if (!targetRank) return;

      scrollToRankdPosition(targetRank);
    },
    true
  );

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startRankdHelpers, { once: true });
  } else {
    startRankdHelpers();
  }
}
