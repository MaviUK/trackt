import { enrichShowsWithMappings } from "./_showMapping.js";

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
    body: JSON.stringify(body),
  };
}

export const handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return jsonResponse(405, { message: "Method not allowed" });
    }

    const body = event.body ? JSON.parse(event.body) : {};
    const shows = Array.isArray(body?.shows) ? body.shows : [];

    if (!shows.length) {
      return jsonResponse(200, { shows: [] });
    }

    const trimmed = shows.slice(0, 50);
    const enriched = await enrichShowsWithMappings(trimmed);

    return jsonResponse(200, { shows: enriched });
  } catch (error) {
    console.error("mapTmdbShows error", error);
    return jsonResponse(500, {
      message: error?.message || "Failed to map TMDB shows",
    });
  }
};
