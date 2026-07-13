const STUDIO_SEARCH_FLAG = "burgrs-studio-search:";

function getStudioQueryFromLocation() {
  if (window.location.pathname !== "/search") return "";
  return new URLSearchParams(window.location.search).get("studio")?.trim() || "";
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
        link.setAttribute("href", `${url.pathname}?${url.searchParams.toString()}`);
      } catch {
        // Leave malformed links unchanged.
      }
    });
}

function setReactInputValue(input, value) {
  const prototype = Object.getPrototypeOf(input);
  const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
  descriptor?.set?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function runStudioSearchFromUrl() {
  const studio = getStudioQueryFromLocation();
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

const observer = new MutationObserver(scheduleFixes);
observer.observe(document.documentElement, { childList: true, subtree: true });

window.addEventListener("popstate", scheduleFixes);
window.addEventListener("pageshow", scheduleFixes);

scheduleFixes();
