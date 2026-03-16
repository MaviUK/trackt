import { supabase } from "./supabase";
import { getCachedEpisodes } from "./episodesCache";
import { upsertShowRecord, replaceShowEpisodes } from "./showSync";

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
    try {
      await upsertShowRecord(show);

      const showTvdbId = String(show.tvdb_id);
      const episodes = await getCachedEpisodes(showTvdbId);

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
        tvdb_id: String(show.tvdb_id),
        show_name: show.show_name,
        ok: false,
        error: error.message,
      });
    }
  }

  return results;
}
