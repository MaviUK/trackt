import { supabase } from "./supabase";

const ACTIVE_USER_STORAGE_KEY = "trackt_active_user_id_v1";
const CROSS_USER_CACHE_POINTER_KEYS = ["trackt_my_shows_cache_v1:last"];

function clearCrossUserCachePointers() {
  if (typeof window === "undefined") return;

  for (const key of CROSS_USER_CACHE_POINTER_KEYS) {
    window.localStorage.removeItem(key);
  }
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

  // Remove the legacy global pointer before React mounts. The per-user cache
  // remains available once Supabase has resolved the active user.
  clearCrossUserCachePointers();

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
