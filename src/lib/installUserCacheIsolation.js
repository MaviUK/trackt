import { supabase } from "./supabase";

const ACTIVE_USER_STORAGE_KEY = "trackt_active_user_id_v1";
const CROSS_USER_CACHE_POINTER_KEYS = ["trackt_my_shows_cache_v1:last"];
const STORAGE_PATCH_FLAG = "__tracktCrossUserCachePointersBlockedV1";

function isCrossUserCachePointerKey(key) {
  return CROSS_USER_CACHE_POINTER_KEYS.includes(String(key));
}

function clearCrossUserCachePointers() {
  if (typeof window === "undefined") return;

  for (const key of CROSS_USER_CACHE_POINTER_KEYS) {
    window.localStorage.removeItem(key);
  }
}

function blockCrossUserCachePointerWrites() {
  if (
    typeof window === "undefined" ||
    typeof Storage === "undefined" ||
    window[STORAGE_PATCH_FLAG]
  ) {
    return;
  }

  const originalSetItem = Storage.prototype.setItem;

  Storage.prototype.setItem = function setItem(key, value) {
    if (this === window.localStorage && isCrossUserCachePointerKey(key)) {
      this.removeItem(String(key));
      return undefined;
    }

    return originalSetItem.call(this, key, value);
  };

  window[STORAGE_PATCH_FLAG] = true;
}

function recordActiveUser(userId) {
  if (typeof window === "undefined") return;

  const nextUserId = userId || "";
  const previousUserId = window.localStorage.getItem(ACTIVE_USER_STORAGE_KEY) || "";

  if (previousUserId !== nextUserId) {
    clearCrossUserCachePointers();
  }

  if (nextUserId) {
    window.localStorage.setItem(ACTIVE_USER_STORAGE_KEY, nextUserId);
  } else {
    window.localStorage.removeItem(ACTIVE_USER_STORAGE_KEY);
  }
}

export function installUserCacheIsolation() {
  if (typeof window === "undefined") return () => {};

  // The legacy global pointer can reveal the most recently viewed user's list
  // before Supabase has resolved the current session. Keep only per-user caches.
  clearCrossUserCachePointers();
  blockCrossUserCachePointerWrites();

  supabase.auth
    .getSession()
    .then(({ data }) => {
      recordActiveUser(data?.session?.user?.id || "");
    })
    .catch((error) => {
      console.warn("Failed to initialise user cache isolation:", error);
      recordActiveUser("");
    });

  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((_event, session) => {
    recordActiveUser(session?.user?.id || "");
  });

  return () => subscription.unsubscribe();
}
