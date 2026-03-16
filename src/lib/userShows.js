import { supabase } from "./supabase";

export async function updateUserShowStatus(userId, tvdbId, watchStatus) {
  const { error } = await supabase
    .from("user_shows")
    .update({ watch_status: watchStatus })
    .eq("user_id", userId)
    .eq("tvdb_id", tvdbId);

  if (error) throw error;
}
