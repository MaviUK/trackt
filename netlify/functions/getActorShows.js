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

function getYearValue(dateString) {
  if (!dateString) return 0;
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return 0;
  return date.getTime();
}

function sortCreditsNewestFirst(credits = []) {
  return [...credits].sort((a, b) => {
    const aDate = getYearValue(a?.first_air_date);
    const bDate = getYearValue(b?.first_air_date);

    if (bDate !== aDate) return bDate - aDate;

    const aPopularity = Number(a?.popularity || 0);
    const bPopularity = Number(b?.popularity || 0);

    return bPopularity - aPopularity;
  });
}

function looksLikeTalkShow(item) {
  const text = [
    item?.name,
    item?.overview,
    item?.character,
    item?.original_name,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const blockedPhrases = [
    "talk show",
    "late show",
    "late late show",
    "late night",
    "tonight show",
    "with jimmy",
    "with seth",
    "with stephen",
    "with andy cohen",
    "watch what happens live",
    "kelly clarkson show",
    "jimmy kimmel live",
    "the view",
    "conan",
    "starralk",
    "carpool karaoke",
    "awards",
    "emmy",
    "critics choice",
    "live with",
    "guest appearance",
    "himself",
    "herself",
    "self",
    "host",
    "interview",
    "variety show",
    "reality",
    "competition series",
    "game show",
    "news program",
    "daytime",
    "telethon",
    "ceremony",
  ];

  return blockedPhrases.some((phrase) => text.includes(phrase));
}

function isScriptedEnough(item) {
  if (!item?.name) return false;
  if (looksLikeTalkShow(item)) return false;
  return true;
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

    const cleanedCredits = sortCreditsNewestFirst(
      dedupeCredits(
        rawCredits
          .filter((item) => item?.id && item?.name)
          .filter(isScriptedEnough)
          .map((item) => ({
            id: item.id,
            tmdb_id: item.id,
            name: item.name,
            original_name: item.original_name || "",
            overview: item.overview || "",
            first_air_date: item.first_air_date || "",
            first_air_time: item.first_air_date || "",
            poster_path: item.poster_path || "",
            backdrop_path: item.backdrop_path || "",
            poster_url: buildTmdbImageUrl(item.poster_path, "w500"),
            image_url: buildTmdbImageUrl(item.poster_path, "w500"),
            vote_average: Number(item.vote_average || 0),
            vote_count: Number(item.vote_count || 0),
            popularity: Number(item.popularity || 0),
            original_language: item.original_language || "",
            character: item.character || "",
            source: "tmdb",
          }))
      )
    );

    let mappedCredits = [];

    try {
      mappedCredits = await enrichShowsWithMappings(cleanedCredits);
    } catch (mappingError) {
      console.error("Failed to map TMDB actor credits:", mappingError);
      mappedCredits = cleanedCredits.map((item) => ({
        ...item,
        tvdb_id: null,
        mapping_status: "error",
        mapping_method: null,
        mapping_confidence: 0,
      }));
    }

    const output = mappedCredits.map((item) => ({
      tvdb_id: item?.tvdb_id ?? null,
      tmdb_id: item?.tmdb_id ?? item?.id ?? null,
      name: item?.name || "",
      overview: item?.overview || "",
      status: item?.status || null,
      first_aired: item?.first_air_date || null,
      first_air_time: item?.first_air_date || null,
      image_url: item?.image_url || item?.poster_url || null,
      poster_url: item?.poster_url || item?.image_url || null,
      slug: item?.slug || null,
      network: item?.network || null,
      genres: Array.isArray(item?.genres) ? item.genres : [],
      relationship_types: Array.isArray(item?.relationship_types)
        ? item.relationship_types
        : [],
      settings: Array.isArray(item?.settings) ? item.settings : [],
      original_language: item?.original_language || "",
      rating_average:
        item?.rating_average != null
          ? Number(item.rating_average)
          : item?.vote_average != null
          ? Number(item.vote_average)
          : 0,
      rating_count:
        item?.rating_count != null
          ? Number(item.rating_count)
          : item?.vote_count != null
          ? Number(item.vote_count)
          : 0,
      source: item?.source || "tmdb",
      mapping_status: item?.mapping_status || null,
      mapping_method: item?.mapping_method || null,
      mapping_confidence: item?.mapping_confidence || 0,
      character: item?.character || "",
    }));

    return jsonResponse(200, {
      actor: {
        id: personDetails?.id || bestPerson.id,
        name: personDetails?.name || bestPerson.name,
        biography: personDetails?.biography || "",
        birthday: personDetails?.birthday || "",
        deathday: personDetails?.deathday || "",
        place_of_birth: personDetails?.place_of_birth || "",
        profile_path:
          personDetails?.profile_path || bestPerson?.profile_path || "",
        profile_url: buildTmdbImageUrl(
          personDetails?.profile_path || bestPerson?.profile_path,
          "w500"
        ),
        known_for_department:
          personDetails?.known_for_department ||
          bestPerson?.known_for_department ||
          "",
      },
      credits: output,
    });
  } catch (error) {
    console.error("getActorShows error", error);
    return jsonResponse(500, {
      message: error?.message || "Failed to load actor shows",
    });
  }
};
