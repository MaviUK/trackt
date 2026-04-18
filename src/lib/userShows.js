import { supabase } from "./supabase";
import { saveShowToDatabase } from "./saveShowToDatabase";

function getResolvedTvdbId(show) {
  const value =
    show?.tvdb_id ||
    show?.resolved_tvdb_id ||
    show?.mapped_tvdb_id ||
    show?.show_tvdb_id ||
    show?.tvdb ||
    null;

  return value ? Number(value) : null;
}

function getResolvedTmdbId(show) {
  const value =
    show?.tmdb_id ||
    show?.series_tmdb_id ||
    show?.id ||
    null;

  return value ? Number(value) : null;
}

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

  if (!show || typeof show !== "object") {
    throw new Error("Missing show details.");
  }

  const normalizedShow = {
    ...show,
    tvdb_id: getResolvedTvdbId(show),
    tmdb_id: getResolvedTmdbId(show),
    first_air_date: show?.first_air_date || show?.first_aired || null,
    first_aired: show?.first_air_date || show?.first_aired || null,
    poster_url: show?.poster_url || show?.image_url || null,
    backdrop_url:
      show?.backdrop_url ||
      show?.background_url ||
      show?.banner_url ||
      show?.fanart_url ||
      null,
    name: show?.name || show?.title || "Unknown show",
    overview: show?.overview || null,
    status: show?.status || null,
  };

  if (!normalizedShow.tvdb_id && !normalizedShow.tmdb_id) {
    throw new Error("This show is missing both TVDB and TMDB IDs.");
  }

  const savedShow = await saveShowToDatabase(normalizedShow);

  if (!savedShow?.id) {
    throw new Error("Failed to save show to database.");
  }

  const upsertPayload = {
    user_id: user.id,
    show_id: savedShow.id,
    watch_status: "watchlist",
  };

  if (normalizedShow.tmdb_id) {
    upsertPayload.tmdb_id = normalizedShow.tmdb_id;
  }

  const { error } = await supabase.from("user_shows_new").upsert(upsertPayload, {
    onConflict: "user_id,show_id",
  });

  if (error) {
    throw error;
  }

  return savedShow;
}
