import { supabase } from "./supabase";
import { saveShowToDatabase } from "./saveShowToDatabase";

function normalizePositiveNumber(value) {
  if (value === "" || value == null) return null;
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : null;
}

function getResolvedTvdbId(show) {
  return (
    normalizePositiveNumber(show?.tvdb_id) ??
    normalizePositiveNumber(show?.resolved_tvdb_id) ??
    normalizePositiveNumber(show?.mapped_tvdb_id) ??
    normalizePositiveNumber(show?.show_tvdb_id) ??
    normalizePositiveNumber(show?.tvdb) ??
    null
  );
}

function getResolvedTmdbId(show) {
  return (
    normalizePositiveNumber(show?.tmdb_id) ??
    normalizePositiveNumber(show?.resolved_tmdb_id) ??
    normalizePositiveNumber(show?.mapped_tmdb_id) ??
    normalizePositiveNumber(show?.series_tmdb_id) ??
    normalizePositiveNumber(show?.show_tmdb_id) ??
    normalizePositiveNumber(show?.tmdb) ??
    (show?.source === "tmdb" ? normalizePositiveNumber(show?.id) : null) ??
    null
  );
}

export async function addShowToUserList(show) {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) throw userError;

  if (!user) {
    throw new Error("You must be logged in to add a show.");
  }

  if (!show || typeof show !== "object") {
    throw new Error("Missing show details.");
  }

  const tvdbId = getResolvedTvdbId(show);
  const tmdbId = getResolvedTmdbId(show);

  const normalizedShow = {
    ...show,
    tvdb_id: tvdbId,
    tmdb_id: tmdbId,
    first_air_date: show?.first_air_date || show?.first_aired || null,
    first_aired: show?.first_air_date || show?.first_aired || null,
    poster_url:
      show?.poster_url ||
      show?.posterUrl ||
      show?.image_url ||
      show?.image ||
      null,
    backdrop_url:
      show?.backdrop_url ||
      show?.backdropUrl ||
      show?.background_url ||
      show?.backgroundUrl ||
      show?.banner_url ||
      show?.bannerUrl ||
      show?.fanart_url ||
      null,
    name: show?.name || show?.title || show?.show_name || "Unknown show",
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

  const { error } = await supabase.from("user_shows_new").upsert(upsertPayload, {
    onConflict: "user_id,show_id",
  });

  if (error) throw error;

  return savedShow;
}
