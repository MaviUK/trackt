import { supabase } from "../src/lib/supabase.js";

function normalizeDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function normalizeNetwork(networkValue) {
  if (!networkValue) return null;

  if (Array.isArray(networkValue)) {
    const names = networkValue
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object") return item.name ?? null;
        return null;
      })
      .filter(Boolean);

    return names.length ? names.join(", ") : null;
  }

  if (typeof networkValue === "object") {
    return networkValue.name ?? null;
  }

  return networkValue;
}

function normalizeGenres(genresValue) {
  if (!Array.isArray(genresValue)) return [];

  return genresValue
    .map((genre) => {
      if (typeof genre === "string") return genre;
      if (genre && typeof genre === "object") {
        return genre.name ?? genre.genre ?? null;
      }
      return null;
    })
    .filter(Boolean);
}

async function fetchShowDetails(tvdbId) {
  const res = await fetch(
    `http://localhost:8888/.netlify/functions/getShowDetails?tvdb_id=${encodeURIComponent(tvdbId)}`
  );

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data?.message || `Failed to fetch details for ${tvdbId}`);
  }

  return data;
}

function buildBackfillPayload(existingShow, showDetails) {
  return {
    id: existingShow.id,
    tvdb_id: existingShow.tvdb_id,
    slug: showDetails.slug ?? existingShow.slug ?? null,
    name: showDetails.name ?? existingShow.name ?? "Unknown title",
    original_name: showDetails.original_name ?? existingShow.original_name ?? null,
    overview: showDetails.overview ?? existingShow.overview ?? null,
    status: showDetails.status ?? existingShow.status ?? null,
    original_country: showDetails.original_country ?? existingShow.original_country ?? null,
    original_language: showDetails.original_language ?? existingShow.original_language ?? null,
    first_aired: normalizeDate(
      showDetails.first_aired ??
        showDetails.first_air_date ??
        showDetails.first_air_time ??
        existingShow.first_aired
    ),
    last_aired: normalizeDate(showDetails.last_aired ?? existingShow.last_aired),
    next_aired: normalizeDate(showDetails.next_aired ?? existingShow.next_aired),
    runtime_minutes: Number.isFinite(Number(showDetails.runtime_minutes))
      ? Number(showDetails.runtime_minutes)
      : existingShow.runtime_minutes ?? null,
    network: normalizeNetwork(showDetails.network) ?? existingShow.network ?? null,
    content_rating: showDetails.content_rating ?? existingShow.content_rating ?? null,
    genres: normalizeGenres(showDetails.genres).length
      ? normalizeGenres(showDetails.genres)
      : existingShow.genres ?? [],
    poster_url: showDetails.poster_url ?? showDetails.image_url ?? existingShow.poster_url ?? null,
    backdrop_url: showDetails.backdrop_url ?? existingShow.backdrop_url ?? null,
    banner_url: showDetails.banner_url ?? existingShow.banner_url ?? null,
    external_ids: showDetails.external_ids ?? existingShow.external_ids ?? {},
    last_synced_at: new Date().toISOString(),
  };
}

async function backfillShows() {
  let from = 0;
  const pageSize = 100;
  let totalUpdated = 0;

  while (true) {
    const { data: shows, error } = await supabase
      .from("shows")
      .select("id, tvdb_id, slug, name, original_name, overview, status, original_country, original_language, first_aired, last_aired, next_aired, runtime_minutes, network, content_rating, genres, poster_url, backdrop_url, banner_url, external_ids")
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) {
      throw error;
    }

    if (!shows || shows.length === 0) {
      break;
    }

    for (const show of shows) {
      try {
        if (!show.tvdb_id) continue;

        const details = await fetchShowDetails(show.tvdb_id);
        const payload = buildBackfillPayload(show, details);

        const { error: updateError } = await supabase
          .from("shows")
          .upsert(payload, { onConflict: "tvdb_id" });

        if (updateError) {
          console.error(`Failed updating show ${show.tvdb_id}:`, updateError);
          continue;
        }

        totalUpdated += 1;
        console.log(`Updated ${show.name} (${show.tvdb_id})`);
      } catch (err) {
        console.error(`Backfill failed for ${show.tvdb_id}:`, err.message);
      }
    }

    from += pageSize;
  }

  console.log(`Backfill complete. Updated ${totalUpdated} shows.`);
}

backfillShows().catch((err) => {
  console.error("Backfill crashed:", err);
  process.exit(1);
});
