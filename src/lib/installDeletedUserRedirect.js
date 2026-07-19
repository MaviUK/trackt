const DELETED_USER_ERROR = "user from sub claim in jwt does not exist";

function clearLocalSessionData() {
  try {
    window.localStorage.clear();
    window.sessionStorage.clear();
  } catch {
    // Browser storage cleanup is best effort.
  }
}

export function installDeletedUserRedirect(supabase) {
  if (typeof window === "undefined" || !supabase) return () => {};

  let redirecting = false;
  const originalFetch = window.fetch.bind(window);

  window.fetch = async (...args) => {
    const response = await originalFetch(...args);

    if (!redirecting && response.status === 401) {
      try {
        const text = await response.clone().text();
        if (text.toLowerCase().includes(DELETED_USER_ERROR)) {
          redirecting = true;
          await supabase.auth.signOut({ scope: "local" }).catch(() => {});
          clearLocalSessionData();
          window.location.replace("/");
        }
      } catch {
        // Leave unrelated failed responses untouched.
      }
    }

    return response;
  };

  return () => {
    window.fetch = originalFetch;
  };
}
