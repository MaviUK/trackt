let rankdSpeedPointerY = null;
let rankdSpeedFrame = null;
let rankdSpeedHoldTicks = 0;

function isRankdDragRunning() {
  return document.body.classList.contains("rankd-drag-active");
}

function getRankdSpeed(clientY) {
  const height = window.innerHeight || 700;
  const zone = Math.max(210, Math.round(height * 0.34));
  const bottomStart = height - zone;

  if (clientY > bottomStart) {
    const ratio = Math.min(1, Math.max(0, (clientY - bottomStart) / zone));
    return Math.round(32 + Math.pow(ratio, 1.35) * 150);
  }

  if (clientY < zone) {
    const ratio = Math.min(1, Math.max(0, (zone - clientY) / zone));
    return -Math.round(32 + Math.pow(ratio, 1.35) * 150);
  }

  return 0;
}

function forceRankdScroll(delta) {
  if (!delta) return;

  window.scrollBy(0, delta);

  const scroller = document.scrollingElement || document.documentElement || document.body;
  if (scroller) scroller.scrollTop += delta;
  if (document.documentElement) document.documentElement.scrollTop += delta;
  if (document.body) document.body.scrollTop += delta;
}

function runRankdSpeedScroll() {
  if (!isRankdDragRunning() || rankdSpeedPointerY == null) {
    rankdSpeedFrame = null;
    rankdSpeedHoldTicks = 0;
    return;
  }

  const baseSpeed = getRankdSpeed(rankdSpeedPointerY);

  if (!baseSpeed) {
    rankdSpeedFrame = null;
    rankdSpeedHoldTicks = 0;
    return;
  }

  rankdSpeedHoldTicks += 1;
  const boost = Math.min(2.4, 1 + rankdSpeedHoldTicks / 22);
  forceRankdScroll(Math.round(baseSpeed * boost));

  rankdSpeedFrame = window.requestAnimationFrame(runRankdSpeedScroll);
}

function startRankdSpeedScroll(clientY) {
  rankdSpeedPointerY = clientY;

  if (!isRankdDragRunning()) return;

  if (!getRankdSpeed(clientY)) {
    rankdSpeedHoldTicks = 0;
    return;
  }

  if (!rankdSpeedFrame) {
    rankdSpeedFrame = window.requestAnimationFrame(runRankdSpeedScroll);
  }
}

function stopRankdSpeedScroll() {
  rankdSpeedPointerY = null;
  rankdSpeedHoldTicks = 0;

  if (rankdSpeedFrame) {
    window.cancelAnimationFrame(rankdSpeedFrame);
    rankdSpeedFrame = null;
  }
}

if (typeof window !== "undefined") {
  window.addEventListener(
    "pointermove",
    (event) => {
      if (!isRankdDragRunning()) return;
      startRankdSpeedScroll(event.clientY);
    },
    true
  );

  window.addEventListener("pointerup", stopRankdSpeedScroll, true);
  window.addEventListener("pointercancel", stopRankdSpeedScroll, true);

  window.addEventListener(
    "touchmove",
    (event) => {
      if (!isRankdDragRunning()) return;
      const touch = event.touches?.[0];
      if (!touch) return;
      startRankdSpeedScroll(touch.clientY);
    },
    { capture: true, passive: false }
  );
}
