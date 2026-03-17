import { supabase } from "./supabase";

export async function updateUserShowStatus(userId, tvdbId, watchStatus) {
  const { data, error } = await supabase
    .from("user_shows")
    .update({ watch_status: watchStatus })
    .eq("user_id", userId)
    .eq("tvdb_id", tvdbId)
    .select("user_id, tvdb_id, watch_status")
    .maybeSingle();

  if (error) {
    console.error("updateUserShowStatus error:", error);
    throw error;
  }

  if (!data) {
    throw new Error(
      `No user_shows row was updated for tvdb_id=${tvdbId}. Check RLS policy and stored tvdb_id type/value.`
    );
  }

  return data;
}
