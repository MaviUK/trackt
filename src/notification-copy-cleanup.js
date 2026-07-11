function removeRedundantReviewReplyCopy() {
  document.querySelectorAll(".notification-card .notification-body p").forEach((paragraph) => {
    if (paragraph.textContent?.trim() === "Someone replied to your review.") {
      paragraph.remove();
    }
  });
}

const observer = new MutationObserver(removeRedundantReviewReplyCopy);
observer.observe(document.documentElement, { childList: true, subtree: true });

window.addEventListener("popstate", removeRedundantReviewReplyCopy);
window.addEventListener("pageshow", removeRedundantReviewReplyCopy);
removeRedundantReviewReplyCopy();
