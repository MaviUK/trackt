/*
  fixMyShowDetails.js

  Run:
    node fixMyShowDetails.js
*/

const fs = require("fs");
const path = require("path");

const filePath = path.join(process.cwd(), "src", "pages", "MyShowDetails.jsx");

if (!fs.existsSync(filePath)) {
  console.error("Could not find src/pages/MyShowDetails.jsx");
  process.exit(1);
}

let file = fs.readFileSync(filePath, "utf8");

function replaceOnce(label, before, after) {
  if (!file.includes(before)) {
    console.error(`Could not find block: ${label}`);
    process.exit(1);
  }

  file = file.replace(before, after);
  console.log(`Updated: ${label}`);
}

replaceOnce(
  "createWatchedLookup",
`function createWatchedLookup(rows) {
  return {
    byEpisodeId: new Set(
      (rows || [])
        .map((row) => row?.episode_id)
        .filter(Boolean)
        .map(String)
    ),
  };
}`,
`function createWatchedLookup(rows, assumeAllWatched = false) {
  return {
    assumeAllWatched,
    byEpisodeId: new Set(
      (rows || [])
        .map((row) => row?.episode_id)
        .filter(Boolean)
        .map(String)
    ),
  };
}`
);

replaceOnce(
  "isEpisodeWatched",
`function isEpisodeWatched(ep, watchedLookup) {
  if (!ep?.id) return false;
  return watchedLookup.byEpisodeId.has(String(ep.id));
}`,
`function isEpisodeWatched(ep, watchedLookup) {
  if (!ep?.id) return false;
  if (watchedLookup?.assumeAllWatched) return true;
  return watchedLookup.byEpisodeId.has(String(ep.id));
}`
);

replaceOnce(
  "watchedLookup useMemo",
`  const watchedLookup = useMemo(
    () => createWatchedLookup(watchedRows),
    [watchedRows]
  );`,
`  const watchedLookup = useMemo(
    () => createWatchedLookup(watchedRows, show?.watch_status === "completed"),
    [watchedRows, show?.watch_status]
  );`
);

replaceOnce(
  "syncWatchStatus desiredStatus",
`      let desiredStatus = "watchlist";

      if (stats.total > 0 && stats.watched >= stats.total) {
        desiredStatus = "completed";
      } else if (stats.watched > 0) {
        desiredStatus = "watching";
      }

      if (show.watch_status === desiredStatus) return;`,
`      let desiredStatus = show.watch_status || "watchlist";

      if (stats.total > 0 && stats.watched >= stats.total) {
        desiredStatus = "completed";
      } else if (stats.watched > 0) {
        desiredStatus = "watching";
      } else if (show.watch_status === "completed") {
        return;
      } else {
        desiredStatus = "watchlist";
      }

      if (show.watch_status === desiredStatus) return;`
);

fs.writeFileSync(filePath, file, "utf8");

console.log("Done.");