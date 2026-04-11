import { supabase } from "./supabase";
import { saveShowToDatabase } from "./saveShowToDatabase";

export async function addShowToUserList(show) {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    throw userError;
  }

  if (!user) {
    throw new Error("You must be logged in to add a show.");
  }

  const savedShow = await saveShowToDatabase(show);

  if (!savedShow?.id) {
    throw new Error("Failed to save show to database.");
  }

  const { error } = await supabase.from("user_shows_new").upsert(
    {
      user_id: user.id,
      show_id: savedShow.id,
      watch_status: "watchlist",
    },
    {
      onConflict: "user_id,show_id",
    }
  );

  if (error) {
    throw error;
  }

  return savedShow;
}
