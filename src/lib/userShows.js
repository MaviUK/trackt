import { supabase } from "./supabase";
import { saveShowToDatabase } from "./saveShowToDatabase";

export async function addShowToUserList(show) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("You must be logged in to add a show.");
  }

  const savedShow = await saveShowToDatabase(show);

  const { error } = await supabase.from("user_shows_new").upsert(
    {
      user_id: user.id,
      show_id: savedShow.id,
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
