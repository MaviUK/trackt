function removeRedundantNotificationCopy() {
  document
    .querySelectorAll(".notification-card .notification-body > p")
    .forEach((paragraph) => paragraph.remove());

  document.querySelectorAll(".notification-card").forEach((card) => {
    const title = card.querySelector(".notification-topline strong");
    const message = card.querySelector(".notification-message");

    if (
      title?.textContent?.trim().toLowerCase().endsWith("started following you") &&
      message
    ) {
      message.remove();
    }
  });
}

const observer = new MutationObserver(removeRedundantNotificationCopy);
observer.observe(document.documentElement, { childList: true, subtree: true });

window.addEventListener("popstate", removeRedundantNotificationCopy);
window.addEventListener("pageshow", removeRedundantNotificationCopy);
removeRedundantNotificationCopy();
