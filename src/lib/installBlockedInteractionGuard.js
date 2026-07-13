import { supabase } from "./supabase";

const BLOCKED_CLASS = "burgrs-blocked-interaction";

function normalizeSlug(value) {
  return decodeURIComponent(String(value || ""))
    .trim()
    .replace(/^@/, "")
    .toLowerCase();
}

function profileIdentifierFromLink(link) {
  if (!link) return "";

  try {
    const url = new URL(link.href, window.location.origin);
    const match = url.pathname.match(/^\/u\/([^/]+)\/?$/i);
    return match ? normalizeSlug(match[1]) : "";
  } catch {
    return "";
  }
}

function getDirectBodyWrap(item) {
  return Array.from(item?.children || []).find((child) =>
    child.classList?.contains("msd-review-body-wrap")
  );
}

function getItemAuthorIdentifier(item) {
  const bodyWrap = getDirectBodyWrap(item);
  if (!bodyWrap) return "";

  const card = Array.from(bodyWrap.children || []).find((child) =>
    child.classList?.contains("msd-review-card")
  );
  const profileLink = card?.querySelector(
    '.msd-review-avatar-link[href^="/u/"], .msd-review-username[href^="/u/"], .msd-review-handle[href^="/u/"]'
  );

  return profileIdentifierFromLink(profileLink);
}

function getRootReviewItem(item) {
  let root = item;
  let parent = item?.parentElement?.closest(".msd-review-item") || null;

  while (parent) {
    root = parent;
    parent = parent.parentElement?.closest(".msd-review-item") || null;
  }

  return root;
}

function isReplyButton(button) {
  return String(button?.textContent || "").trim().toLowerCase() === "reply";
}

function isReplyForm(form) {
  if (!form?.classList?.contains("msd-review-reply-form")) return false;

  const submitText = String(
    form.querySelector('button[type="submit"]')?.textContent || ""
  )
    .trim()
    .toLowerCase();
  const placeholder = String(form.querySelector("textarea")?.placeholder || "")
    .trim()
    .toLowerCase();

  return submitText.includes("reply") || placeholder.startsWith("reply to ");
}

function setElementHidden(element, hidden) {
  if (!element) return;

  if (hidden) {
    element.dataset.burgrsBlockedHidden = "true";
    element.hidden = true;
    element.setAttribute("aria-hidden", "true");
    if ("disabled" in element) element.disabled = true;
    return;
  }

  if (element.dataset.burgrsBlockedHidden !== "true") return;
  delete element.dataset.burgrsBlockedHidden;
  element.hidden = false;
  element.removeAttribute("aria-hidden");
  if ("disabled" in element) element.disabled = false;
}

export function installBlockedInteractionGuard() {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return () => {};
  }

  let stopped = false;
  let observer = null;
  let scheduledFrame = 0;
  let blockedIdentifiers = new Set();
  let currentUserId = "";

  function isBlockedIdentifier(identifier) {
    const normalized = normalizeSlug(identifier);
    return Boolean(normalized && blockedIdentifiers.has(normalized));
  }

  function interactionIsBlocked(item) {
    if (!item || !currentUserId || blockedIdentifiers.size === 0) return false;

    const directAuthor = getItemAuthorIdentifier(item);
    const rootAuthor = getItemAuthorIdentifier(getRootReviewItem(item));

    return isBlockedIdentifier(directAuthor) || isBlockedIdentifier(rootAuthor);
  }

  function applyGuard() {
    if (stopped) return;

    document.querySelectorAll(".msd-review-item").forEach((item) => {
      const blocked = interactionIsBlocked(item);
      item.classList.toggle(BLOCKED_CLASS, blocked);

      const bodyWrap = getDirectBodyWrap(item);
      if (!bodyWrap) return;

      Array.from(bodyWrap.children || []).forEach((child) => {
        if (child.classList?.contains("msd-review-actions")) {
          child.querySelectorAll("button").forEach((button) => {
            if (isReplyButton(button)) setElementHidden(button, blocked);
          });
        }

        if (child.tagName === "FORM" && isReplyForm(child)) {
          setElementHidden(child, blocked);
        }
      });
    });
  }

  function scheduleApply() {
    window.cancelAnimationFrame(scheduledFrame);
    scheduledFrame = window.requestAnimationFrame(applyGuard);
  }

  async function refreshBlockedUsers() {
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;

      const userId = authData?.user?.id || "";
      currentUserId = userId;

      if (!userId) {
        blockedIdentifiers = new Set();
        scheduleApply();
        return;
      }

      const { data: rows, error: blocksError } = await supabase
        .from("user_blocks")
        .select("blocker_id, blocked_id")
        .or(`blocker_id.eq.${userId},blocked_id.eq.${userId}`);

      if (blocksError) throw blocksError;

      const relatedIds = Array.from(
        new Set(
          (rows || [])
            .map((row) =>
              row.blocker_id === userId ? row.blocked_id : row.blocker_id
            )
            .filter(Boolean)
        )
      );

      const nextIdentifiers = new Set(relatedIds.map((id) => normalizeSlug(id)));

      if (relatedIds.length) {
        const { data: profiles, error: profilesError } = await supabase
          .from("profiles")
          .select("id, username")
          .in("id", relatedIds);

        if (profilesError) throw profilesError;

        (profiles || []).forEach((profile) => {
          if (profile?.id) nextIdentifiers.add(normalizeSlug(profile.id));
          if (profile?.username) nextIdentifiers.add(normalizeSlug(profile.username));
        });
      }

      blockedIdentifiers = nextIdentifiers;
      scheduleApply();
    } catch (error) {
      console.warn("Blocked reply guard could not refresh:", error);
      blockedIdentifiers = new Set();
      scheduleApply();
    }
  }

  function preventBlockedClick(event) {
    const button = event.target?.closest?.("button");
    if (!button || !isReplyButton(button)) return;

    const item = button.closest(".msd-review-item");
    if (!interactionIsBlocked(item)) return;

    event.preventDefault();
    event.stopImmediatePropagation();
  }

  function preventBlockedSubmit(event) {
    const form = event.target;
    if (!isReplyForm(form)) return;

    const item = form.closest(".msd-review-item");
    if (!interactionIsBlocked(item)) return;

    event.preventDefault();
    event.stopImmediatePropagation();
  }

  observer = new MutationObserver(scheduleApply);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  document.addEventListener("click", preventBlockedClick, true);
  document.addEventListener("submit", preventBlockedSubmit, true);
  window.addEventListener("burgrs:user-blocks-changed", refreshBlockedUsers);
  window.addEventListener("pageshow", refreshBlockedUsers);
  window.addEventListener("popstate", scheduleApply);

  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange(() => refreshBlockedUsers());

  refreshBlockedUsers();

  return () => {
    stopped = true;
    window.cancelAnimationFrame(scheduledFrame);
    observer?.disconnect();
    subscription?.unsubscribe();
    document.removeEventListener("click", preventBlockedClick, true);
    document.removeEventListener("submit", preventBlockedSubmit, true);
    window.removeEventListener("burgrs:user-blocks-changed", refreshBlockedUsers);
    window.removeEventListener("pageshow", refreshBlockedUsers);
    window.removeEventListener("popstate", scheduleApply);
  };
}
