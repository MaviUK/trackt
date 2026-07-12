import { supabase } from "./lib/supabase";

const AUTHENTICATED_CLASS = "header-profile-user-resolved";
const READY_ATTR = "data-header-profile-ready";

let headerProfile = null;
let currentUserId = "";
let loadPromise = null;
let syncQueued = false;
let retryTimer = null;

function profileHref(username) {
  return `/u/${encodeURIComponent(username)}`;
}

function createAvatarElement(profile) {
  if (profile.avatar_url) {
    const image = document.createElement("img");
    image.src = profile.avatar_url;
    image.alt = `@${profile.username}`;
    image.className = "top-profile-avatar";
    return image;
  }

  const fallback = document.createElement("div");
  fallback.className = "top-profile-avatar top-profile-avatar-placeholder";
  fallback.textContent = profile.username.slice(0, 1).toUpperCase();
  return fallback;
}

function syncAvatar(link, profile) {
  const currentAvatar = link.querySelector(":scope > .top-profile-avatar");

  if (profile.avatar_url && currentAvatar?.tagName === "IMG") {
    if (currentAvatar.getAttribute("src") !== profile.avatar_url) {
      currentAvatar.setAttribute("src", profile.avatar_url);
    }
    currentAvatar.setAttribute("alt", `@${profile.username}`);
    return;
  }

  if (!profile.avatar_url && currentAvatar?.tagName === "DIV") {
    const initial = profile.username.slice(0, 1).toUpperCase();
    if (currentAvatar.textContent !== initial) currentAvatar.textContent = initial;
    return;
  }

  currentAvatar?.replaceWith(createAvatarElement(profile));
}

function applyHeaderProfile() {
  if (!headerProfile?.username) return;

  const displayName = `@${headerProfile.username}`;
  const href = profileHref(headerProfile.username);

  document.querySelectorAll(".top-profile-link").forEach((link) => {
    if (link.getAttribute("href") !== href) link.setAttribute("href", href);

    const name = link.querySelector(".top-profile-name");
    if (name && name.textContent !== displayName) name.textContent = displayName;

    syncAvatar(link, headerProfile);
    link.setAttribute(READY_ATTR, "true");
    link.setAttribute("aria-label", displayName);
  });
}

function scheduleRetry() {
  if (retryTimer) return;

  retryTimer = window.setTimeout(() => {
    retryTimer = null;
    loadHeaderProfile(true);
  }, 2000);
}

async function loadHeaderProfile(force = false) {
  if (loadPromise) return loadPromise;
  if (headerProfile && !force) {
    applyHeaderProfile();
    return Promise.resolve();
  }

  loadPromise = (async () => {
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError) throw authError;

    const user = authData?.user || null;
    if (!user?.id) {
      currentUserId = "";
      headerProfile = null;
      document.documentElement.classList.remove(AUTHENTICATED_CLASS);
      return;
    }

    if (currentUserId && currentUserId !== user.id) headerProfile = null;
    currentUserId = user.id;
    document.documentElement.classList.add(AUTHENTICATED_CLASS);

    const { data, error } = await supabase
      .from("profiles")
      .select("id, username, avatar_url")
      .eq("id", user.id)
      .maybeSingle();

    if (error) throw error;

    if (!data?.username) {
      headerProfile = null;
      scheduleRetry();
      return;
    }

    headerProfile = {
      id: data.id,
      username: String(data.username).trim(),
      avatar_url: data.avatar_url || "",
    };

    applyHeaderProfile();
  })()
    .catch((error) => {
      console.warn("Failed loading header username:", error);
      if (currentUserId) {
        document.documentElement.classList.add(AUTHENTICATED_CLASS);
        scheduleRetry();
      }
    })
    .finally(() => {
      loadPromise = null;
    });

  return loadPromise;
}

function queueHeaderProfileSync() {
  if (syncQueued) return;
  syncQueued = true;

  window.requestAnimationFrame(() => {
    syncQueued = false;
    if (headerProfile) applyHeaderProfile();
    else loadHeaderProfile();
  });
}

if (typeof window !== "undefined") {
  new MutationObserver(queueHeaderProfileSync).observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
  });

  supabase.auth.onAuthStateChange(() => {
    headerProfile = null;
    currentUserId = "";
    document.documentElement.classList.remove(AUTHENTICATED_CLASS);
    loadHeaderProfile(true);
  });

  window.addEventListener("pageshow", () => loadHeaderProfile(true));
  window.addEventListener("popstate", queueHeaderProfileSync);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") loadHeaderProfile(true);
  });

  loadHeaderProfile(true);
}
