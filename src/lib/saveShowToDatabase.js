import { supabase } from "./supabase";
import { getCachedEpisodes } from "./episodesCache";

function makeEpisodeCode(seasonNumber, episodeNumber) {
  return `S${String(seasonNumber).padStart(2, "0")}E${String(
    episodeNumber
  ).padStart(2, "0")}`;
}

export async function saveShowToDatabase(show) {
  if (!show?.tvdb_id) {
    throw new Error("Missing show tvdb_id");
  }

  const showPayload = {
    tvdb_id: String(show.tvdb_id),
    show_name: show.show_name ?? show.name ?? "Unknown title",
    poster_url: show.poster_url ?? null,
    status: show.status ?? null,
    first_air_date: show.first_air_date ?? null,
    overview: show.overview ?? null,
    updated_at: new Date().toISOString(),
  };

  const { error: showError } = await supabase
    .from("shows")
    .upsert(showPayload, { onConflict: "tvdb_id" });

  if (showError) {
    throw showError;
  }

  const rawEpisodes = await getCachedEpisodes(show.tvdb_id);

  const episodes = (rawEpisodes || [])
    .filter(
      (ep) =>
        Number(ep.seasonNumber) > 0 &&
        Number(ep.number) > 0
    )
    .map((ep) => ({
      tvdb_episode_id: ep.id ? String(ep.id) : null,
      show_tvdb_id: String(show.tvdb_id),
      season_number: Number(ep.seasonNumber),
      episode_number: Number(ep.number),
      episode_code: makeEpisodeCode(ep.seasonNumber, ep.number),
      episode_name: ep.name ?? null,
      aired: ep.aired ?? null,
      overview: ep.overview ?? null,
      image_url: ep.image ?? ep.image_url ?? null,
      updated_at: new Date().toISOString(),
    }));

  if (episodes.length > 0) {
    const { error: episodesError } = await supabase
      .from("episodes")
      .upsert(episodes, {
        onConflict: "show_tvdb_id,season_number,episode_number",
      });

    if (episodesError) {
      throw episodesError;
    }
  }
}
