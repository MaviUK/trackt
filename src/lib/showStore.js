import { supabase } from "./supabase";

export async function getStoredShow(tvdbId) {
  const { data, error } = await supabase
    .from("shows")
    .select("*")
    .eq("tvdb_id", String(tvdbId))
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function getStoredEpisodes(tvdbId) {
  const { data, error } = await supabase
    .from("show_episodes")
    .select("*")
    .eq("show_tvdb_id", String(tvdbId))
    .order("season_number", { ascending: true })
    .order("episode_number", { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function getStoredCast(tvdbId) {
  const { data, error } = await supabase
    .from("show_cast")
    .select("*")
    .eq("show_tvdb_id", String(tvdbId))
    .order("sort_order", { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function getStoredEpisodesForShows(showIds = []) {
  if (!showIds.length) return [];

  const ids = showIds.map((id) => String(id));

  const { data, error } = await supabase
    .from("show_episodes")
    .select("*")
    .in("show_tvdb_id", ids)
    .order("season_number", { ascending: true })
    .order("episode_number", { ascending: true });

  if (error) throw error;
  return data || [];
}
