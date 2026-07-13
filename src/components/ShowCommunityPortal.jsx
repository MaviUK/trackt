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

function ShowCommunityPanel({
  supabase,
  pathname,
  activeTab,
  onAvailabilityChange,
}) {
  const [databaseShow, setDatabaseShow] = useState(null);
  const [currentUserId, setCurrentUserId] = useState(null);
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
          onAvailabilityChange(false);
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
        onAvailabilityChange(Boolean(showRow?.id));
      } catch (loadError) {
        if (cancelled) return;
        console.warn("Failed loading show community:", loadError);
        setDatabaseShow(null);
        setError(loadError?.message || "Failed loading show community.");
        onAvailabilityChange(false);
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
  }, [pathname, supabase, onAvailabilityChange]);

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

  let root = null;
  let host = null;
  let activeCommunityTab = "reviews";
  let renderedPathname = "";
  let renderedTab = "";
  let frameId = null;
  let communityAvailable = false;

  function setNativePanelVisible(visible) {
    const nativePanel = document.querySelector(
      ".msd-page .msd-content-tabs-section .msd-tab-panel"
    );
    if (nativePanel) nativePanel.style.display = visible ? "" : "none";
  }

  function setCommunityVisible(visible) {
    if (host) host.style.display = visible ? "" : "none";
  }

  function updateButtonState() {
    const reviewsButton = document.getElementById(REVIEWS_BUTTON_ID);
    const chatboardButton = document.getElementById(CHATBOARD_BUTTON_ID);

    [reviewsButton, chatboardButton].forEach((button) => {
      if (!button) return;
      button.style.display = communityAvailable ? "" : "none";
      button.classList.remove("is-active");
    });

    if (!host || host.style.display === "none") return;

    if (activeCommunityTab === "chatboard") {
      chatboardButton?.classList.add("is-active");
    } else {
      reviewsButton?.classList.add("is-active");
    }
  }

  function handleAvailabilityChange(available) {
    communityAvailable = Boolean(available);
    updateButtonState();

    if (!communityAvailable) {
      setCommunityVisible(false);
      setNativePanelVisible(true);
    }
  }

  function renderPortal(force = false) {
    if (!root) return;

    const pathname = window.location.pathname;
    if (
      !force &&
      renderedPathname === pathname &&
      renderedTab === activeCommunityTab
    ) {
      return;
    }

    renderedPathname = pathname;
    renderedTab = activeCommunityTab;

    root.render(
      <ShowCommunityPanel
        supabase={supabase}
        pathname={pathname}
        activeTab={activeCommunityTab}
        onAvailabilityChange={handleAvailabilityChange}
      />
    );
  }

  function selectCommunityTab(tabName) {
    activeCommunityTab = tabName;

    const tabList = document.querySelector(
      ".msd-page .msd-content-tabs-section .msd-content-tabs"
    );
    tabList
      ?.querySelectorAll(".msd-content-tab")
      .forEach((button) => button.classList.remove("is-active"));

    setNativePanelVisible(false);
    setCommunityVisible(true);
    updateButtonState();
    renderPortal(true);

    host?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function createCommunityButton(id, label, tabName) {
    const button = document.createElement("button");
    button.id = id;
    button.type = "button";
    button.className = "msd-content-tab";
    button.textContent = label;
    button.style.display = communityAvailable ? "" : "none";
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      selectCommunityTab(tabName);
    });
    return button;
  }

  function ensureCommunityButtons(tabList) {
    let reviewsButton = document.getElementById(REVIEWS_BUTTON_ID);
    if (!reviewsButton) {
      reviewsButton = createCommunityButton(
        REVIEWS_BUTTON_ID,
        "Reviews",
        "reviews"
      );
      tabList.appendChild(reviewsButton);
    }

    let chatboardButton = document.getElementById(CHATBOARD_BUTTON_ID);
    if (!chatboardButton) {
      chatboardButton = createCommunityButton(
        CHATBOARD_BUTTON_ID,
        "Chatboard",
        "chatboard"
      );
      tabList.appendChild(chatboardButton);
    }

    if (!tabList.dataset.burgrsCommunityNativeListener) {
      tabList.dataset.burgrsCommunityNativeListener = "1";
      tabList.addEventListener("click", (event) => {
        const clickedButton = event.target.closest("button");
        if (!clickedButton) return;
        if (
          clickedButton.id === REVIEWS_BUTTON_ID ||
          clickedButton.id === CHATBOARD_BUTTON_ID
        ) {
          return;
        }

        setCommunityVisible(false);
        setNativePanelVisible(true);
        updateButtonState();
      });
    }

    updateButtonState();
  }

  function removePortal() {
    if (root) root.unmount();
    root = null;

    if (host?.isConnected) host.remove();
    host = null;

    document.getElementById(REVIEWS_BUTTON_ID)?.remove();
    document.getElementById(CHATBOARD_BUTTON_ID)?.remove();

    renderedPathname = "";
    renderedTab = "";
    communityAvailable = false;
  }

  function syncPortal() {
    const pathname = window.location.pathname;
    const route = getPublicShowRoute(pathname);
    const shell = document.querySelector(".msd-page .msd-shell");
    const tabSection = shell?.querySelector(".msd-content-tabs-section");
    const tabList = tabSection?.querySelector(".msd-content-tabs");

    if (!route || !shell || !tabSection || !tabList) {
      if (!route) removePortal();
      return;
    }

    if (!host || !host.isConnected) {
      host = document.createElement("div");
      host.id = HOST_ID;
      host.className = "msd-community-portal-host";
      host.style.display = "none";
      tabSection.insertAdjacentElement("afterend", host);
      root = createRoot(host);
      renderedPathname = "";
      renderedTab = "";
    } else if (host.previousElementSibling !== tabSection) {
      tabSection.insertAdjacentElement("afterend", host);
    }

    ensureCommunityButtons(tabList);
    renderPortal();
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
