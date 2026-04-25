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

function getYear(dateValue) {
  if (!dateValue) return null;
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return null;
  return date.getFullYear();
}

async function tmdbFetch(url) {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${process.env.TMDB_BEARER_TOKEN}`,
      accept: "application/json",
    },
  });

  if (!res.ok) {
    throw new Error(`TMDB request failed: ${res.status}`);
  }

  return res.json();
}

export async function handler(event) {
  if (!["GET", "POST"].includes(event.httpMethod)) {
    return {
      statusCode: 405,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "Method not allowed" }),
    };
  }

  try {
    const limit = Number(event.queryStringParameters?.limit || 50);

    const { data: shows, error } = await supabase
      .from("shows")
      .select("id, name, tvdb_id, tmdb_id, first_aired")
      .is("tmdb_id", null)
      .not("tvdb_id", "is", null)
      .limit(limit);

    if (error) throw error;

    const results = [];

    for (const show of shows || []) {
      try {
        const searchName = cleanShowName(show.name);
        const year = getYear(show.first_aired);

        const searchUrl =
          `https://api.themoviedb.org/3/search/tv?query=${encodeURIComponent(
            searchName
          )}` + (year ? `&first_air_date_year=${year}` : "");

        const searchJson = await tmdbFetch(searchUrl);

        let matchedTmdbId = null;
        let matchedName = null;

        for (const result of searchJson.results || []) {
          const ext = await tmdbFetch(
            `https://api.themoviedb.org/3/tv/${result.id}/external_ids`
          );

          if (String(ext.tvdb_id) === String(show.tvdb_id)) {
            matchedTmdbId = result.id;
            matchedName = result.name || result.original_name || null;
            break;
          }
        }

        if (!matchedTmdbId) {
          results.push({
            id: show.id,
            name: show.name,
            tvdb_id: show.tvdb_id,
            search_name: searchName,
            year,
            status: "not_found",
          });
          continue;
        }

        const { error: updateError } = await supabase
          .from("shows")
          .update({ tmdb_id: matchedTmdbId })
          .eq("id", show.id);

        if (updateError) throw updateError;

        results.push({
          id: show.id,
          name: show.name,
          matched_name: matchedName,
          tvdb_id: show.tvdb_id,
          tmdb_id: matchedTmdbId,
          status: "updated",
        });
      } catch (err) {
        results.push({
          id: show.id,
          name: show.name,
          tvdb_id: show.tvdb_id,
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
        remaining_batch_limit: limit,
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
