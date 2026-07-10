function getMoveRankTarget(form) {
  const modal = form?.closest?.(".login-modal-card");
  if (!modal) return null;

  const heading = modal.querySelector("h2")?.textContent?.trim().toLowerCase();
  if (heading !== "move rank") return null;

  const input = modal.querySelector('input[type="number"]');
  const rank = Number.parseInt(input?.value || "", 10);

  return Number.isFinite(rank) && rank > 0 ? rank : null;
}

function scrollToRankdPosition(targetRank) {
  if (!targetRank || window.location.pathname !== "/rankd") return;

  const run = () => {
    const rows = Array.from(document.querySelectorAll(".rankd-page .rankd-leaderboard-row"));
    if (!rows.length) return false;

    const index = Math.max(0, Math.min(targetRank - 1, rows.length - 1));
    const row = rows[index];
    if (!row) return false;

    row.scrollIntoView({ behavior: "smooth", block: "center" });
    row.classList.add("rankd-moved-row-highlight");

    window.setTimeout(() => {
      row.classList.remove("rankd-moved-row-highlight");
    }, 1800);

    return true;
  };

  window.setTimeout(() => {
    if (run()) return;

    window.setTimeout(() => {
      run();
    }, 350);
  }, 150);
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
}
