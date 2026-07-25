const SESSION_MARKER_PREFIX = "burgrs-active-auth-session:";

function decodeJwtPayload(token) {
  try {
    const payload = String(token || "").split(".")[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    return JSON.parse(window.atob(padded));
  } catch {
    return null;
  }
}

function getSessionId(session) {
  return decodeJwtPayload(session?.access_token)?.session_id || "";
}

export function installSingleSessionEnforcement(supabase) {
  if (!supabase?.auth || typeof window === "undefined") return () => {};

  let stopped = false;
  let running = false;

  async function keepOnlyCurrentSession(session) {
    if (stopped || running || !session?.user?.id) return;

    const sessionId = getSessionId(session);
    if (!sessionId) return;

    const markerKey = `${SESSION_MARKER_PREFIX}${session.user.id}`;

    try {
      if (window.localStorage.getItem(markerKey) === sessionId) return;
      running = true;

      const { error } = await supabase.auth.signOut({ scope: "others" });
      if (error) throw error;

      window.localStorage.setItem(markerKey, sessionId);
    } catch (error) {
      console.warn("Could not end other BURGRS sessions:", error);
    } finally {
      running = false;
    }
  }

  supabase.auth.getSession().then(({ data }) => {
    keepOnlyCurrentSession(data?.session || null);
  });

  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_IN" || event === "INITIAL_SESSION") {
      window.setTimeout(() => keepOnlyCurrentSession(session), 0);
    }
  });

  return () => {
    stopped = true;
    subscription.unsubscribe();
  };
}
