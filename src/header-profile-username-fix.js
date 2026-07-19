import { supabase } from "./lib/supabase";

const AUTHENTICATED_CLASS = "header-profile-user-resolved";
const READY_ATTR = "data-header-profile-ready";

let headerProfile = null;
let currentUserId = "";
let loadPromise = null;
let syncQueued = false;
let retryTimer = null;

function getProfileView(profile) {
  const username = String(profile?.username || "").trim();
  const emailName = String(profile?.email || "")
    .split("@")[0]
    .trim();

  if (username) {
    return {
      href: `/u/${encodeURIComponent(username)}`,
      label: `@${username}`,
      initial: username.slice(0, 1).toUpperCase() || "U",
      isComplete: true,
    };
  }

  return {
    href: "/profile/edit",
    label: "Profile",
    initial: emailName.slice(0, 1).toUpperCase() || "U",
    isComplete: false,
  };
}

function createAvatarElement(profile, view) {
  if (profile.avatar_url) {
    const image = document.createElement("img");
    image.src = profile.avatar_url;
    image.alt = view.label;
    image.className = "top-profile-avatar";
    return image;
  }

  const fallback = document.createElement("div");
  fallback.className = "top-profile-avatar top-profile-avatar-placeholder";
  fallback.textContent = view.initial;
  return fallback;
}

function syncAvatar(link, profile, view) {
  const currentAvatar = link.querySelector(":scope > .top-profile-avatar");

  if (profile.avatar_url && currentAvatar?.tagName === "IMG") {
    if (currentAvatar.getAttribute("src") !== profile.avatar_url) {
      currentAvatar.setAttribute("src", profile.avatar_url);
    }
    currentAvatar.setAttribute("alt", view.label);
    currentAvatar.classList.remove("top-profile-avatar-loading");
    return;
  }

  if (!profile.avatar_url && currentAvatar?.tagName === "DIV") {
    currentAvatar.classList.remove("top-profile-avatar-loading");
    currentAvatar.classList.add("top-profile-avatar-placeholder");
    if (currentAvatar.textContent !== view.initial) {
      currentAvatar.textContent = view.initial;
    }
    return;
  }

  const nextAvatar = createAvatarElement(profile, view);

  if (currentAvatar) {
    currentAvatar.replaceWith(nextAvatar);
  } else {
    link.prepend(nextAvatar);
  }
}

function makeLinkInteractive(link, href) {
  if (link.tagName === "A") {
    if (link.getAttribute("href") !== href) link.setAttribute("href", href);
    link.removeAttribute("role");
    link.removeAttribute("tabindex");
    link.onclick = null;
    link.onkeydown = null;
    return;
  }

  link.setAttribute("role", "link");
  link.setAttribute("tabindex", "0");

  link.onclick = () => {
    window.location.assign(href);
  };

  link.onkeydown = (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      window.location.assign(href);
    }
  };
}

function applyHeaderProfile() {
  if (!headerProfile?.id) return;

  const view = getProfileView(headerProfile);

  document.querySelectorAll(".top-profile-link").forEach((link) => {
    makeLinkInteractive(link, view.href);

    const name = link.querySelector(".top-profile-name");
    if (name) {
      name.classList.remove("top-profile-name-loading");
      if (name.textContent !== view.label) name.textContent = view.label;
    }

    syncAvatar(link, headerProfile, view);

    link.classList.remove("top-profile-link-pending");
    link.setAttribute(READY_ATTR, "true");
    link.setAttribute("aria-label", view.isComplete ? view.label : "Set up your profile");
    link.setAttribute("aria-busy", "false");
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
      .select("id, username, avatar_url, email")
      .eq("id", user.id)
      .maybeSingle();

    if (error) throw error;

    headerProfile = {
      id: data?.id || user.id,
      username: String(data?.username || "").trim(),
      avatar_url: data?.avatar_url || "",
      email: data?.email || user.email || "",
    };

    applyHeaderProfile();
  })()
    .catch((error) => {
      console.warn("Failed loading header profile:", error);

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

  supabase.auth.onAuthStateChange((_event, session) => {
    const nextUserId = session?.user?.id || "";

    if (nextUserId !== currentUserId) {
      headerProfile = null;
      currentUserId = nextUserId;
    }

    document.documentElement.classList.remove(AUTHENTICATED_CLASS);
    loadHeaderProfile(true);
  });

  window.addEventListener("pageshow", () => loadHeaderProfile(true));
  window.addEventListener("popstate", queueHeaderProfileSync);
  window.addEventListener("burgrs:profile-updated", () => loadHeaderProfile(true));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") loadHeaderProfile(true);
  });

  loadHeaderProfile(true);
}
