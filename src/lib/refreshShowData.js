import { supabase } from "./supabase";

function normalizeDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function normalizePositiveNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function episodeKey(episode) {
  const seasonNumber = Number(
    episode?.seasonNumber ?? episode?.season_number ?? -1
  );
  const episodeNumber = Number(episode?.number ?? episode?.episode_number ?? -1);

  if (seasonNumber < 0 || episodeNumber <= 0) return null;
  return `${seasonNumber}|${episodeNumber}`;
}

function mergeEpisodes(tvdbEpisodes, tmdbEpisodes) {
  const merged = new Map();

  for (const episode of tmdbEpisodes || []) {
    const key = episodeKey(episode);
    if (!key) continue;
    merged.set(key, episode);
  }

  for (const episode of tvdbEpisodes || []) {
    const key = episodeKey(episode);
    if (!key) continue;

    const fallback = merged.get(key) || {};

    merged.set(key, {
      ...fallback,
      ...episode,
      name: episode?.name || fallback?.name || null,
      overview: episode?.overview || fallback?.overview || null,
      aired:
        episode?.aired ||
        episode?.aired_date ||
        fallback?.aired ||
        fallback?.aired_date ||
        null,
      image:
        episode?.image ||
        episode?.image_url ||
        fallback?.image ||
        fallback?.image_url ||
        null,
      tmdb_episode_id:
        fallback?.tmdb_episode_id ?? episode?.tmdb_episode_id ?? null,
      tmdb_vote_average:
        fallback?.tmdb_vote_average ?? episode?.tmdb_vote_average ?? null,
      tmdb_vote_count:
        fallback?.tmdb_vote_count ?? episode?.tmdb_vote_count ?? null,
      tmdb_still_path:
        fallback?.tmdb_still_path ?? episode?.tmdb_still_path ?? null,
    });
  }

  return [...merged.values()].sort((a, b) => {
    const seasonDifference =
      Number(a?.seasonNumber ?? a?.season_number ?? 0) -
      Number(b?.seasonNumber ?? b?.season_number ?? 0);

    if (seasonDifference !== 0) return seasonDifference;

    return (
      Number(a?.number ?? a?.episode_number ?? 0) -
      Number(b?.number ?? b?.episode_number ?? 0)
    );
  });
}

async function fetchJson(url, timeoutMs = 90000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { signal: controller.signal });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data?.message || `Request failed: ${response.status}`);
    }

    return data;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function upsertInBatches(table, rows, onConflict, batchSize = 200) {
  for (let index = 0; index < rows.length; index += batchSize) {
    const batch = rows.slice(index, index + batchSize);
    const { error } = await supabase.from(table).upsert(batch, { onConflict });
    if (error) throw error;
  }
}

