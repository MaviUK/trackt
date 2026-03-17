import { supabase } from "./supabase";
import { saveShowToDatabase } from "./saveShowToDatabase";

export async function addShowToUserList(show) {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) throw userError;
  if (!user) throw new Error("User not logged in");

  await saveShowToDatabase(show);

  const payload = {
    user_id: user.id,
    tvdb_id: String(show.tvdb_id),
    show_name: show.show_name ?? show.name ?? "Unknown title",
    poster_url: show.poster_url ?? null,
  };

  const { error } = await supabase
    .from("user_shows")
    .upsert(payload, { onConflict: "user_id,tvdb_id" });

  if (error) throw error;
}
