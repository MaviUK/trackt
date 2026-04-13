import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function cleanShowName(name) {
  return String(name || "")
    .replace(/\s*\(\d{4}\)\s*/g, " ")
    .replace(/\s*\((US|UK)\)\s*/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message: "Method not allowed" }),
    };
  }

  try {
    const { data: shows, error } = await supabase
      .from("shows")
      .select("id, name, tvdb_id")
      .is("tmdb_id", null)
      .limit(50);

    if (error) throw error;

    const results = [];

    for (const show of shows || []) {
      try {
        const searchName = cleanShowName(show.name);

        const searchRes = await fetch(
          `https://api.themoviedb.org/3/search/tv?query=${encodeURIComponent(
            searchName
          )}`,
          {
            headers: {
              Authorization: `Bearer ${process.env.TMDB_BEARER_TOKEN}`,
              accept: "application/json",
            },
          }
        );

        const searchJson = await searchRes.json();
        let matchedTmdbId = null;

        for (const result of searchJson.results || []) {
          const extRes = await fetch(
            `https://api.themoviedb.org/3/tv/${result.id}/external_ids`,
            {
              headers: {
                Authorization: `Bearer ${process.env.TMDB_BEARER_TOKEN}`,
                accept: "application/json",
              },
            }
          );

          const ext = await extRes.json();

          if (String(ext.tvdb_id) === String(show.tvdb_id)) {
            matchedTmdbId = result.id;
            break;
          }
        }

        if (matchedTmdbId) {
          const { error: updateError } = await supabase
            .from("shows")
            .update({ tmdb_id: matchedTmdbId })
            .eq("id", show.id);

          if (updateError) throw updateError;

          results.push({
            name: show.name,
            search_name: searchName,
            tmdb_id: matchedTmdbId,
            status: "updated",
          });
        } else {
          results.push({
            name: show.name,
            search_name: searchName,
            status: "not_found",
          });
        }
      } catch (err) {
        results.push({
          name: show.name,
          status: "error",
          error: err.message,
        });
      }
    }

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
      body: JSON.stringify({
        processed: results.length,
        results,
      }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
      body: JSON.stringify({
        message: error.message,
      }),
    };
  }
}
