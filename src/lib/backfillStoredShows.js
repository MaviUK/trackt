import { supabase } from "./supabase";
import { getCachedEpisodes } from "./episodesCache";
import { upsertShowRecord, replaceShowEpisodes } from "./showSync";

function normalizeId(value) {
  if (value == null) return "";
  return String(value).trim();
}

export async function backfillStoredShowsForCurrentUser() {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) throw userError;
  if (!user) throw new Error("No logged in user");

  const { data: userShows, error: showsError } = await supabase
    .from("user_shows")
    .select("*")
    .eq("user_id", user.id);

  if (showsError) throw showsError;

  const results = [];

  for (const show of userShows || []) {
    const showTvdbId = normalizeId(show.tvdb_id);

    if (!showTvdbId) {
      results.push({
        tvdb_id: "",
        show_name: show.show_name,
        ok: false,
        error: "Missing tvdb_id on user_shows row",
      });
      continue;
    }

    try {
      await upsertShowRecord({
        ...show,
        tvdb_id: showTvdbId,
      });

      const episodes = await getCachedEpisodes(showTvdbId);

console.log("BACKFILL SHOW", {
  showTvdbId,
  showName: show.show_name,
  episodeCount: Array.isArray(episodes) ? episodes.length : null,
  sampleEpisode: Array.isArray(episodes) && episodes.length > 0 ? episodes[0] : null,
});

await replaceShowEpisodes(showTvdbId, episodes || []);

      results.push({
        tvdb_id: showTvdbId,
        show_name: show.show_name,
        ok: true,
        episode_count: (episodes || []).length,
      });
    } catch (error) {
      console.error("Backfill failed for show:", show.show_name, error);
      results.push({
        tvdb_id: showTvdbId,
        show_name: show.show_name,
        ok: false,
        error: error.message,
      });
    }
  }

  return results;
}
