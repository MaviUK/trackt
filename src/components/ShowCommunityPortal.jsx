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

function ShowCommunityContent({ supabase, route, activeTab }) {
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

  if (loading) {
    return (
      <section className="msd-panel msd-community-panel">
        <p className="msd-muted">
          {activeTab === "chatboard"
            ? "Loading chatboard..."
            : "Loading reviews..."}
        </p>
      </section>
    );
  }

  if (error || !databaseShow?.id) {
    return (
      <section className="msd-panel msd-community-panel">
        <div className="msd-review-error">{error || "Show not found."}</div>
      </section>
    );
  }

  return (
    <section className="msd-panel msd-community-panel" aria-label="Show community">
      {activeTab === "chatboard" ? (
        <>
          <h2 className="msd-section-title">Chatboard</h2>
          <ShowChatBoard
            showId={databaseShow.id}
            currentUserId={currentUserId}
          />
        </>
      ) : (
        <ShowReviews
          showId={databaseShow.id}
          currentUserId={currentUserId}
        />
      )}
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
  let communityOpen = false;
  let renderedKey = "";
  let frameId = null;
  let scrollTimer = null;

  function getPageParts() {
    const route = getPublicShowRoute(window.location.pathname);
    const shell = document.querySelector(".msd-page .msd-shell");
    const tabSection = shell?.querySelector(".msd-content-tabs-section");
    const tabList = tabSection?.querySelector(".msd-content-tabs");
    const nativePanel = tabSection?.querySelector(".msd-tab-panel");

    return { route, tabSection, tabList, nativePanel };
  }

  function ensureHost(tabSection) {
    if (!tabSection) return false;

    if (!host || !host.isConnected) {
      host = document.createElement("div");
      host.id = HOST_ID;
      host.className = "msd-community-portal-host";
      host.style.display = "none";
      tabSection.insertAdjacentElement("afterend", host);
      root = createRoot(host);
      renderedKey = "";
    } else if (host.previousElementSibling !== tabSection) {
      tabSection.insertAdjacentElement("afterend", host);
    }

    return true;
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
    url.searchParams.delete("reviewer");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }

  function updateButtonState(tabList) {
    if (!tabList) return;

    tabList
      .querySelectorAll(".msd-content-tab")
      .forEach((button) => button.classList.remove("is-active"));

    if (!communityOpen) return;

    const activeButton =
      activeTab === "chatboard"
        ? document.getElementById(CHATBOARD_BUTTON_ID)
        : document.getElementById(REVIEWS_BUTTON_ID);

    activeButton?.classList.add("is-active");
  }

  function renderCommunity(route) {
    if (!root || !route) return;

    const nextKey = `${route.source}:${route.value}:${activeTab}`;
    if (renderedKey === nextKey) return;

    renderedKey = nextKey;
    root.render(
      <ShowCommunityContent
        supabase={supabase}
        route={route}
        activeTab={activeTab}
      />
    );
  }

  function openCommunity(tabName, { updateUrl = true, scroll = true } = {}) {
    const previousTab = activeTab;
    const wasOpen = communityOpen;
    const { route, tabSection, tabList, nativePanel } = getPageParts();

    if (!route || !tabSection || !tabList) return;
    if (!ensureHost(tabSection)) return;

    activeTab = tabName === "chatboard" ? "chatboard" : "reviews";
    communityOpen = true;

    if (updateUrl) updateUrlTab(activeTab);

    if (nativePanel) nativePanel.style.display = "none";
    host.style.display = "";

    updateButtonState(tabList);
    renderCommunity(route);

    const shouldScroll = scroll && (!wasOpen || previousTab !== activeTab);
    if (shouldScroll) {
      window.clearTimeout(scrollTimer);
      scrollTimer = window.setTimeout(() => {
        host?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 120);
    }
  }

  function closeCommunity({ clearQuery = true } = {}) {
    const { tabList, nativePanel } = getPageParts();

    communityOpen = false;
    if (clearQuery) clearUrlTab();

    if (host) host.style.display = "none";
    if (nativePanel) nativePanel.style.display = "";

    if (tabList) {
      tabList
        .querySelectorAll(".msd-content-tab")
        .forEach((button) => button.classList.remove("is-active"));

      const seasonsButton = Array.from(
        tabList.querySelectorAll(".msd-content-tab")
      ).find(
        (button) =>
          String(button.textContent || "").trim().toLowerCase() === "seasons"
      );
      seasonsButton?.classList.add("is-active");
    }
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
      openCommunity(tabName, { updateUrl: true, scroll: true });
    });
    return button;
  }

  function ensureButtons(tabList) {
    if (!tabList) return;

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

    if (!tabList.dataset.burgrsCommunityNativeTabs) {
      tabList.dataset.burgrsCommunityNativeTabs = "1";
      tabList.addEventListener("click", (event) => {
        const button = event.target.closest("button");
        if (!button) return;
        if (
          button.id === REVIEWS_BUTTON_ID ||
          button.id === CHATBOARD_BUTTON_ID
        ) {
          return;
        }

        closeCommunity({ clearQuery: true });
      });
    }
  }

  function removePortal() {
    window.clearTimeout(scrollTimer);

    if (root) root.unmount();
    root = null;

    if (host?.isConnected) host.remove();
    host = null;

    document.getElementById(REVIEWS_BUTTON_ID)?.remove();
    document.getElementById(CHATBOARD_BUTTON_ID)?.remove();

    communityOpen = false;
    renderedKey = "";
  }

  function sync() {
    const { route, tabSection, tabList, nativePanel } = getPageParts();

    if (!route || !tabSection || !tabList) {
      if (!route) removePortal();
      return;
    }

    ensureHost(tabSection);
    ensureButtons(tabList);

    const requestedTab = getRequestedCommunityTab();
    if (requestedTab) {
      openCommunity(requestedTab, {
        updateUrl: false,
        scroll: !communityOpen,
      });
      return;
    }

    if (communityOpen) {
      if (nativePanel) nativePanel.style.display = "none";
      if (host) host.style.display = "";
      updateButtonState(tabList);
      renderCommunity(route);
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
