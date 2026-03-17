import { supabase } from "./supabase";

export async function updateUserShowStatus(userId, tvdbId, watchStatus) {
  const numericId = Number(tvdbId);

  const { data, error } = await supabase
    .from("user_shows")
    .update({ watch_status: watchStatus })
    .eq("user_id", userId)
    .eq("tvdb_id", numericId)
    .select("user_id, tvdb_id, watch_status")
    .maybeSingle();

  if (error) {
    console.error("updateUserShowStatus error:", error);
    throw error;
  }

  if (!data) {
    throw new Error(
      `No row updated. tvdb_id=${tvdbId} (numeric: ${numericId})`
    );
  }

  return data;
}
