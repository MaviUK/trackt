import { Capacitor } from "@capacitor/core";

const LIVE_SITE_ORIGIN = "https://burgrs.co.uk";
const NETLIFY_FUNCTION_PREFIX = "/.netlify/functions/";

function getRequestUrl(input) {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input?.url || "";
}

function cloneRequestWithUrl(input, url) {
  if (typeof Request !== "undefined" && input instanceof Request) {
    return new Request(url, input);
  }

  return url;
}

export function installNativeApiBridge() {
  if (typeof window === "undefined") return;
  if (!Capacitor.isNativePlatform()) return;
  if (window.__BURGRS_NATIVE_API_BRIDGE_INSTALLED__) return;

  const originalFetch = window.fetch.bind(window);

  window.fetch = (input, init) => {
    try {
      const rawUrl = getRequestUrl(input);
      const parsedUrl = new URL(rawUrl, window.location.origin);

      if (!parsedUrl.pathname.startsWith(NETLIFY_FUNCTION_PREFIX)) {
        return originalFetch(input, init);
      }

      const liveUrl = `${LIVE_SITE_ORIGIN}${parsedUrl.pathname}${parsedUrl.search}${parsedUrl.hash}`;
      const rewrittenInput = cloneRequestWithUrl(input, liveUrl);

      return originalFetch(rewrittenInput, init);
    } catch (error) {
      console.error("Failed to rewrite native API request", error);
      return originalFetch(input, init);
    }
  };

  window.__BURGRS_NATIVE_API_BRIDGE_INSTALLED__ = true;
}
