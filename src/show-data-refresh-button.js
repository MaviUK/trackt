import { supabase } from "./lib/supabase";
import { refreshShowData } from "./lib/refreshShowData";

const BUTTON_ID = "refresh-show-data-button";

function getRouteIdentity() {
  const path = window.location.pathname;
  const tmdbMatch = path.match(/^\/my-shows\/tmdb\/(\d+)/);
  if (tmdbMatch) return { type: "tmdb_id", value: Number(tmdbMatch[1]) };

  const tvdbMatch = path.match(/^\/my-shows\/(\d+)/);
  if (tvdbMatch) return { type: "tvdb_id", value: Number(tvdbMatch[1]) };

  return null;
}

async function getShowForCurrentRoute() {
  const identity = getRouteIdentity();
  if (!identity) return null;

  const { data, error } = await supabase
    .from("shows")
    .select("id, tvdb_id, tmdb_id, name")
    .eq(identity.type, identity.value)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

function removeButton() {
  document.getElementById(BUTTON_ID)?.closest(".show-data-refresh-row")?.remove();
}

function createButton() {
  const row = document.createElement("div");
  row.className = "show-data-refresh-row";

  const button = document.createElement("button");
  button.id = BUTTON_ID;
  button.type = "button";
  button.className = "show-data-refresh-button";
  button.textContent = "Refresh Show Data";

  button.addEventListener("click", async () => {
    if (button.disabled) return;

    button.disabled = true;
    button.textContent = "Refreshing seasons and episodes...";

    try {
      const show = await getShowForCurrentRoute();
      if (!show) throw new Error("Show could not be found in the database");

      const result = await refreshShowData(show);
      button.textContent = `Updated ${result.seasonCount} seasons and ${result.episodeCount} episodes`;

      window.setTimeout(() => window.location.reload(), 900);
    } catch (error) {
      console.error("Show refresh failed:", error);
      button.disabled = false;
      button.textContent = "Refresh failed — try again";
      window.alert(error?.message || "Failed to refresh show data");
    }
  });

  row.appendChild(button);
  return row;
}

function installButton() {
  const identity = getRouteIdentity();
  if (!identity) {
    removeButton();
    return;
  }

  if (document.getElementById(BUTTON_ID)) return;

  const tabsSection = document.querySelector(".msd-content-tabs-section");
  if (!tabsSection?.parentElement) return;

  tabsSection.parentElement.insertBefore(createButton(), tabsSection);
}

let lastPath = window.location.pathname;

const observer = new MutationObserver(() => {
  if (lastPath !== window.location.pathname) {
    lastPath = window.location.pathname;
    removeButton();
  }

  installButton();
});

observer.observe(document.documentElement, {
  childList: true,
  subtree: true,
});

window.addEventListener("popstate", () => {
  removeButton();
  window.setTimeout(installButton, 0);
});

installButton();
