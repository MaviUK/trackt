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
  return ep?.airDate ?? ep?.air_date ?? ep?.aired ?? null;
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

export function createEmptyWatchedLookup() {
  return {
    watchedCodes: new Set(),
    watchedIds: new Set(),
    watchedRowIds: new Set(),
    watchedSeasonEpisodes: new Set(),
  };
}

export function buildWatchedSets(rows = []) {
  const lookup = createEmptyWatchedLookup();

  for (const row of rows) {
    if (row?.episode_code) lookup.watchedCodes.add(String(row.episode_code).toUpperCase());
    if (row?.episode_id != null) lookup.watchedIds.add(String(row.episode_id));
    if (row?.episode_row_id != null) lookup.watchedRowIds.add(String(row.episode_row_id));

    const season = row?.season_number;
    const episode = row?.episode_number;
    if (season != null && episode != null) {
      lookup.watchedSeasonEpisodes.add(`${season}-${episode}`);
    }
  }

  return lookup;
}

export function isEpisodeWatched(ep, watchedSets) {
  const code = makeEpisodeCode(ep);
  if (code && watchedSets.watchedCodes.has(code.toUpperCase())) return true;

  const rowId = ep?.id != null ? String(ep.id) : null;
  if (rowId && watchedSets.watchedRowIds.has(rowId)) return true;

  const tvdbId = ep?.tvdb_episode_id != null ? String(ep.tvdb_episode_id) : ep?.id != null ? String(ep.id) : null;
  if (tvdbId && watchedSets.watchedIds.has(tvdbId)) return true;

  const season = getEpisodeSeason(ep);
  const episodeNum = getEpisodeNumber(ep);
  if (season && episodeNum && watchedSets.watchedSeasonEpisodes.has(`${season}-${episodeNum}`)) return true;

  return false;
}
