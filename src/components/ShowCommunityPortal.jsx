import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import ShowChatBoard from "./ShowChatBoard";
import ShowReviews from "./ShowReviews";

const PORTAL_FLAG = "__burgrsShowCommunityPortalInstalled";
const HOST_ID = "burgrs-show-community-portal";
const REVIEWS_BUTTON_ID = "burgrs-public-show-reviews-tab";
const CHATBOARD_BUTTON_ID = "burgrs-public-show-chatboard-tab";

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || "")
  );
}

function getPublicShowRoute(pathname) {
  const tmdbMatch = String(pathname || "").match(/^\/show\/tmdb\/(\d+)\/?$/i);
  if (tmdbMatch) return { source: "tmdb", value: tmdbMatch[1] };

  const showMatch = String(pathname || "").match(/^\/show\/([^/?#]+)\/?$/i);
  if (!showMatch) return null;

  const value = decodeURIComponent(showMatch[1]);
  return {
    source: isUuid(value) ? "database" : "tvdb",
    value,
  };
}

function getRequestedCommunityTab() {
  const params = new URLSearchParams(window.location.search);
  const requested = String(
    params.get("tab") || params.get("community") || ""
  ).toLowerCase();

  return ["reviews", "chatboard"].includes(requested) ? requested : "";
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

function ShowCommunityOverlay({ supabase, route, activeTab, onClose }) {
  const [databaseShow, setDatabaseShow] = useState(null);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadCommunity() {
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

        if (!showRow?.id) {
          setError("This show is not linked to the BURGRS database yet.");
        }
      } catch (loadError) {
        if (cancelled) return;
        console.warn("Failed loading show community:", loadError);
        setDatabaseShow(null);
        setError(loadError?.message || "Failed loading show community.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadCommunity();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!cancelled) setCurrentUserId(session?.user?.id || null);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [supabase, route.source, route.value]);

  useEffect(() => {
    const scrollY = window.scrollY;
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    const previousBodyPosition = document.body.style.position;
    const previousBodyTop = document.body.style.top;
    const previousBodyWidth = document.body.style.width;

    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = "100%";

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.body.style.position = previousBodyPosition;
      document.body.style.top = previousBodyTop;
      document.body.style.width = previousBodyWidth;
      window.scrollTo(0, scrollY);
    };
  }, []);

  const title = databaseShow?.name || "Show community";
  const isChatboard = activeTab === "chatboard";

  return (
    <section
      className="msd-chatboard-screen"
      aria-label={isChatboard ? "Show chatboard" : "Show reviews"}
    >
      <div className="msd-chatboard-screen-head">
        <div>
          <p className="msd-chatboard-screen-kicker">
            {isChatboard ? "Live chatboard" : "Reviews"}
          </p>
          <h2>{title}</h2>
        </div>
        <button
          type="button"
          className="msd-chatboard-close"
          onClick={onClose}
          aria-label={isChatboard ? "Close chatboard" : "Close reviews"}
        >
          ×
        </button>
      </div>

      <div className="msd-chatboard-screen-body">
        {loading ? (
          <p className="msd-muted">
            {isChatboard ? "Loading chatboard..." : "Loading reviews..."}
          </p>
        ) : error || !databaseShow?.id ? (
          <div className="msd-review-error">{error || "Show not found."}</div>
        ) : isChatboard ? (
          <ShowChatBoard
            showId={databaseShow.id}
            currentUserId={currentUserId}
          />
        ) : (
          <ShowReviews
            showId={databaseShow.id}
            currentUserId={currentUserId}
          />
        )}
      </div>
    </section>
  );
}

export function installShowCommunityPortal(supabase) {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  if (window[PORTAL_FLAG]) return;

  window[PORTAL_FLAG] = true;

  let host = null;
  let root = null;
  let activeTab = "reviews";
  let activeRouteKey = "";
  let overlayOpen = false;
  let frameId = null;

  function ensureHost() {
    if (host?.isConnected && root) return;

    host = document.getElementById(HOST_ID);
    if (!host) {
      host = document.createElement("div");
      host.id = HOST_ID;
      host.className = "msd-community-portal-host";
      document.body.appendChild(host);
    }

    root = createRoot(host);
  }

  function updateUrlTab(tabName) {
    const url = new URL(window.location.href);
    url.searchParams.set("tab", tabName);
    url.searchParams.delete("community");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }

  function clearUrlTab() {
    const url = new URL(window.location.href);
    url.searchParams.delete("tab");
    url.searchParams.delete("community");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }

  function updateButtonState() {
    const reviewsButton = document.getElementById(REVIEWS_BUTTON_ID);
    const chatboardButton = document.getElementById(CHATBOARD_BUTTON_ID);

    reviewsButton?.classList.toggle(
      "is-active",
      overlayOpen && activeTab === "reviews"
    );
    chatboardButton?.classList.toggle(
      "is-active",
      overlayOpen && activeTab === "chatboard"
    );
  }

  function closeOverlay({ clearQuery = true } = {}) {
    if (clearQuery) clearUrlTab();
    overlayOpen = false;
    activeRouteKey = "";
    root?.render(null);
    updateButtonState();
  }

  function openOverlay(tabName, { updateUrl = true } = {}) {
    const route = getPublicShowRoute(window.location.pathname);
    if (!route) return;

    ensureHost();

    activeTab = tabName === "chatboard" ? "chatboard" : "reviews";
    activeRouteKey = `${route.source}:${route.value}`;
    overlayOpen = true;

    if (updateUrl) updateUrlTab(activeTab);

    root.render(
      <ShowCommunityOverlay
        supabase={supabase}
        route={route}
        activeTab={activeTab}
        onClose={() => closeOverlay({ clearQuery: true })}
      />
    );

    updateButtonState();
  }

  function createCommunityButton(id, label, tabName) {
    const button = document.createElement("button");
    button.id = id;
    button.type = "button";
    button.className = "msd-content-tab";
    button.textContent = label;
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openOverlay(tabName, { updateUrl: true });
    });
    return button;
  }

  function ensureCommunityButtons() {
    const route = getPublicShowRoute(window.location.pathname);
    const tabList = document.querySelector(
      ".msd-page .msd-content-tabs-section .msd-content-tabs"
    );

    if (!route || !tabList) {
      document.getElementById(REVIEWS_BUTTON_ID)?.remove();
      document.getElementById(CHATBOARD_BUTTON_ID)?.remove();
      return;
    }

    if (!document.getElementById(REVIEWS_BUTTON_ID)) {
      tabList.appendChild(
        createCommunityButton(REVIEWS_BUTTON_ID, "Reviews", "reviews")
      );
    }

    if (!document.getElementById(CHATBOARD_BUTTON_ID)) {
      tabList.appendChild(
        createCommunityButton(CHATBOARD_BUTTON_ID, "Chatboard", "chatboard")
      );
    }

    updateButtonState();
  }

  function sync() {
    const route = getPublicShowRoute(window.location.pathname);
    ensureCommunityButtons();

    if (!route) {
      if (overlayOpen) closeOverlay({ clearQuery: false });
      return;
    }

    const requestedTab = getRequestedCommunityTab();
    if (!requestedTab) return;

    const routeKey = `${route.source}:${route.value}`;
    if (
      !overlayOpen ||
      activeRouteKey !== routeKey ||
      activeTab !== requestedTab
    ) {
      openOverlay(requestedTab, { updateUrl: false });
    }
  }

  function scheduleSync() {
    if (frameId !== null) return;
    frameId = window.requestAnimationFrame(() => {
      frameId = null;
      sync();
    });
  }

  function start() {
    ensureHost();
    scheduleSync();

    window.addEventListener("popstate", scheduleSync);

    const observer = new MutationObserver(scheduleSync);
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  }

  if (document.body) start();
  else document.addEventListener("DOMContentLoaded", start, { once: true });
}
