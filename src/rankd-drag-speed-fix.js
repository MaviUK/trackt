let rankdSpeedPointerY = null;
let rankdSpeedFrame = null;
let rankdSpeedHoldTicks = 0;

function isRankdDragRunning() {
  return document.body.classList.contains("rankd-drag-active");
}

function getRankdSpeed(clientY) {
  const height = window.innerHeight || 700;
  const zone = Math.max(230, Math.round(height * 0.38));
  const bottomStart = height - zone;

  if (clientY > bottomStart) {
    const ratio = Math.min(1, Math.max(0, (clientY - bottomStart) / zone));
    return Math.round(45 + Math.pow(ratio, 1.2) * 230);
  }

  if (clientY < zone) {
    const ratio = Math.min(1, Math.max(0, (zone - clientY) / zone));
    return -Math.round(45 + Math.pow(ratio, 1.2) * 230);
  }

  return 0;
}

function getRankdScrollCandidates() {
  const candidates = [
    document.scrollingElement,
    document.documentElement,
    document.body,
    document.querySelector("#root"),
    document.querySelector("main"),
    document.querySelector(".app-shell"),
    document.querySelector(".app-main"),
    document.querySelector(".page-shell"),
    document.querySelector(".rankd-page"),
    document.querySelector(".rankd-page .page-shell"),
    document.querySelector(".rankd-leaderboard-card"),
    document.querySelector(".rankd-leaderboard-list"),
  ].filter(Boolean);

  document.querySelectorAll("body *").forEach((element) => {
    if (element.scrollHeight > element.clientHeight + 8) {
      candidates.push(element);
    }
  });

  return Array.from(new Set(candidates)).filter((element) => {
    if (!element || element === document) return false;
    return element.scrollHeight > element.clientHeight + 8 || element === document.body || element === document.documentElement;
  });
}

function scrollElementBy(element, delta) {
  if (!element || !delta) return false;

  const before = element.scrollTop || 0;
  element.scrollTop = before + delta;
  return Math.abs((element.scrollTop || 0) - before) > 0;
}

function forceRankdScroll(delta) {
  if (!delta) return;

  let moved = false;

  window.scrollBy(0, delta);

  getRankdScrollCandidates().forEach((element) => {
    if (scrollElementBy(element, delta)) moved = true;
  });

  if (!moved) {
    const root = document.scrollingElement || document.documentElement || document.body;
    if (root) root.scrollTo({ top: (root.scrollTop || 0) + delta, behavior: "auto" });
    window.scrollTo({ top: window.scrollY + delta, behavior: "auto" });
  }
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
  const boost = Math.min(3.2, 1 + rankdSpeedHoldTicks / 16);
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
