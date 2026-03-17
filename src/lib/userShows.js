import { supabase } from "./supabase";

export async function updateUserShowStatus(userId, tvdbId, watchStatus) {
  const normalizedTvdbId = String(tvdbId).trim();

  const { data, error } = await supabase
    .from("user_shows")
    .update({ watch_status: watchStatus })
    .eq("user_id", userId)
    .eq("tvdb_id", normalizedTvdbId)
    .select("user_id, tvdb_id, watch_status")
    .maybeSingle();

  if (error) {
    console.error("updateUserShowStatus error:", error);
    throw error;
  }

  if (!data) {
    throw new Error(`No row updated for tvdb_id=${normalizedTvdbId}.`);
  }

  return data;
}
