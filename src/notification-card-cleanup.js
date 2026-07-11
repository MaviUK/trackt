function removeRedundantReviewReplyText() {
  document.querySelectorAll(".notification-card").forEach((card) => {
    const title = card
      .querySelector(".notification-topline strong")
      ?.textContent?.trim()
      .toLowerCase();

    if (!title?.includes(" replied to ") || !title.endsWith(" review")) return;

    const body = card.querySelector(".notification-body > p");
    if (body?.textContent?.trim() === "Someone replied to your review.") {
      body.remove();
    }
  });
}

const observer = new MutationObserver(removeRedundantReviewReplyText);
observer.observe(document.documentElement, { childList: true, subtree: true });

window.addEventListener("pageshow", removeRedundantReviewReplyText);
window.addEventListener("popstate", () =>
  window.setTimeout(removeRedundantReviewReplyText, 0)
);

removeRedundantReviewReplyText();
