import { supabase } from "./lib/supabase";

const CACHE_KEY = "trackt_premiering_soon_v2";
const CACHE_DURATION = 1000 * 60 * 60 * 6;

function readCache() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(CACHE_KEY) || "null");
    if (!parsed?.savedAt || !Array.isArray(parsed?.shows)) return null;
    if (Date.now() - Number(parsed.savedAt) >= CACHE_DURATION) return null;
    return parsed.shows;
  } catch {
    return null;
  }
}

function writeCache(shows) {
  try {
    window.localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ savedAt: Date.now(), shows })
    );
  } catch {
    // Ignore storage failures.
  }
}

function normalizeDate(value) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatCountdown(value) {
  const date = normalizeDate(value);
  if (!date) return "Coming soon";

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((date - today) / 86400000);

  if (days <= 0) return "Today";
  if (days === 1) return "Tomorrow";
  return `In ${days} days`;
}

function formatDate(value) {
  const date = normalizeDate(value);
  if (!date) return "";

  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

async function loadShows() {
  const cached = readCache();
  if (cached) return cached;

  const response = await fetch("/.netlify/functions/getPremieringSoonShows");
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload?.message || "Failed to load upcoming shows");
  }

  const shows = Array.isArray(payload?.shows) ? payload.shows : [];
  writeCache(shows);
  return shows;
}

async function getSavedTmdbIds() {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return new Set();

  const { data, error } = await supabase
    .from("user_shows_new")
    .select("shows!inner(tmdb_id)")
    .eq("user_id", user.id);

  if (error) {
    console.warn("Failed loading saved premiere badges", error);
    return new Set();
  }

  return new Set(
    (data || [])
      .map((row) => row?.shows?.tmdb_id)
      .filter(Boolean)
      .map(String)
  );
}

function findSection() {
  return [...document.querySelectorAll(".trending-section")].find(
    (section) => section.querySelector("h2")?.textContent?.trim() === "Premiering Soon"
  );
}

function createCard(show, savedTmdbIds) {
  const tmdbId = show?.tmdb_id || show?.id;
  const isSaved = savedTmdbIds.has(String(tmdbId));
  const link = document.createElement("a");
  link.className = "premiere-card";
  link.href = isSaved ? `/my-shows/tmdb/${tmdbId}` : `/show/tmdb/${tmdbId}`;

  const posterWrap = document.createElement("div");
  posterWrap.className = "premiere-card-poster-wrap";

  const image = document.createElement("img");
  image.className = "premiere-card-image";
  image.src = show?.poster_url || show?.image || "";
  image.alt = show?.name || "Upcoming show";
  image.loading = "lazy";
  image.decoding = "async";
  posterWrap.appendChild(image);

  const countdown = document.createElement("span");
  countdown.className = "premiere-countdown";
  countdown.textContent = formatCountdown(show?.first_air_date);
  posterWrap.appendChild(countdown);

  if (isSaved) {
    const savedBadge = document.createElement("span");
    savedBadge.className = "premiere-saved-badge";
    savedBadge.textContent = "In My Shows";
    posterWrap.appendChild(savedBadge);
  }

  const copy = document.createElement("div");
  copy.className = "premiere-card-copy";

  const title = document.createElement("strong");
  title.textContent = show?.name || "Unknown show";

  const date = document.createElement("span");
  date.textContent = formatDate(show?.first_air_date);

  copy.append(title, date);
  link.append(posterWrap, copy);
  return link;
}

async function enhanceSection() {
  const section = findSection();
  if (!section || section.dataset.premiereEnhanced === "true") return;

  section.dataset.premiereEnhanced = "true";
  const heading = section.querySelector("h2");
  if (heading) heading.textContent = "New Shows Coming Soon";

  const oldRow = section.querySelector(".trending-row");
  const empty = section.querySelector(".empty-state");
  if (oldRow) oldRow.remove();
  if (empty) empty.remove();

  const loading = document.createElement("p");
  loading.className = "empty-state premiere-loading";
  loading.textContent = "Loading upcoming shows...";
  section.appendChild(loading);

  try {
    const [shows, savedTmdbIds] = await Promise.all([
      loadShows(),
      getSavedTmdbIds(),
    ]);

    loading.remove();

    if (!shows.length) {
      const message = document.createElement("p");
      message.className = "empty-state";
      message.textContent = "No new shows are scheduled in the next 30 days.";
      section.appendChild(message);
      return;
    }

    const row = document.createElement("div");
    row.className = "premiere-row";
    shows.forEach((show) => row.appendChild(createCard(show, savedTmdbIds)));
    section.appendChild(row);
  } catch (error) {
    console.error("Failed enhancing Premiering Soon", error);
    loading.textContent = "Upcoming shows could not be loaded right now.";
  }
}

const observer = new MutationObserver(enhanceSection);
observer.observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener("popstate", () => window.setTimeout(enhanceSection, 0));
enhanceSection();
