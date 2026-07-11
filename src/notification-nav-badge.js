import { supabase } from "./lib/supabase";
import { getUnreadNotificationCount } from "./lib/notifications";

const CHANGE_EVENT = "burgrs:notifications-changed";
const POLL_INTERVAL_MS = 20000;

let currentUserId = null;
let currentCount = 0;
let realtimeChannel = null;
let pollTimer = null;
let refreshInFlight = false;

function findAlertsLink() {
  return [...document.querySelectorAll(".mobile-bottom-nav a")].find((link) => {
    const href = link.getAttribute("href") || "";
    const label = link.querySelector(".mobile-nav-label")?.textContent?.trim();
    return href === "/notifications" || label === "Alerts";
  });
}

function renderBadge() {
  const link = findAlertsLink();
  if (!link) return;

  let badge = link.querySelector(".mobile-alert-count-badge");

  if (currentCount > 0) {
    if (!badge) {
      badge = document.createElement("span");
      badge.className = "mobile-alert-count-badge";
      badge.setAttribute("aria-label", "Unread notifications");
      link.appendChild(badge);
    }

    badge.textContent = currentCount > 99 ? "99+" : String(currentCount);
    link.classList.add("has-unread-alerts");
    link.setAttribute(
      "aria-label",
      `${currentCount} unread notification${currentCount === 1 ? "" : "s"}`
    );
    return;
  }

  badge?.remove();
  link.classList.remove("has-unread-alerts");
  link.removeAttribute("aria-label");
}

async function refreshUnreadCount() {
  if (refreshInFlight) return;
  refreshInFlight = true;

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const nextUserId = user?.id || null;
    if (nextUserId !== currentUserId) {
      currentUserId = nextUserId;
      setupRealtimeSubscription();
    }

    currentCount = currentUserId
      ? await getUnreadNotificationCount(currentUserId)
      : 0;
    renderBadge();
  } catch (error) {
    console.warn("Failed refreshing notification badge", error);
  } finally {
    refreshInFlight = false;
  }
}

function setupRealtimeSubscription() {
  if (realtimeChannel) {
    supabase.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }

  if (!currentUserId) return;

  realtimeChannel = supabase
    .channel(`notification-badge-${currentUserId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "notifications",
        filter: `recipient_user_id=eq.${currentUserId}`,
      },
      () => refreshUnreadCount()
    )
    .subscribe();
}

function startPolling() {
  if (pollTimer) window.clearInterval(pollTimer);
  pollTimer = window.setInterval(refreshUnreadCount, POLL_INTERVAL_MS);
}

const observer = new MutationObserver(renderBadge);
observer.observe(document.documentElement, { childList: true, subtree: true });

window.addEventListener(CHANGE_EVENT, refreshUnreadCount);
window.addEventListener("focus", refreshUnreadCount);
window.addEventListener("pageshow", refreshUnreadCount);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") refreshUnreadCount();
});

supabase.auth.onAuthStateChange(() => {
  window.setTimeout(refreshUnreadCount, 0);
});

startPolling();
refreshUnreadCount();