export async function refreshShowData(show) {
  if (!show?.id) throw new Error("Missing show database ID");

  const tvdbId = normalizePositiveNumber(show?.tvdb_id);
  const tmdbId = normalizePositiveNumber(show?.tmdb_id);

  if (!tvdbId && !tmdbId) {
    throw new Error("This show has neither a TVDB nor TMDB ID");
  }

  let tvdbEpisodes = [];
  let tmdbEpisodes = [];

  if (tvdbId) {
    try {
      const data = await fetchJson(
        `/.netlify/functions/getShowEpisodes?tvdb_id=${encodeURIComponent(tvdbId)}`
      );
      tvdbEpisodes = Array.isArray(data) ? data : data?.episodes || [];
    } catch (error) {
      console.warn("TVDB episode refresh failed; continuing with TMDB", error);
    }
  }

  if (tmdbId) {
    const data = await fetchJson(
      `/.netlify/functions/getTmdbShowEpisodes?tmdbId=${encodeURIComponent(tmdbId)}`
    );
    tmdbEpisodes = Array.isArray(data) ? data : data?.episodes || [];
  }

  const episodes = mergeEpisodes(tvdbEpisodes, tmdbEpisodes);

  if (!episodes.length) {
    throw new Error("No episodes were returned for this show");
  }

  const seasonMap = new Map();

  for (const episode of episodes) {
    const seasonNumber = Number(
      episode?.seasonNumber ?? episode?.season_number ?? 0
    );
    const airedDate = normalizeDate(
      episode?.aired ?? episode?.aired_date ?? null
    );

    const season = seasonMap.get(seasonNumber) || {
      show_id: show.id,
      season_type: "official",
      season_number: seasonNumber,
      name: seasonNumber === 0 ? "Specials" : `Season ${seasonNumber}`,
      episode_count: 0,
      aired_from: null,
      aired_to: null,
      last_synced_at: new Date().toISOString(),
    };

    season.episode_count += 1;

    if (airedDate) {
      if (!season.aired_from || airedDate < season.aired_from) {
        season.aired_from = airedDate;
      }
      if (!season.aired_to || airedDate > season.aired_to) {
        season.aired_to = airedDate;
      }
    }

    seasonMap.set(seasonNumber, season);
  }

  await upsertInBatches(
    "seasons",
    [...seasonMap.values()],
    "show_id,season_type,season_number",
    100
  );

  const { data: savedSeasons, error: seasonError } = await supabase
    .from("seasons")
    .select("id, season_number")
    .eq("show_id", show.id)
    .eq("season_type", "official");

  if (seasonError) throw seasonError;

  const seasonIdByNumber = new Map(
    (savedSeasons || []).map((season) => [Number(season.season_number), season.id])
  );

  const episodeRows = episodes.map((episode) => {
    const seasonNumber = Number(
      episode?.seasonNumber ?? episode?.season_number ?? 0
    );
    const episodeNumber = Number(
      episode?.number ?? episode?.episode_number ?? 0
    );
    const tvdbEpisodeId = normalizePositiveNumber(episode?.id);

    return {
      tvdb_id: tvdbEpisodeId,
      show_id: show.id,
      season_id: seasonIdByNumber.get(seasonNumber) || null,
      season_type: "official",
      season_number: seasonNumber,
      episode_number: episodeNumber,
      absolute_number: normalizePositiveNumber(
        episode?.absoluteNumber ?? episode?.absolute_number
      ),
      name: episode?.name || `Episode ${episodeNumber}`,
      overview: episode?.overview || null,
      aired_date: normalizeDate(
        episode?.aired ?? episode?.aired_date ?? null
      ),
      runtime_minutes: normalizePositiveNumber(
        episode?.runtime ?? episode?.runtime_minutes
      ),
      image_url: episode?.image || episode?.image_url || null,
      is_special: seasonNumber === 0,
      is_premiere: Boolean(
        episode?.isPremiere ?? episode?.is_premiere ?? episodeNumber === 1
      ),
      is_finale: Boolean(episode?.isFinale ?? episode?.is_finale ?? false),
      rating_average: normalizePositiveNumber(
        episode?.rating_average ?? episode?.siteRating
      ),
      rating_count: normalizePositiveNumber(
        episode?.rating_count ?? episode?.siteRatingCount
      ),
      tmdb_vote_average: normalizePositiveNumber(episode?.tmdb_vote_average),
      tmdb_vote_count: normalizePositiveNumber(episode?.tmdb_vote_count),
      tmdb_still_path: episode?.tmdb_still_path || null,
      last_synced_at: new Date().toISOString(),
    };
  });

  await upsertInBatches(
    "episodes",
    episodeRows,
    "show_id,season_type,season_number,episode_number",
    200
  );

  const { error: showUpdateError } = await supabase
    .from("shows")
    .update({ last_synced_at: new Date().toISOString() })
    .eq("id", show.id);

  if (showUpdateError) throw showUpdateError;

  return {
    episodeCount: episodeRows.length,
    seasonCount: [...seasonMap.keys()].filter((number) => number > 0).length,
  };
}
