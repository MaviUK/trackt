const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BULK_IMPORT_SECRET = process.env.BULK_IMPORT_SECRET;

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY
);

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
    `https://api.themoviedb.org/3/tv/${tmdbId}?api_key=${TMDB_API_KEY}`
  );
}

async function fetchSeason(tmdbId, seasonNumber) {
  return fetchJson(
    `https://api.themoviedb.org/3/tv/${tmdbId}/season/${seasonNumber}?api_key=${TMDB_API_KEY}`
  );
}

exports.handler = async (event) => {
  try {
    const secret = event.headers["x-bulk-import-secret"];

    if (!BULK_IMPORT_SECRET || secret !== BULK_IMPORT_SECRET) {
      return {
        statusCode: 401,
        body: JSON.stringify({
          error: "Unauthorized",
        }),
      };
    }

    const body = JSON.parse(event.body || "{}");

    const email = body.email;
    const titles = body.titles || [];

    if (!email || !Array.isArray(titles)) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: "Invalid payload",
        }),
      };
    }

    const {
      data: authUsers,
      error: authError,
    } = await supabase.auth.admin.listUsers();

    if (authError) {
      throw authError;
    }

    const user = authUsers.users.find(
      (u) => u.email?.toLowerCase() === email.toLowerCase()
    );

    if (!user) {
      throw new Error(`User not found: ${email}`);
    }

    const userId = user.id;

    const results = [];

    for (const title of titles) {
      try {
        console.log(`Importing ${title}`);

        const tmdbShow = await searchShow(title);

        if (!tmdbShow) {
          results.push({
            title,
            status: "not_found",
          });

          continue;
        }

        const fullShow = await fetchShowDetails(tmdbShow.id);

        let { data: existingShow } = await supabase
          .from("shows")
          .select("*")
          .eq("tmdb_id", tmdbShow.id)
          .maybeSingle();

        let showId;

        if (!existingShow) {
          const { data: insertedShow, error: showInsertError } =
            await supabase
              .from("shows")
              .insert({
                tmdb_id: tmdbShow.id,
                name: fullShow.name,
                original_name: fullShow.original_name,
                overview: fullShow.overview,
                poster_path: fullShow.poster_path,
                backdrop_path: fullShow.backdrop_path,
                first_aired: fullShow.first_air_date,
                language: fullShow.original_language,
                popularity: fullShow.popularity,
                vote_average: fullShow.vote_average,
                episode_count: fullShow.number_of_episodes,
                season_count: fullShow.number_of_seasons,
              })
              .select()
              .single();

          if (showInsertError) {
            throw showInsertError;
          }

          existingShow = insertedShow;
        }

        showId = existingShow.id;

        await supabase
          .from("user_shows_new")
          .upsert(
            {
              user_id: userId,
              show_id: showId,
              watch_status: "completed",
              updated_at: new Date().toISOString(),
            },
            {
              onConflict: "user_id,show_id",
            }
          );

        for (const season of fullShow.seasons || []) {
          if (season.season_number === 0) continue;

          const seasonData = await fetchSeason(
            tmdbShow.id,
            season.season_number
          );

          for (const ep of seasonData.episodes || []) {
            let { data: existingEpisode } = await supabase
              .from("episodes")
              .select("*")
              .eq("show_id", showId)
              .eq("season_number", season.season_number)
              .eq("episode_number", ep.episode_number)
              .maybeSingle();

            if (!existingEpisode) {
              const { data: insertedEpisode, error: epInsertError } =
                await supabase
                  .from("episodes")
                  .insert({
                    show_id: showId,
                    tmdb_id: ep.id,
                    season_number: season.season_number,
                    episode_number: ep.episode_number,
                    name: ep.name,
                    overview: ep.overview,
                    still_path: ep.still_path,
                    air_date: ep.air_date,
                  })
                  .select()
                  .single();

              if (epInsertError) {
                throw epInsertError;
              }

              existingEpisode = insertedEpisode;
            }

            await supabase
              .from("watched_episodes")
              .upsert(
                {
                  user_id: userId,
                  episode_id: existingEpisode.id,
                  watched_at: new Date().toISOString(),
                },
                {
                  onConflict: "user_id,episode_id",
                }
              );
          }
        }

        results.push({
          title,
          status: "imported",
        });
      } catch (err) {
        console.error(title, err);

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
        results,
      }),
    };
  } catch (err) {
    console.error(err);

    return {
      statusCode: 500,
      body: JSON.stringify({
        error: err.message,
      }),
    };
  }
};
