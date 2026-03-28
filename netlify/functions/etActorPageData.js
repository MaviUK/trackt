import { tmdbFetch, buildTmdbImageUrl } from "./_tmdb.js";
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

function normalizeName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function chooseBestPerson(results, targetName) {
  if (!Array.isArray(results) || !results.length) return null;

  const wanted = normalizeName(targetName);

  return [...results]
    .sort((a, b) => {
      const aName = normalizeName(a?.name);
      const bName = normalizeName(b?.name);

      let aScore = 0;
      let bScore = 0;

      if (aName === wanted) aScore += 100;
      if (bName === wanted) bScore += 100;

      if (a?.known_for_department === "Acting") aScore += 20;
      if (b?.known_for_department === "Acting") bScore += 20;

      aScore += Number(a?.popularity || 0);
      bScore += Number(b?.popularity || 0);

      return bScore - aScore;
    })[0];
}

function dedupeCredits(credits = []) {
  const seen = new Set();

  return credits.filter((item) => {
    const key = String(item?.id || "");
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sortCredits(credits = []) {
  return [...credits].sort((a, b) => {
    const aPopularity = Number(a?.popularity || 0);
    const bPopularity = Number(b?.popularity || 0);

    if (bPopularity !== aPopularity) {
      return bPopularity - aPopularity;
    }

    const aDate = a?.first_air_date || "";
    const bDate = b?.first_air_date || "";

    return bDate.localeCompare(aDate);
  });
}

export const handler = async (event) => {
  try {
    const name = event.queryStringParameters?.name?.trim();

    if (!name) {
      return jsonResponse(400, { message: "Missing actor name" });
    }

    const personSearch = await tmdbFetch("/search/person", {
      query: name,
      include_adult: "false",
      language: "en-US",
      page: "1",
    });

    const bestPerson = chooseBestPerson(personSearch?.results || [], name);

    if (!bestPerson?.id) {
      return jsonResponse(404, { message: "Actor not found" });
    }

    const [personDetails, tvCreditsResponse] = await Promise.all([
      tmdbFetch(`/person/${bestPerson.id}`, {
        language: "en-US",
      }),
      tmdbFetch(`/person/${bestPerson.id}/tv_credits`, {
        language: "en-US",
      }),
    ]);

    const rawCredits = Array.isArray(tvCreditsResponse?.cast)
      ? tvCreditsResponse.cast
      : [];

    const cleanedCredits = sortCredits(
      dedupeCredits(
        rawCredits
          .filter((item) => item?.id && item?.name)
          .map((item) => ({
            id: item.id,
            name: item.name,
            original_name: item.original_name || "",
            first_air_date: item.first_air_date || "",
            overview: item.overview || "",
            poster_path: item.poster_path || "",
            backdrop_path: item.backdrop_path || "",
            popularity: item.popularity || 0,
            vote_average: item.vote_average || 0,
            vote_count: item.vote_count || 0,
            character: item.character || "",
            episode_count: item.episode_count || 0,
            poster_url: buildTmdbImageUrl(item.poster_path, "w342"),
            backdrop_url: buildTmdbImageUrl(item.backdrop_path, "w780"),
          }))
      )
    );

    const enrichedCredits = await enrichShowsWithMappings(cleanedCredits);

    return jsonResponse(200, {
      actor: {
        id: personDetails?.id || bestPerson.id,
        name: personDetails?.name || bestPerson.name,
        biography: personDetails?.biography || "",
        birthday: personDetails?.birthday || "",
        deathday: personDetails?.deathday || "",
        place_of_birth: personDetails?.place_of_birth || "",
        profile_path: personDetails?.profile_path || bestPerson?.profile_path || "",
        profile_url: buildTmdbImageUrl(
          personDetails?.profile_path || bestPerson?.profile_path,
          "w500"
        ),
        known_for_department:
          personDetails?.known_for_department ||
          bestPerson?.known_for_department ||
          "",
      },
      credits: enrichedCredits,
    });
  } catch (error) {
    console.error("getActorPageData error", error);
    return jsonResponse(500, {
      message: error?.message || "Failed to load actor page",
    });
  }
};
