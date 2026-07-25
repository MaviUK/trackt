let attributionScheduled = false;

function addShowDataAttribution() {
  const pathname = window.location.pathname;
  const isShowPage = /^\/show\/(?:tmdb\/)?[^/]+\/?$/.test(pathname);

  if (!isShowPage) {
    document.querySelectorAll(".show-data-attribution").forEach((item) => item.remove());
    return;
  }

  const shell = document.querySelector(".msd-page .msd-shell");
  if (!shell) return;

  let attribution = document.querySelector(".show-data-attribution");

  if (!attribution) {
    attribution = document.createElement("p");
    attribution.className = "show-data-attribution";
    attribution.innerHTML =
      'TV metadata from <a href="https://www.themoviedb.org/" target="_blank" rel="noopener noreferrer">TMDB</a> and <a href="https://thetvdb.com/" target="_blank" rel="noopener noreferrer">TheTVDB</a>. Streaming availability powered by <a href="https://www.justwatch.com/uk" target="_blank" rel="noopener noreferrer">JustWatch</a>. <a href="/credits/">Credits</a>';
  }

  if (attribution.parentElement === shell && shell.lastElementChild === attribution) {
    return;
  }

  shell.appendChild(attribution);
}

function scheduleShowDataAttribution() {
  if (attributionScheduled) return;
  attributionScheduled = true;

  window.requestAnimationFrame(() => {
    attributionScheduled = false;
    addShowDataAttribution();
  });
}

const showDataAttributionObserver = new MutationObserver(scheduleShowDataAttribution);
showDataAttributionObserver.observe(document.documentElement, {
  childList: true,
  subtree: true,
});

window.addEventListener("popstate", scheduleShowDataAttribution);
window.addEventListener("pageshow", scheduleShowDataAttribution);
scheduleShowDataAttribution();