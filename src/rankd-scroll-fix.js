let rankdSuppressClickUntil = 0;
let rankdDragState = null;

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

function setNativeInputValue(input, value) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
  if (setter) {
    setter.call(input, value);
  } else {
    input.value = value;
  }

  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function submitMoveViaExistingModal(row, targetRank) {
  const moveButton = Array.from(row.querySelectorAll(".rankd-rank-button")).find(
    (button) => button.textContent.trim().toLowerCase() === "move"
  );

  if (!moveButton || !targetRank) return;

  moveButton.click();

  window.setTimeout(() => {
    const modals = Array.from(document.querySelectorAll(".login-modal-card"));
    const moveModal = modals.find(
      (modal) => modal.querySelector("h2")?.textContent?.trim().toLowerCase() === "move rank"
    );
    const input = moveModal?.querySelector('input[type="number"]');
    const form = moveModal?.querySelector("form");

    if (!input || !form) return;

    setNativeInputValue(input, String(targetRank));

    window.setTimeout(() => {
      if (typeof form.requestSubmit === "function") {
        form.requestSubmit();
      } else {
        form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      }
    }, 140);
  }, 120);
}

function getRankFromPointerY(pointerY, draggedRow) {
  const rows = getRankdRows();
  const otherRows = rows.filter((row) => row !== draggedRow);
  let targetIndex = otherRows.length;

  for (let index = 0; index < otherRows.length; index += 1) {
    const rect = otherRows[index].getBoundingClientRect();
    const centerY = rect.top + rect.height / 2;

    if (pointerY < centerY) {
      targetIndex = index;
      break;
    }
  }

  return Math.max(1, Math.min(targetIndex + 1, rows.length));
}

function updateDragGhost(clientX, clientY) {
  if (!rankdDragState?.ghost) return;

  rankdDragState.ghost.style.transform = `translate3d(${clientX - rankdDragState.offsetX}px, ${clientY - rankdDragState.offsetY}px, 0)`;

  const targetRank = getRankFromPointerY(clientY, rankdDragState.row);
  rankdDragState.targetRank = targetRank;

  const indicator = rankdDragState.indicator;
  if (!indicator) return;

  const rows = getRankdRows().filter((row) => row !== rankdDragState.row);
  const beforeRow = rows[targetRank - 1] || null;
  const list = document.querySelector(".rankd-page .rankd-leaderboard-list");

  if (beforeRow && beforeRow.parentNode === list) {
    list.insertBefore(indicator, beforeRow);
  } else if (list) {
    list.appendChild(indicator);
  }
}

function endRankdDrag(event) {
  if (!rankdDragState) return;

  const state = rankdDragState;
  rankdDragState = null;
  rankdSuppressClickUntil = Date.now() + 600;

  window.clearTimeout(state.timer);
  window.removeEventListener("pointermove", onRankdDragPointerMove, true);
  window.removeEventListener("pointerup", endRankdDrag, true);
  window.removeEventListener("pointercancel", cancelRankdDrag, true);

  state.row.classList.remove("rankd-row-long-pressing", "rankd-row-being-dragged");
  state.ghost?.remove();
  state.indicator?.remove();
  document.body.classList.remove("rankd-drag-active");

  if (!state.active) return;

  event?.preventDefault?.();
  event?.stopPropagation?.();

  const targetRank = state.targetRank || getRankFromPointerY(event?.clientY || state.startY, state.row);
  if (targetRank && targetRank !== state.startRank) {
    submitMoveViaExistingModal(state.row, targetRank);
  }
}

function cancelRankdDrag(event) {
  if (!rankdDragState) return;

  const state = rankdDragState;
  rankdDragState = null;

  window.clearTimeout(state.timer);
  window.removeEventListener("pointermove", onRankdDragPointerMove, true);
  window.removeEventListener("pointerup", endRankdDrag, true);
  window.removeEventListener("pointercancel", cancelRankdDrag, true);

  state.row.classList.remove("rankd-row-long-pressing", "rankd-row-being-dragged");
  state.ghost?.remove();
  state.indicator?.remove();
  document.body.classList.remove("rankd-drag-active");

  event?.preventDefault?.();
}

