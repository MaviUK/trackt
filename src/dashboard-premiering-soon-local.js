import { supabase } from "./lib/supabase";

function localDateOnly(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export async function loadDatabaseS01E01Premieres() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const end = new Date(today);
  end.setDate(end.getDate() + 7);

  const from = localDateOnly(today);
  const to = localDateOnly(end);

  const { data, error } = await supabase
    .from("episodes")
    .select(`
      id,
      aired_date,
      season_number,
      episode_number,
      shows!inner(
        id,
        tvdb_id,
        tmdb_id,
        name,
        poster_url,
        overview,
        first_aired
      )
    `)
    .eq("season_type", "official")
    .eq("season_number", 1)
    .eq("episode_number", 1)
    .gte("aired_date", from)
    .lte("aired_date", to)
    .order("aired_date", { ascending: true });

  if (error) throw error;

  return (data || [])
    .map((row) => {
      const show = row?.shows;
      if (!show?.id || !row?.aired_date) return null;

      return {
        id: show.tmdb_id || show.tvdb_id || show.id,
        database_show_id: show.id,
        tmdb_id: show.tmdb_id || null,
        tvdb_id: show.tvdb_id || null,
        name: show.name || "Unknown title",
        image: show.poster_url || null,
        poster_url: show.poster_url || null,
        overview: show.overview || "",
        first_air_date: row.aired_date,
        premiere_date: row.aired_date,
        premiere_season_number: 1,
        premiere_episode_number: 1,
        source: "database",
      };
    })
    .filter(Boolean);
}
