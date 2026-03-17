import { supabase } from "./supabase";
import { saveShowToDatabase } from "./saveShowToDatabase";

export async function addShowToUserList(show) {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) throw userError;
  if (!user) throw new Error("User not logged in");

  const savedShow = await saveShowToDatabase(show);

  const payload = {
    user_id: user.id,
    show_id: savedShow.id,
    watch_status: "watching",
  };

  const { error } = await supabase
    .from("user_shows")
    .upsert(payload, { onConflict: "user_id,show_id" });

  if (error) throw error;

  return savedShow;
}
