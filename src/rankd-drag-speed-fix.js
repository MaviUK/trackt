let rankdEdgePointer = null;
let rankdEdgeFrame = null;
let rankdEdgeTick = 0;
let rankdLastJumpAt = 0;

function isRankdDragRunning() {
  return document.body.classList.contains("rankd-drag-active");
}

function getRankdRows() {
  return Array.from(document.querySelectorAll(".rankd-page .rankd-leaderboard-row"));
}

function getRankdIndicatorRank() {
  const list = document.querySelector(".rankd-page .rankd-leaderboard-list");
  const indicator = list?.querySelector(".rankd-drag-drop-indicator");
  const rows = getRankdRows();

  if (!list || !indicator || !rows.length) return null;

  const children = Array.from(list.children);
  const indicatorIndex = children.indexOf(indicator);
  if (indicatorIndex < 0) return null;

  let rank = 1;
  for (let index = 0; index < indicatorIndex; index += 1) {
    if (children[index].classList?.contains("rankd-leaderboard-row")) rank += 1;
  }

  return Math.max(1, Math.min(rank, rows.length));
}

function dispatchRankdPointerMove() {
  if (!rankdEdgePointer) return;

  try {
    window.dispatchEvent(
      new PointerEvent("pointermove", {
        bubbles: true,
        cancelable: true,
        clientX: rankdEdgePointer.x,
        clientY: rankdEdgePointer.y,
        pointerId: 1,
        pointerType: "touch",
        isPrimary: true,
      })
    );
  } catch {
    window.dispatchEvent(
      new MouseEvent("pointermove", {
        bubbles: true,
        cancelable: true,
        clientX: rankdEdgePointer.x,
        clientY: rankdEdgePointer.y,
      })
    );
  }
}

function jumpRankdList(direction) {
  const rows = getRankdRows();
  if (!rows.length) return;

  const currentRank = getRankdIndicatorRank() || 1;
  const step = rankdEdgeTick > 14 ? 14 : rankdEdgeTick > 7 ? 9 : 5;
  const nextRank = Math.max(1, Math.min(rows.length, currentRank + direction * step));
  const targetRow = rows[nextRank - 1];

  if (!targetRow) return;

  targetRow.scrollIntoView({ block: direction > 0 ? "end" : "start", inline: "nearest", behavior: "auto" });

  window.setTimeout(() => {
    dispatchRankdPointerMove();
  }, 20);
}

function getRankdDirection(clientY) {
  const height = window.innerHeight || 700;
  const zone = Math.max(190, Math.round(height * 0.32));

  if (clientY > height - zone) return 1;
  if (clientY < zone) return -1;
  return 0;
}

function runRankdEdgeJump() {
  if (!isRankdDragRunning() || !rankdEdgePointer) {
    rankdEdgeFrame = null;
    rankdEdgeTick = 0;
    return;
  }

  const direction = getRankdDirection(rankdEdgePointer.y);
  if (!direction) {
    rankdEdgeFrame = null;
    rankdEdgeTick = 0;
    return;
  }

  rankdEdgeTick += 1;

  const now = Date.now();
  const delay = rankdEdgeTick > 12 ? 80 : rankdEdgeTick > 6 ? 120 : 170;

  if (now - rankdLastJumpAt >= delay) {
    rankdLastJumpAt = now;
    jumpRankdList(direction);
  }

  rankdEdgeFrame = window.requestAnimationFrame(runRankdEdgeJump);
}

function startRankdEdgeJump(clientX, clientY) {
  rankdEdgePointer = { x: clientX, y: clientY };

  if (!isRankdDragRunning()) return;

  if (!getRankdDirection(clientY)) {
    rankdEdgeTick = 0;
    return;
  }

  if (!rankdEdgeFrame) {
    rankdEdgeFrame = window.requestAnimationFrame(runRankdEdgeJump);
  }
}

function stopRankdEdgeJump() {
  rankdEdgePointer = null;
  rankdEdgeTick = 0;
  rankdLastJumpAt = 0;

  if (rankdEdgeFrame) {
    window.cancelAnimationFrame(rankdEdgeFrame);
    rankdEdgeFrame = null;
  }
}

if (typeof window !== "undefined") {
  window.addEventListener(
    "pointermove",
    (event) => {
      if (!isRankdDragRunning()) return;
      startRankdEdgeJump(event.clientX, event.clientY);
    },
    true
  );

  window.addEventListener("pointerup", stopRankdEdgeJump, true);
  window.addEventListener("pointercancel", stopRankdEdgeJump, true);

  window.addEventListener(
    "touchmove",
    (event) => {
      if (!isRankdDragRunning()) return;
      const touch = event.touches?.[0];
      if (!touch) return;
      startRankdEdgeJump(touch.clientX, touch.clientY);
    },
    { capture: true, passive: false }
  );
}
