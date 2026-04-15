import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_BASE_URL = "https://api.themoviedb.org/3";
const TMDB_IMAGE_BASE_URL = "https://image.tmdb.org/t/p/w500";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchTmdbEpisode(tmdbId, seasonNumber, episodeNumber) {
  const url = `${TMDB_BASE_URL}/tv/${encodeURIComponent(
    tmdbId
  )}/season/${encodeURIComponent(
    seasonNumber
  )}/episode/${encodeURIComponent(
    episodeNumber
  )}?api_key=${encodeURIComponent(TMDB_API_KEY)}`;

  const res = await fetch(url);
  if (!res.ok) {
    if (res.status === 404) return null;
    const text = await res.text();
    throw new Error(
      `TMDB episode fetch failed ${res.status} for ${tmdbId} S${seasonNumber}E${episodeNumber}: ${text}`
    );
  }

  return res.json();
}

async function fetchShowsPage(from, to) {
  const { data, error } = await supabase
    .from("shows")
    .select("id, name, tvdb_id, tmdb_id")
    .not("tmdb_id", "is", null)
    .range(from, to)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data || [];
}

async function fetchEpisodesForShow(showId) {
  const { data, error } = await supabase
    .from("episodes")
    .select("id, season_number, episode_number, name, tmdb_vote_average, tmdb_still_path, image_url")
    .eq("show_id", showId)
    .gte("episode_number", 1)
    .order("season_number", { ascending: true })
    .order("episode_number", { ascending: true });

  if (error) throw error;
  return data || [];
}

async function updateEpisodesBatch(rows) {
  if (!rows.length) return;

  const { error } = await supabase
    .from("episodes")
    .upsert(rows, { onConflict: "id" });

  if (error) throw error;
}

async function backfillShow(show) {
  const episodes = await fetchEpisodesForShow(show.id);
  if (!episodes.length) {
    console.log(`No episodes for ${show.name}`);
    return { updated: 0, total: 0 };
  }

  const updates = [];

  for (const ep of episodes) {
    const seasonNumber = Number(ep.season_number ?? 0);
    const episodeNumber = Number(ep.episode_number ?? 0);

    if (seasonNumber < 0 || episodeNumber <= 0) continue;

    try {
      const tmdbEp = await fetchTmdbEpisode(
        show.tmdb_id,
        seasonNumber,
        episodeNumber
      );

      if (!tmdbEp) continue;

      const stillPath = tmdbEp.still_path ?? null;
      const stillUrl = stillPath
        ? `${TMDB_IMAGE_BASE_URL}${stillPath}`
        : ep.image_url ?? null;

      updates.push({
        id: ep.id,
        tmdb_vote_average:
          tmdbEp.vote_average != null ? Number(tmdbEp.vote_average) : null,
        tmdb_vote_count:
          tmdbEp.vote_count != null ? Number(tmdbEp.vote_count) : null,
        tmdb_still_path: stillPath,
        image_url: stillUrl,
        updated_at: new Date().toISOString(),
      });
    } catch (error) {
      console.error(
        `Failed ${show.name} S${seasonNumber}E${episodeNumber}:`,
        error.message
      );
    }

    await sleep(120);
  }

  for (let i = 0; i < updates.length; i += 100) {
    await updateEpisodesBatch(updates.slice(i, i + 100));
  }

  console.log(
    `Backfilled ${show.name}: ${updates.length}/${episodes.length} episodes`
  );

  return { updated: updates.length, total: episodes.length };
}

async function main() {
  if (!TMDB_API_KEY) {
    throw new Error("Missing TMDB_API_KEY");
  }
  if (!process.env.SUPABASE_URL) {
    throw new Error("Missing SUPABASE_URL");
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
  }

  let from = 0;
  const pageSize = 100;
  let totalShows = 0;
  let totalEpisodes = 0;
  let totalUpdated = 0;

  while (true) {
    const shows = await fetchShowsPage(from, from + pageSize - 1);
    if (!shows.length) break;

    for (const show of shows) {
      totalShows += 1;
      const result = await backfillShow(show);
      totalEpisodes += result.total;
      totalUpdated += result.updated;
    }

    from += pageSize;
  }

  console.log("Done.");
  console.log({
    totalShows,
    totalEpisodes,
    totalUpdated,
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
