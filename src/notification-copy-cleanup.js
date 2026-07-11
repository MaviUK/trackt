function removeRedundantNotificationCopy() {
  document
    .querySelectorAll(".notification-card .notification-body > p")
    .forEach((paragraph) => paragraph.remove());
}

const observer = new MutationObserver(removeRedundantNotificationCopy);
observer.observe(document.documentElement, { childList: true, subtree: true });

window.addEventListener("popstate", removeRedundantNotificationCopy);
window.addEventListener("pageshow", removeRedundantNotificationCopy);
removeRedundantNotificationCopy();
