import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function handler() {
  try {
    // 1. Get shows missing tmdb_id
    const { data: shows, error } = await supabase
      .from("shows")
      .select("id, name, tvdb_id")
      .is("tmdb_id", null)
      .limit(50); // run in batches

    if (error) throw error;

    const results = [];

    for (const show of shows) {
      try {
        // 2. Search TMDB
        const searchRes = await fetch(
          `https://api.themoviedb.org/3/search/tv?query=${encodeURIComponent(
            show.name
          )}`,
          {
            headers: {
              Authorization: `Bearer ${process.env.TMDB_BEARER_TOKEN}`,
            },
          }
        );

        const searchJson = await searchRes.json();

        let matchedTmdbId = null;

        for (const result of searchJson.results || []) {
          // 3. Get external IDs
          const extRes = await fetch(
            `https://api.themoviedb.org/3/tv/${result.id}/external_ids`,
            {
              headers: {
                Authorization: `Bearer ${process.env.TMDB_BEARER_TOKEN}`,
              },
            }
          );

          const ext = await extRes.json();

          // 4. Match TVDB ID
          if (String(ext.tvdb_id) === String(show.tvdb_id)) {
            matchedTmdbId = result.id;
            break;
          }
        }

        if (matchedTmdbId) {
          // 5. Update DB
          await supabase
            .from("shows")
            .update({ tmdb_id: matchedTmdbId })
            .eq("id", show.id);

          results.push({
            name: show.name,
            tmdb_id: matchedTmdbId,
            status: "updated",
          });
        } else {
          results.push({
            name: show.name,
            status: "not found",
          });
        }
      } catch (err) {
        results.push({
          name: show.name,
          status: "error",
        });
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        processed: results.length,
        results,
      }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ message: error.message }),
    };
  }
}