function activateRankdDrag(clientX, clientY) {
  if (!rankdDragState || rankdDragState.active) return;

  const state = rankdDragState;
  const rect = state.row.getBoundingClientRect();
  const ghost = state.row.cloneNode(true);
  const indicator = document.createElement("div");

  state.active = true;
  state.offsetX = clientX - rect.left;
  state.offsetY = clientY - rect.top;
  state.ghost = ghost;
  state.indicator = indicator;
  state.targetRank = state.startRank;

  ghost.classList.add("rankd-drag-ghost");
  ghost.style.width = `${rect.width}px`;
  ghost.style.height = `${rect.height}px`;
  ghost.style.left = "0";
  ghost.style.top = "0";
  ghost.style.transform = `translate3d(${rect.left}px, ${rect.top}px, 0)`;

  indicator.className = "rankd-drag-drop-indicator";
  indicator.style.height = `${Math.max(54, rect.height)}px`;

  state.row.classList.remove("rankd-row-long-pressing");
  state.row.classList.add("rankd-row-being-dragged");
  document.body.classList.add("rankd-drag-active");
  document.body.appendChild(ghost);
  state.row.parentNode.insertBefore(indicator, state.row);

  updateDragGhost(clientX, clientY);
}

function onRankdDragPointerMove(event) {
  if (!rankdDragState) return;

  const moved = Math.abs(event.clientY - rankdDragState.startY) + Math.abs(event.clientX - rankdDragState.startX);

  if (!rankdDragState.active && moved > 14) {
    window.clearTimeout(rankdDragState.timer);
    rankdDragState.row.classList.remove("rankd-row-long-pressing");
    rankdDragState = null;
    return;
  }

  if (!rankdDragState.active) return;

  event.preventDefault();
  event.stopPropagation();
  updateDragGhost(event.clientX, event.clientY);

  const edgeSize = 92;
  if (event.clientY < edgeSize) {
    window.scrollBy({ top: -13, behavior: "auto" });
  } else if (event.clientY > window.innerHeight - edgeSize) {
    window.scrollBy({ top: 13, behavior: "auto" });
  }
}

function attachRankdLongPressDrag(row, index) {
  if (row.dataset.rankdDragReady === "true") return;
  row.dataset.rankdDragReady = "true";

  row.addEventListener("pointerdown", (event) => {
    if (window.location.pathname !== "/rankd") return;
    if (event.button != null && event.button !== 0) return;
    if (event.target.closest("button, input, textarea, select, .rankd-search-panel")) return;

    const rows = getRankdRows();
    const startRank = rows.indexOf(row) + 1 || index + 1;

    rankdDragState = {
      row,
      active: false,
      timer: null,
      startX: event.clientX,
      startY: event.clientY,
      startRank,
      targetRank: startRank,
      pointerId: event.pointerId,
    };

    row.classList.add("rankd-row-long-pressing");

    rankdDragState.timer = window.setTimeout(() => {
      activateRankdDrag(event.clientX, event.clientY);
    }, 520);

    window.addEventListener("pointermove", onRankdDragPointerMove, true);
    window.addEventListener("pointerup", endRankdDrag, true);
    window.addEventListener("pointercancel", cancelRankdDrag, true);
  });
}

function ensureRankdLongPressDrag() {
  if (window.location.pathname !== "/rankd") return;

  getRankdRows().forEach((row, index) => attachRankdLongPressDrag(row, index));
}

function startRankdHelpers() {
  ensureRankdSearch();
  ensureRankdLongPressDrag();

  let queued = false;
  const queueEnsure = () => {
    if (queued) return;
    queued = true;
    window.setTimeout(() => {
      queued = false;
      ensureRankdSearch();
      ensureRankdLongPressDrag();
    }, 120);
  };

  const observer = new MutationObserver(queueEnsure);
  observer.observe(document.body, { childList: true, subtree: true });

  window.addEventListener("popstate", queueEnsure);
  window.setInterval(() => {
    ensureRankdSearch();
    ensureRankdLongPressDrag();
  }, 1200);
}

if (typeof window !== "undefined") {
  window.addEventListener(
    "click",
    (event) => {
      if (!event.isTrusted) return;

      if (Date.now() < rankdSuppressClickUntil) {
        event.preventDefault();
        event.stopPropagation();
      }
    },
    true
  );

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
