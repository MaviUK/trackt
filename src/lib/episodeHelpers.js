export function getEpisodeSeason(ep) {
  return (
    ep?.seasonNumber ??
    ep?.season_number ??
    ep?.season ??
    ep?.airedSeason ??
    0
  );
}

export function getEpisodeNumber(ep) {
  return (
    ep?.number ??
    ep?.episodeNumber ??
    ep?.episode_number ??
    ep?.airedEpisodeNumber ??
    0
  );
}

export function getEpisodeAirDate(ep) {
  return ep?.airDate ?? ep?.aired ?? null;
}

export function normalizeEpisodes(episodes = []) {
  return episodes
    .map((ep) => {
      const seasonNumber = Number(getEpisodeSeason(ep) || 0);
      const number = Number(getEpisodeNumber(ep) || 0);

      return {
        ...ep,
        seasonNumber,
        number,
        airDate: getEpisodeAirDate(ep),
      };
    })
    .filter((ep) => ep.seasonNumber > 0)
    .sort((a, b) => {
      if (a.seasonNumber !== b.seasonNumber) {
        return a.seasonNumber - b.seasonNumber;
      }
      return a.number - b.number;
    });
}

export function makeEpisodeCode(ep) {
  const season = getEpisodeSeason(ep);
  const episodeNum = getEpisodeNumber(ep);

  if (!season || !episodeNum) return null;

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
