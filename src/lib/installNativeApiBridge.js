import { Capacitor, CapacitorHttp } from "@capacitor/core";

const LIVE_SITE_ORIGIN = "https://burgrs.co.uk";
const NETLIFY_FUNCTION_PREFIX = "/.netlify/functions/";

function headersToObject(headers) {
  if (!headers) return {};
  if (headers instanceof Headers) return Object.fromEntries(headers.entries());
  if (Array.isArray(headers)) return Object.fromEntries(headers);
  return { ...headers };
}

function bodyToData(body, headers) {
  if (body == null) return undefined;
  if (typeof body !== "string") return body;

  const contentType = String(
    headers["content-type"] || headers["Content-Type"] || ""
  ).toLowerCase();

  if (contentType.includes("application/json")) {
    try {
      return JSON.parse(body);
    } catch {
      return body;
    }
  }

  return body;
}

function makeWebResponse(result) {
  const responseHeaders = new Headers(result.headers || {});
  const data = result.data;
  const body =
    typeof data === "string" || data == null ? data ?? "" : JSON.stringify(data);

  if (typeof data === "object" && data != null && !responseHeaders.has("content-type")) {
    responseHeaders.set("content-type", "application/json");
  }

  return new Response(body, {
    status: Number(result.status || 200),
    headers: responseHeaders,
  });
}

export function installNativeApiBridge() {
  if (!Capacitor.isNativePlatform() || typeof window === "undefined") return;
  if (window.__BURGRS_NATIVE_API_BRIDGE_INSTALLED__) return;

  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input, init = {}) => {
    const rawUrl =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input?.url || "";

    const parsedUrl = new URL(rawUrl, window.location.origin);

    if (!parsedUrl.pathname.startsWith(NETLIFY_FUNCTION_PREFIX)) {
      return originalFetch(input, init);
    }

    const requestHeaders = headersToObject(
      init.headers || (typeof input === "object" ? input?.headers : undefined)
    );
    const method = String(
      init.method || (typeof input === "object" ? input?.method : "GET") || "GET"
    ).toUpperCase();
    const requestBody =
      init.body !== undefined
        ? init.body
        : typeof input === "object"
          ? input?.body
          : undefined;

    const result = await CapacitorHttp.request({
      url: `${LIVE_SITE_ORIGIN}${parsedUrl.pathname}${parsedUrl.search}`,
      method,
      headers: requestHeaders,
      data: bodyToData(requestBody, requestHeaders),
      responseType: "json",
    });

    return makeWebResponse(result);
  };

  window.__BURGRS_NATIVE_API_BRIDGE_INSTALLED__ = true;
}
