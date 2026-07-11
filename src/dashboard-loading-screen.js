const DASHBOARD_LOADER_ID = "dashboard-loading-screen";

function buildPosterSkeletons() {
  return Array.from({ length: 4 }, () =>
    '<div class="dashboard-loader-poster dashboard-loader-shimmer"></div>'
  ).join("");
}

function buildStatSkeletons() {
  const labels = ["Total Shows", "In Progress", "Completed", "Time Watched"];

  return labels
    .map(
      (label) => `
        <div class="dashboard-loader-stat">
          <span>${label}</span>
          <div class="dashboard-loader-stat-value dashboard-loader-shimmer"></div>
        </div>
      `
    )
    .join("");
}

function buildEpisodeSkeletons() {
  return Array.from({ length: 4 }, () =>
    `<div class="dashboard-loader-episode">
      <div class="dashboard-loader-episode-poster dashboard-loader-shimmer"></div>
      <div class="dashboard-loader-episode-copy">
        <div class="dashboard-loader-line dashboard-loader-line-title dashboard-loader-shimmer"></div>
        <div class="dashboard-loader-line dashboard-loader-line-wide dashboard-loader-shimmer"></div>
        <div class="dashboard-loader-line dashboard-loader-line-medium dashboard-loader-shimmer"></div>
      </div>
    </div>`
  ).join("");
}

function createDashboardLoader() {
  const overlay = document.createElement("div");
  overlay.id = DASHBOARD_LOADER_ID;
  overlay.className = "dashboard-loading-screen";
  overlay.setAttribute("role", "status");
  overlay.setAttribute("aria-live", "polite");
  overlay.setAttribute("aria-label", "Loading dashboard");

  overlay.innerHTML = `
    <div class="dashboard-loader-content">
      <span class="dashboard-loader-screen-reader-text">Loading dashboard...</span>

      <section class="dashboard-loader-section" aria-hidden="true">
        <h2>Trending Shows</h2>
        <div class="dashboard-loader-posters">${buildPosterSkeletons()}</div>
      </section>

      <section class="dashboard-loader-section" aria-hidden="true">
        <h2>New Shows Premiering This Week</h2>
        <div class="dashboard-loader-posters">${buildPosterSkeletons()}</div>
      </section>

      <div class="dashboard-loader-stats" aria-hidden="true">
        ${buildStatSkeletons()}
      </div>

      <section class="dashboard-loader-section dashboard-loader-airing" aria-hidden="true">
        <h2>Airing This Week</h2>
        <div class="dashboard-loader-episodes">${buildEpisodeSkeletons()}</div>
      </section>
    </div>
  `;

  return overlay;
}

function dashboardIsLoading() {
  const dashboardPage = document.querySelector(".page.dashboard-page");
  if (!dashboardPage) return false;

  return [...dashboardPage.querySelectorAll(":scope > p")].some((paragraph) =>
    paragraph.textContent?.trim().toLowerCase().includes("loading dashboard")
  );
}

function syncDashboardLoader() {
  const existing = document.getElementById(DASHBOARD_LOADER_ID);

  if (dashboardIsLoading()) {
    if (!existing) document.body.appendChild(createDashboardLoader());
    return;
  }

  existing?.remove();
}

let pendingFrame = null;

function scheduleDashboardLoaderSync() {
  if (pendingFrame != null) return;

  pendingFrame = window.requestAnimationFrame(() => {
    pendingFrame = null;
    syncDashboardLoader();
  });
}

const observer = new MutationObserver(scheduleDashboardLoaderSync);
observer.observe(document.documentElement, {
  childList: true,
  subtree: true,
});

window.addEventListener("popstate", scheduleDashboardLoaderSync);
window.addEventListener("pageshow", scheduleDashboardLoaderSync);
scheduleDashboardLoaderSync();
