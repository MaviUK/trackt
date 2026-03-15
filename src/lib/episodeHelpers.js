export function makeEpisodeCode(ep) {
  const season =
    ep?.seasonNumber ??
    ep?.season_number ??
    ep?.season ??
    ep?.airedSeason;

  const episodeNum =
    ep?.number ??
    ep?.episodeNumber ??
    ep?.episode_number ??
    ep?.airedEpisodeNumber;

  if (season == null || episodeNum == null) return null;

  return `S${String(season).padStart(2, "0")}E${String(episodeNum).padStart(2, "0")}`;
}

export function buildWatchedSets(rows = []) {
  const watchedCodes = new Set();
  const watchedIds = new Set();

  for (const row of rows) {
    if (row?.episode_code) watchedCodes.add(String(row.episode_code).toUpperCase());
    if (row?.episode_id != null) watchedIds.add(String(row.episode_id));
  }

  return { watchedCodes, watchedIds };
}

export function isEpisodeWatched(ep, watchedSets) {
  const code = makeEpisodeCode(ep);
  if (code && watchedSets.watchedCodes.has(code.toUpperCase())) return true;

  const id = ep?.id != null ? String(ep.id) : null;
  if (id && watchedSets.watchedIds.has(id)) return true;

  return false;
}
