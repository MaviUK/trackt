import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import ShowChatBoard from "./ShowChatBoard";
import ShowReviews from "./ShowReviews";

const PORTAL_FLAG = "__burgrsShowCommunityPortalInstalled";
const HOST_ID = "burgrs-show-community-portal";

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || "")
  );
}

function getPublicShowRoute(pathname) {
  const tmdbMatch = String(pathname || "").match(/^\/show\/tmdb\/(\d+)\/?$/i);
  if (tmdbMatch) {
    return { source: "tmdb", value: tmdbMatch[1] };
  }

  const showMatch = String(pathname || "").match(/^\/show\/([^/?#]+)\/?$/i);
  if (!showMatch) return null;

  const value = decodeURIComponent(showMatch[1]);
  return {
    source: isUuid(value) ? "database" : "tvdb",
    value,
  };
}

async function findDatabaseShow(supabase, route) {
  if (!route) return null;

  let query = supabase.from("shows").select("id, name, tvdb_id, tmdb_id");

  if (route.source === "database") {
    query = query.eq("id", route.value);
  } else if (route.source === "tmdb") {
    query = query.eq("tmdb_id", Number(route.value));
  } else {
    query = query.eq("tvdb_id", Number(route.value));
  }

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data || null;
}

function ShowCommunityPanel({ supabase, pathname }) {
  const [databaseShow, setDatabaseShow] = useState(null);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [activeTab, setActiveTab] = useState("reviews");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadCommunityContext() {
      const route = getPublicShowRoute(pathname);
      if (!route) {
        if (!cancelled) {
          setDatabaseShow(null);
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      setError("");

      try {
        const [{ data: sessionData }, showRow] = await Promise.all([
          supabase.auth.getSession(),
          findDatabaseShow(supabase, route),
        ]);

        if (cancelled) return;
        setCurrentUserId(sessionData?.session?.user?.id || null);
        setDatabaseShow(showRow);
        setActiveTab("reviews");
      } catch (loadError) {
        if (cancelled) return;
        console.warn("Failed loading show community:", loadError);
        setDatabaseShow(null);
        setError(loadError?.message || "Failed loading show community.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadCommunityContext();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!cancelled) setCurrentUserId(session?.user?.id || null);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [pathname, supabase]);

  if (loading) {
    return (
      <section className="msd-panel msd-community-panel">
        <p className="msd-muted">Loading reviews and chatboard...</p>
      </section>
    );
  }

  if (!databaseShow) {
    if (!error) return null;
    return (
      <section className="msd-panel msd-community-panel">
        <p className="msd-review-error">{error}</p>
      </section>
    );
  }

  return (
    <section className="msd-panel msd-community-panel" aria-label="Show community">
      <div
        className="msd-content-tabs"
        role="tablist"
        aria-label={`${databaseShow.name || "Show"} community sections`}
        style={{ marginBottom: 16 }}
      >
        <button
          type="button"
          className={`msd-content-tab ${activeTab === "reviews" ? "is-active" : ""}`}
          onClick={() => setActiveTab("reviews")}
        >
          Reviews
        </button>
        <button
          type="button"
          className={`msd-content-tab ${activeTab === "chatboard" ? "is-active" : ""}`}
          onClick={() => setActiveTab("chatboard")}
        >
          Chatboard
        </button>
      </div>

      {activeTab === "reviews" ? (
        <ShowReviews
          showId={databaseShow.id}
          currentUserId={currentUserId}
        />
      ) : (
        <>
          <h2 className="msd-section-title">Chatboard</h2>
          <ShowChatBoard
            showId={databaseShow.id}
            currentUserId={currentUserId}
          />
        </>
      )}
    </section>
  );
}

export function installShowCommunityPortal(supabase) {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  if (window[PORTAL_FLAG]) return;

  window[PORTAL_FLAG] = true;

  let root = null;
  let host = null;
  let renderedPathname = "";
  let frameId = null;

  function removePortal() {
    if (root) root.unmount();
    root = null;

    if (host?.isConnected) host.remove();
    host = null;
    renderedPathname = "";
  }

  function syncPortal() {
    const pathname = window.location.pathname;
    const route = getPublicShowRoute(pathname);
    const shell = document.querySelector(".msd-page .msd-shell");

    if (!route || !shell) {
      if (!route) removePortal();
      return;
    }

    if (!host || !host.isConnected) {
      host = document.createElement("div");
      host.id = HOST_ID;
      host.className = "msd-community-portal-host";

      const bottomActionBar = shell.querySelector(".msd-bottom-action-bar");
      if (bottomActionBar) shell.insertBefore(host, bottomActionBar);
      else shell.appendChild(host);

      root = createRoot(host);
      renderedPathname = "";
    }

    const bottomActionBar = shell.querySelector(".msd-bottom-action-bar");
    if (bottomActionBar && host.nextSibling !== bottomActionBar) {
      shell.insertBefore(host, bottomActionBar);
    }

    if (renderedPathname !== pathname) {
      renderedPathname = pathname;
      root.render(
        <ShowCommunityPanel supabase={supabase} pathname={pathname} />
      );
    }
  }

  function scheduleSync() {
    if (frameId !== null) return;
    frameId = window.requestAnimationFrame(() => {
      frameId = null;
      syncPortal();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scheduleSync, { once: true });
  } else {
    scheduleSync();
  }

  window.addEventListener("popstate", scheduleSync);

  const observer = new MutationObserver(scheduleSync);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
}
