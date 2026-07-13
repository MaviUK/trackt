const STUDIO_SEARCH_FLAG = "burgrs-studio-search:";

function getStudioParamsFromLocation() {
  if (window.location.pathname !== "/search") {
    return { studio: "", sourceShowId: "", sourceType: "" };
  }

  const params = new URLSearchParams(window.location.search);
  return {
    studio: params.get("studio")?.trim() || "",
    sourceShowId: params.get("sourceShowId")?.trim() || "",
    sourceType: params.get("sourceType")?.trim() || "",
  };
}

function inferSourceType() {
  if (/\/(?:my-shows|show)\/tmdb\//.test(window.location.pathname)) {
    return "tmdb";
  }
  if (/\/(?:my-shows|show)\//.test(window.location.pathname)) {
    return "tvdb";
  }
  return "";
}

function inferSourceShowId() {
  const match = window.location.pathname.match(
    /\/(?:my-shows|show)\/(?:tmdb\/)?([^/?#]+)/
  );
  return match?.[1] || "";
}

function rewriteStudioLinks() {
  document
    .querySelectorAll('.msd-info-card a[href^="/search?network="]')
    .forEach((link) => {
      try {
        const url = new URL(link.getAttribute("href"), window.location.origin);
        const studio = url.searchParams.get("network")?.trim();
        if (!studio) return;

        url.searchParams.delete("network");
        url.searchParams.set("studio", studio);

        const sourceType = inferSourceType();
        const sourceShowId =
          url.searchParams.get("sourceShowId")?.trim() || inferSourceShowId();

        if (sourceType) url.searchParams.set("sourceType", sourceType);
        if (sourceShowId) url.searchParams.set("sourceShowId", sourceShowId);

        link.setAttribute("href", `${url.pathname}?${url.searchParams.toString()}`);
      } catch {
        // Leave malformed links unchanged.
      }
    });
}

function installStudioFetchBridge() {
  if (window.__burgrsStudioFetchBridgeInstalled) return;
  window.__burgrsStudioFetchBridgeInstalled = true;

  const originalFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    try {
      const rawUrl = typeof input === "string" ? input : input?.url;
      if (rawUrl && rawUrl.includes("/.netlify/functions/advancedSearchShows")) {
        const requestUrl = new URL(rawUrl, window.location.origin);
        const isStudioSearch = requestUrl.searchParams.get("mode") === "studio";

        if (isStudioSearch) {
          const studioUrl = new URL(
            "/.netlify/functions/studioCatalogueSearch",
            window.location.origin
          );

          const { sourceShowId, sourceType } = getStudioParamsFromLocation();
          const query = requestUrl.searchParams.get("q") || "";
          const page = requestUrl.searchParams.get("page") || "1";

          studioUrl.searchParams.set("q", query);
          studioUrl.searchParams.set("page", page);
          if (sourceShowId) {
            studioUrl.searchParams.set("sourceShowId", sourceShowId);
          }
          if (sourceType) {
            studioUrl.searchParams.set("sourceType", sourceType);
          }

          const bridgedUrl = studioUrl.pathname + studioUrl.search;
          if (typeof input === "string") return originalFetch(bridgedUrl, init);
          return originalFetch(new Request(bridgedUrl, input), init);
        }
      }
    } catch {
      // Fall through to the original request unchanged.
    }

    return originalFetch(input, init);
  };
}

function setReactInputValue(input, value) {
  const prototype = Object.getPrototypeOf(input);
  const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
  descriptor?.set?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function runStudioSearchFromUrl() {
  const { studio } = getStudioParamsFromLocation();
  if (!studio) return;

  const runKey = `${STUDIO_SEARCH_FLAG}${window.location.pathname}${window.location.search}`;
  if (window.sessionStorage.getItem(runKey) === "done") return;

  const buttons = Array.from(document.querySelectorAll(".search-mode-button"));
  const studioButton = buttons.find(
    (button) => button.textContent?.trim().toLowerCase() === "studio"
  );
  const input = document.querySelector(".search-page-input");
  const searchButton = document.querySelector(".search-page-button");

  if (!studioButton || !input || !searchButton) return;

  studioButton.click();

  window.setTimeout(() => {
    const refreshedInput = document.querySelector(".search-page-input");
    const refreshedSearchButton = document.querySelector(".search-page-button");
    if (!refreshedInput || !refreshedSearchButton) return;

    setReactInputValue(refreshedInput, studio);

    window.setTimeout(() => {
      window.sessionStorage.setItem(runKey, "done");
      refreshedSearchButton.click();
    }, 80);
  }, 80);
}

function scheduleFixes() {
  window.requestAnimationFrame(() => {
    rewriteStudioLinks();
    runStudioSearchFromUrl();
  });
}

installStudioFetchBridge();

const observer = new MutationObserver(scheduleFixes);
observer.observe(document.documentElement, { childList: true, subtree: true });

window.addEventListener("popstate", scheduleFixes);
window.addEventListener("pageshow", scheduleFixes);

scheduleFixes();
