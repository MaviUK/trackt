import { supabase } from "./supabase";
import { makeEpisodeCode } from "./episodeHelpers";

function pick(obj, keys, fallback = null) {
  for (const key of keys) {
    if (obj?.[key] != null) return obj[key];
  }
  return fallback;
}

function normalizeShowPayload(show) {
  const rawTvdbId = pick(show, ["tvdb_id", "tvdbId", "id"], "");

  return {
    tvdb_id: rawTvdbId != null ? String(rawTvdbId) : "",
    show_name: pick(show, ["show_name", "name"], ""),
    slug: pick(show, ["slug"], null),
    overview: pick(show, ["overview"], null),
    status: pick(show, ["status"], null),
    poster_url: pick(show, ["poster_url", "poster", "image"], null),
    backdrop_url: pick(show, ["backdrop_url", "backdrop"], null),
    banner_url: pick(show, ["banner_url", "banner"], null),
    first_aired: pick(show, ["first_aired", "firstAired"], null),
    last_aired: pick(show, ["last_aired", "lastAired"], null),
    network: pick(show, ["network", "originalNetwork"], null),
    original_country: pick(show, ["original_country", "originalCountry"], null),
    original_language: pick(show, ["original_language", "originalLanguage"], null),
    runtime_minutes: pick(show, ["runtime_minutes", "averageRuntime", "runtime"], null),
    content_rating: pick(show, ["content_rating", "contentRating"], null),
    genres: pick(show, ["genres"], []),
    aliases: pick(show, ["aliases"], []),
    last_synced_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function normalizeEpisodePayload(showTvdbId, episode) {
  const seasonNumber = Number(
    pick(
      episode,
      ["seasonNumber", "season_number", "season", "airedSeason"],
      0
    )
  );

  const episodeNumber = Number(
    pick(
      episode,
      ["number", "episodeNumber", "episode_number", "airedEpisodeNumber"],
      0
    )
  );

  const normalizedEpisode = {
    ...episode,
    seasonNumber,
    number: episodeNumber,
  };

  const episodeCode = makeEpisodeCode(normalizedEpisode);

  if (!seasonNumber || !episodeNumber || !episodeCode) {
    return null;
  }

  const rawEpisodeId = pick(episode, ["id", "episode_id", "tvdb_episode_id"], null);

  return {
    show_tvdb_id: String(showTvdbId),
    tvdb_episode_id: rawEpisodeId != null ? String(rawEpisodeId) : null,
    season_number: seasonNumber,
    episode_number: episodeNumber,
    episode_code: episodeCode,
    name: pick(episode, ["name"], ""),
    overview: pick(episode, ["overview"], null),
    air_date: pick(episode, ["airDate", "aired", "air_date"], null),
    runtime_minutes: pick(episode, ["runtime", "runtime_minutes"], null),
    image_url: pick(episode, ["image", "image_url"], null),
    absolute_number: pick(episode, ["absoluteNumber", "absolute_number"], null),
    is_finale: Boolean(pick(episode, ["isFinale", "is_finale"], false)),
    is_premiere: Boolean(pick(episode, ["isPremiere", "is_premiere"], false)),
    last_synced_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function normalizeCastPayload(showTvdbId, castMember, index) {
  const rawPersonId = pick(
    castMember,
    ["personId", "person_tvdb_id", "id"],
    null
  );

  return {
    show_tvdb_id: String(showTvdbId),
    person_tvdb_id: rawPersonId != null ? String(rawPersonId) : null,
    person_name: pick(castMember, ["personName", "name", "person_name"], ""),
    character_name: pick(castMember, ["characterName", "character_name"], null),
    role_type: pick(castMember, ["role", "role_type", "type"], null),
    sort_order: pick(castMember, ["sort", "sort_order"], index),
    image_url: pick(castMember, ["image", "image_url"], null),
    last_synced_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

export async function upsertShowRecord(show) {
  const payload = normalizeShowPayload(show);

  if (!payload.tvdb_id) {
    throw new Error("Missing tvdb_id for show");
  }

  const { data, error } = await supabase
    .from("shows")
    .upsert(payload, {
      onConflict: "tvdb_id",
    })
    .select()
    .single();

  if (error) throw error;

  return data;
}

export async function replaceShowEpisodes(showTvdbId, episodes = []) {
  const normalized = episodes
    .map((ep) => normalizeEpisodePayload(showTvdbId, ep))
    .filter(Boolean);

  const dedupedMap = new Map();

  for (const ep of normalized) {
    const key = `${ep.show_tvdb_id}__${ep.episode_code}`;

    if (!dedupedMap.has(key)) {
      dedupedMap.set(key, ep);
      continue;
    }

    const existing = dedupedMap.get(key);

    const existingScore =
      (existing.name ? 1 : 0) +
      (existing.overview ? 1 : 0) +
      (existing.air_date ? 1 : 0) +
      (existing.image_url ? 1 : 0);

    const nextScore =
      (ep.name ? 1 : 0) +
      (ep.overview ? 1 : 0) +
      (ep.air_date ? 1 : 0) +
      (ep.image_url ? 1 : 0);

    if (nextScore >= existingScore) {
      dedupedMap.set(key, ep);
    }
  }

  const deduped = Array.from(dedupedMap.values());

  if (deduped.length === 0) return [];

  const { error } = await supabase
    .from("show_episodes")
    .upsert(deduped, {
      onConflict: "show_tvdb_id,episode_code",
    });

  if (error) throw error;

  return deduped;
}

export async function replaceShowCast(showTvdbId, cast = []) {
  const normalized = cast
    .map((member, index) => normalizeCastPayload(showTvdbId, member, index))
    .filter((member) => member.person_name);

  const { error: deleteError } = await supabase
    .from("show_cast")
    .delete()
    .eq("show_tvdb_id", String(showTvdbId));

  if (deleteError) throw deleteError;

  if (normalized.length === 0) return [];

  const { error: insertError } = await supabase
    .from("show_cast")
    .insert(normalized);

  if (insertError) throw insertError;

  return normalized;
}
