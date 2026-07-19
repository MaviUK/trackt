const DELETED_USER_ERROR = "user from sub claim in jwt does not exist";

function clearLocalSessionData() {
  try {
    window.localStorage.clear();
    window.sessionStorage.clear();
  } catch {
    // Browser storage cleanup is best effort.
  }
}

function isDeletedUserError(error) {
  const message = String(error?.message || error || "").toLowerCase();
  return message.includes(DELETED_USER_ERROR);
}

export function installDeletedUserRedirect(supabase) {
  if (typeof window === "undefined" || !supabase) return () => {};

  let redirecting = false;
  let checking = false;

  async function clearDeletedSession() {
    if (redirecting) return;

    redirecting = true;
    await supabase.auth.signOut({ scope: "local" }).catch(() => {});
    clearLocalSessionData();
    window.location.replace("/");
  }

  async function validateStoredSession() {
    if (checking || redirecting) return;
    checking = true;

    try {
      const { data: sessionData, error: sessionError } =
        await supabase.auth.getSession();

      if (sessionError) {
        if (isDeletedUserError(sessionError)) await clearDeletedSession();
        return;
      }

      if (!sessionData?.session) return;

      const { data: userData, error: userError } = await supabase.auth.getUser();

      if (isDeletedUserError(userError) || !userData?.user) {
        await clearDeletedSession();
      }
    } catch (error) {
      if (isDeletedUserError(error)) await clearDeletedSession();
    } finally {
      checking = false;
    }
  }

  const handlePageActivity = () => {
    if (document.visibilityState === "visible") validateStoredSession();
  };

  const handleNavigation = () => validateStoredSession();
  const originalPushState = window.history.pushState.bind(window.history);
  const originalReplaceState = window.history.replaceState.bind(window.history);

  window.history.pushState = (...args) => {
    const result = originalPushState(...args);
    window.setTimeout(handleNavigation, 0);
    return result;
  };

  window.history.replaceState = (...args) => {
    const result = originalReplaceState(...args);
    window.setTimeout(handleNavigation, 0);
    return result;
  };

  window.addEventListener("popstate", handleNavigation);
  window.addEventListener("focus", validateStoredSession);
  document.addEventListener("visibilitychange", handlePageActivity);

  validateStoredSession();

  return () => {
    window.history.pushState = originalPushState;
    window.history.replaceState = originalReplaceState;
    window.removeEventListener("popstate", handleNavigation);
    window.removeEventListener("focus", validateStoredSession);
    document.removeEventListener("visibilitychange", handlePageActivity);
  };
}
