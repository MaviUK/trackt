const { createClient } = require("@supabase/supabase-js");

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BULK_IMPORT_SECRET = process.env.BULK_IMPORT_SECRET;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function fetchJson(url) {
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`TMDB request failed: ${res.status}`);
  }

  return res.json();
}

async function searchShow(title) {
  const data = await fetchJson(
    `https://api.themoviedb.org/3/search/tv?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(
      title
    )}`
  );

  return data.results?.[0] || null;
}

async function fetchShowDetails(tmdbId) {
  return fetchJson(
    `https://api.themoviedb.org/3/tv/${tmdbId}?api_key=${TMDB_API_KEY}&append_to_response=external_ids`
  );
}

async function fetchSeason(tmdbId, seasonNumber) {
  return fetchJson(
    `https://api.themoviedb.org/3/tv/${tmdbId}/season/${seasonNumber}?api_key=${TMDB_API_KEY}`
  );
}

async function findUserByEmail(email) {
  const { data, error } = await supabase.auth.admin.listUsers();

  if (error) throw error;

  return data.users.find(
    (user) => user.email?.toLowerCase() === email.toLowerCase()
  );
}

async function addShowToUser(userId, showId) {
  const { data: existing, error: findError } = await supabase
    .from("user_shows_new")
    .select("id")
    .eq("user_id", userId)
    .eq("show_id", showId)
    .maybeSingle();

  if (findError) throw findError;

  if (existing) {
    const { error } = await supabase
      .from("user_shows_new")
      .update({
        watch_status: "watchlist",
        archived_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);

    if (error) throw error;
    return;
  }

  const { error } = await supabase.from("user_shows_new").insert({
    user_id: userId,
    show_id: showId,
    watch_status: "watchlist",
    added_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  if (error) throw error;
}

exports.handler = async (event) => {
  try {
    const secret = event.headers["x-bulk-import-secret"];

    if (!BULK_IMPORT_SECRET || secret !== BULK_IMPORT_SECRET) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: "Unauthorized" }),
      };
    }

    if (event.httpMethod !== "POST") {
      return {
        statusCode: 405,
        body: JSON.stringify({ error: "Use POST" }),
      };
    }

    const body = JSON.parse(event.body || "{}");
    const email = body.email;
    const titles = body.titles || [];

    if (!email || !Array.isArray(titles) || titles.length === 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: "Send { email, titles: [] }",
        }),
      };
    }

    const user = await findUserByEmail(email);

    if (!user) {
      throw new Error(`User not found: ${email}`);
    }

    const results = [];

    for (const title of titles) {
      try {
        const tmdbShow = await searchShow(title);

        if (!tmdbShow) {
          results.push({ title, status: "not_found" });
          continue;
        }

        const fullShow = await fetchShowDetails(tmdbShow.id);
        const tvdbId = fullShow.external_ids?.tvdb_id || null;

        if (!tvdbId) {
          results.push({
            title,
            status: "skipped",
            error: "No TVDB ID found from TMDB",
          });
          continue;
        }

        let { data: existingShow, error: existingShowError } = await supabase
          .from("shows")
          .select("*")
          .or(`tmdb_id.eq.${tmdbShow.id},tvdb_id.eq.${tvdbId}`)
          .maybeSingle();

        if (existingShowError) throw existingShowError;

        if (!existingShow) {
          const { data: insertedShow, error: showInsertError } = await supabase
            .from("shows")
            .insert({
              tvdb_id: tvdbId,
              tmdb_id: tmdbShow.id,
              name: fullShow.name || tmdbShow.name || title,
              original_name: fullShow.original_name || null,
              overview: fullShow.overview || "",
              status: fullShow.status || null,
              original_country: Array.isArray(fullShow.origin_country)
                ? fullShow.origin_country[0] || null
                : null,
              original_language: fullShow.original_language || null,
              first_aired: fullShow.first_air_date || null,
              last_aired: fullShow.last_air_date || null,
              runtime_minutes: Array.isArray(fullShow.episode_run_time)
                ? fullShow.episode_run_time[0] || null
                : null,
              network: fullShow.networks?.[0]?.name || null,
              genres: Array.isArray(fullShow.genres)
                ? fullShow.genres.map((g) => g.name).filter(Boolean)
                : [],
              poster_url: fullShow.poster_path
                ? `https://image.tmdb.org/t/p/w500${fullShow.poster_path}`
                : null,
              backdrop_url: fullShow.backdrop_path
                ? `https://image.tmdb.org/t/p/original${fullShow.backdrop_path}`
                : null,
              external_ids: {
                tmdb_id: tmdbShow.id,
                tvdb_id: tvdbId,
                imdb_id: fullShow.external_ids?.imdb_id || null,
              },
              rating_average: fullShow.vote_average || null,
              rating_count: fullShow.vote_count || null,
              last_synced_at: new Date().toISOString(),
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .select()
            .single();

          if (showInsertError) throw showInsertError;
          existingShow = insertedShow;
        }

        const showId = existingShow.id;

        await addShowToUser(user.id, showId);

        let importedEpisodes = 0;

        for (const season of fullShow.seasons || []) {
          const seasonNumber = Number(season.season_number);

          if (!seasonNumber || seasonNumber === 0) continue;

          let { data: existingSeason, error: seasonFindError } = await supabase
            .from("seasons")
            .select("*")
            .eq("show_id", showId)
            .eq("season_number", seasonNumber)
            .maybeSingle();

          if (seasonFindError) throw seasonFindError;

          if (!existingSeason) {
            const { data: insertedSeason, error: seasonInsertError } =
              await supabase
                .from("seasons")
                .insert({
                  show_id: showId,
                  season_number: seasonNumber,
                  season_type: "official",
                  name: season.name || `Season ${seasonNumber}`,
                  overview: season.overview || "",
                  image_url: season.poster_path
                    ? `https://image.tmdb.org/t/p/w500${season.poster_path}`
                    : null,
                  episode_count: season.episode_count || null,
                  aired_from: season.air_date || null,
                  last_synced_at: new Date().toISOString(),
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                })
                .select()
                .single();

            if (seasonInsertError) throw seasonInsertError;
            existingSeason = insertedSeason;
          }

          const seasonData = await fetchSeason(tmdbShow.id, seasonNumber);

          for (const ep of seasonData.episodes || []) {
            const episodeNumber = Number(ep.episode_number);
            if (!episodeNumber) continue;

            let { data: existingEpisode, error: epFindError } = await supabase
              .from("episodes")
              .select("*")
              .eq("show_id", showId)
              .eq("season_number", seasonNumber)
              .eq("episode_number", episodeNumber)
              .maybeSingle();

            if (epFindError) throw epFindError;

            if (!existingEpisode) {
              const { error: epInsertError } = await supabase
                .from("episodes")
                .insert({
                  show_id: showId,
                  season_id: existingSeason.id,
                  season_type: "official",
                  season_number: seasonNumber,
                  episode_number: episodeNumber,
                  name: ep.name || `Episode ${episodeNumber}`,
                  overview: ep.overview || "",
                  aired_date: ep.air_date || null,
                  aired_at: ep.air_date || null,
                  image_url: ep.still_path
                    ? `https://image.tmdb.org/t/p/w500${ep.still_path}`
                    : null,
                  is_special: false,
                  external_ids: {
                    tmdb_id: ep.id,
                  },
                  tmdb_vote_average: ep.vote_average || null,
                  tmdb_vote_count: ep.vote_count || null,
                  tmdb_still_path: ep.still_path || null,
                  last_synced_at: new Date().toISOString(),
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                });

              if (epInsertError) throw epInsertError;
            }

            importedEpisodes += 1;
          }
        }

        results.push({
          title,
          status: "imported",
          matched_name: fullShow.name,
          tmdb_id: tmdbShow.id,
          tvdb_id: tvdbId,
          episodes_imported: importedEpisodes,
        });
      } catch (err) {
        results.push({
          title,
          status: "error",
          error: err.message,
        });
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        user: email,
        results,
      }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: err.message,
      }),
    };
  }
};
