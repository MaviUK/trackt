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
      const storedShow = await upsertShowRecord(show);

      if (!storedShow?.tvdb_id) {
        throw new Error(`Show row was not created for ${show.show_name}`);
      }

      const episodes = await getCachedEpisodes(show.tvdb_id);
      await replaceShowEpisodes(storedShow.tvdb_id, episodes || []);

      results.push({
        tvdb_id: show.tvdb_id,
        show_name: show.show_name,
        ok: true,
      });
    } catch (error) {
      console.error("Backfill failed for show:", show.show_name, error);
      results.push({
        tvdb_id: show.tvdb_id,
        show_name: show.show_name,
        ok: false,
        error: error.message,
      });
    }
  }

  return results;
}
