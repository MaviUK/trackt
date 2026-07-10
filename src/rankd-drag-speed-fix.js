let rankdEdgeState = null;
let rankdEdgeFrame = null;
let rankdLastStepAt = 0;

function isRankdDragRunning() {
  return document.body.classList.contains("rankd-drag-active");
}

function getRankdRows() {
  return Array.from(document.querySelectorAll(".rankd-page .rankd-leaderboard-row"));
}

function getActiveRankdDragRow() {
  return document.querySelector(".rankd-page .rankd-leaderboard-row.rankd-row-being-dragged");
}

function getDirection(clientY) {
  const height = window.innerHeight || 700;
  const zone = Math.max(145, Math.round(height * 0.22));

  if (clientY > height - zone) return 1;
  if (clientY < zone) return -1;
  return 0;
}

function getStepSize() {
  const ticks = rankdEdgeState?.ticks || 0;
  if (ticks > 45) return 3;
  if (ticks > 24) return 2;
  return 1;
}

function getDelay() {
  const ticks = rankdEdgeState?.ticks || 0;
  if (ticks > 45) return 260;
  if (ticks > 24) return 330;
  return 430;
}

function getOverlay() {
  let overlay = document.querySelector(".rankd-drag-jump-overlay");

  if (!overlay) {
    overlay = document.createElement("div");
    overlay.className = "rankd-drag-jump-overlay";
    overlay.innerHTML = `
      <strong>Drop target</strong>
      <span class="rankd-drag-jump-rank">#1</span>
      <small>Hold near the top/bottom edge to jump positions. Release to move here.</small>
    `;
    document.body.appendChild(overlay);
  }

  return overlay;
}

function updateOverlay() {
  if (!rankdEdgeState) return;

  const overlay = getOverlay();
  const rank = overlay.querySelector(".rankd-drag-jump-rank");
  if (rank) rank.textContent = `#${rankdEdgeState.targetRank}`;

  overlay.classList.toggle("is-up", rankdEdgeState.direction < 0);
  overlay.classList.toggle("is-down", rankdEdgeState.direction > 0);
}

function removeOverlay() {
  document.querySelector(".rankd-drag-jump-overlay")?.remove();
}

function ensureState(clientX, clientY) {
  const row = getActiveRankdDragRow();
  if (!row) return null;

  const rows = getRankdRows();
  const startRank = rows.indexOf(row) + 1;
  if (startRank < 1) return null;

  if (!rankdEdgeState || rankdEdgeState.row !== row) {
    rankdEdgeState = {
      row,
      startRank,
      targetRank: startRank,
      direction: 0,
      ticks: 0,
      clientX,
      clientY,
      maxRank: rows.length,
    };
  } else {
    rankdEdgeState.clientX = clientX;
    rankdEdgeState.clientY = clientY;
    rankdEdgeState.maxRank = rows.length;
  }

  return rankdEdgeState;
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

function submitSilentMove(row, targetRank) {
  const moveButton = Array.from(row?.querySelectorAll?.(".rankd-rank-button") || []).find(
    (button) => button.textContent.trim().toLowerCase() === "move"
  );

  if (!moveButton || !targetRank) return;

  document.body.classList.add("rankd-silent-move-active");
  moveButton.click();

  window.setTimeout(() => {
    const modals = Array.from(document.querySelectorAll(".login-modal-card"));
    const moveModal = modals.find(
      (modal) => modal.querySelector("h2")?.textContent?.trim().toLowerCase() === "move rank"
    );
    const input = moveModal?.querySelector('input[type="number"]');
    const form = moveModal?.querySelector("form");

    if (!input || !form) {
      document.body.classList.remove("rankd-silent-move-active");
      return;
    }

    setNativeInputValue(input, String(targetRank));

    window.setTimeout(() => {
      if (typeof form.requestSubmit === "function") {
        form.requestSubmit();
      } else {
        form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      }

      window.setTimeout(() => {
        document.body.classList.remove("rankd-silent-move-active");
      }, 500);
    }, 120);
  }, 160);
}

function runEdgeJump() {
  if (!isRankdDragRunning() || !rankdEdgeState) {
    rankdEdgeFrame = null;
    return;
  }

  const direction = getDirection(rankdEdgeState.clientY);
  rankdEdgeState.direction = direction;

  if (!direction) {
    rankdEdgeState.ticks = 0;
    updateOverlay();
    rankdEdgeFrame = window.requestAnimationFrame(runEdgeJump);
    return;
  }

  rankdEdgeState.ticks += 1;
  const now = Date.now();

  if (now - rankdLastStepAt >= getDelay()) {
    rankdLastStepAt = now;
    const nextRank = rankdEdgeState.targetRank + direction * getStepSize();
    rankdEdgeState.targetRank = Math.max(1, Math.min(rankdEdgeState.maxRank, nextRank));
    updateOverlay();
  }

  rankdEdgeFrame = window.requestAnimationFrame(runEdgeJump);
}

function startEdgeJump(clientX, clientY) {
  if (!isRankdDragRunning()) return;

  const state = ensureState(clientX, clientY);
  if (!state) return;

  state.direction = getDirection(clientY);
  updateOverlay();

  if (!rankdEdgeFrame) {
    rankdEdgeFrame = window.requestAnimationFrame(runEdgeJump);
  }
}

function stopEdgeJump() {
  const state = rankdEdgeState;

  if (rankdEdgeFrame) {
    window.cancelAnimationFrame(rankdEdgeFrame);
    rankdEdgeFrame = null;
  }

  rankdEdgeState = null;
  rankdLastStepAt = 0;
  removeOverlay();

  if (!state) return;
  if (!state.targetRank || state.targetRank === state.startRank) return;

  window.setTimeout(() => {
    submitSilentMove(state.row, state.targetRank);
  }, 360);
}

if (typeof window !== "undefined") {
  window.addEventListener(
    "pointermove",
    (event) => {
      startEdgeJump(event.clientX, event.clientY);
    },
    true
  );

  window.addEventListener("pointerup", stopEdgeJump, true);
  window.addEventListener("pointercancel", stopEdgeJump, true);

  window.addEventListener(
    "touchmove",
    (event) => {
      const touch = event.touches?.[0];
      if (!touch) return;
      startEdgeJump(touch.clientX, touch.clientY);
    },
    { capture: true, passive: false }
  );
}
