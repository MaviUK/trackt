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

function getTimeValue(dateString) {
  if (!dateString) return 0;
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return 0;
  return date.getTime();
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

function sortCreditsNewestFirst(credits = []) {
  return [...credits].sort((a, b) => {
    const aDate = getTimeValue(a?.first_air_date);
    const bDate = getTimeValue(b?.first_air_date);

    if (bDate !== aDate) return bDate - aDate;

    const aPopularity = Number(a?.popularity || 0);
    const bPopularity = Number(b?.popularity || 0);

    return bPopularity - aPopularity;
  });
}

function isUsableCredit(item) {
  if (!item?.id || !item?.name) return false;
  if (!item?.first_air_date) return false;
  return true;
}

async function chooseBestPersonWithCredits(results, targetName) {
  if (!Array.isArray(results) || !results.length) return null;

  const wanted = normalizeName(targetName);
  const candidates = results.slice(0, 5);

  const evaluated = await Promise.all(
    candidates.map(async (person) => {
      const personName = normalizeName(person?.name);
      let nameScore = 0;

      if (personName === wanted) nameScore += 100;
      else if (personName.includes(wanted) || wanted.includes(personName))
        nameScore += 60;

      if (person?.known_for_department === "Acting") nameScore += 20;

      const popularityScore = Number(person?.popularity || 0);

      try {
        const tvCreditsResponse = await tmdbFetch(`/person/${person.id}/tv_credits`, {
          language: "en-US",
        });

        const rawCredits = Array.isArray(tvCreditsResponse?.cast)
          ? tvCreditsResponse.cast
          : [];

        const usableCredits = dedupeCredits(rawCredits.filter(isUsableCredit));

        return {
          person,
          rawCredits,
          usableCredits,
          score: nameScore + popularityScore + usableCredits.length * 5,
        };
      } catch (error) {
        return {
          person,
          rawCredits: [],
          usableCredits: [],
          score: nameScore + popularityScore,
        };
      }
    })
  );

  evaluated.sort((a, b) => b.score - a.score);

  return evaluated[0] || null;
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

    const bestMatch = await chooseBestPersonWithCredits(
      personSearch?.results || [],
      name
    );

    if (!bestMatch?.person?.id) {
      return jsonResponse(404, { message: "Actor not found" });
    }

    const person = bestMatch.person;

    const [personDetails] = await Promise.all([
      tmdbFetch(`/person/${person.id}`, {
        language: "en-US",
      }),
    ]);

    const cleanedCredits = sortCreditsNewestFirst(
      dedupeCredits(
        (bestMatch.rawCredits || [])
          .filter(isUsableCredit)
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
      first_air_date: item?.first_air_date || null,
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
        id: personDetails?.id || person.id,
        name: personDetails?.name || person.name,
        biography: personDetails?.biography || "",
        birthday: personDetails?.birthday || "",
        deathday: personDetails?.deathday || "",
        place_of_birth: personDetails?.place_of_birth || "",
        profile_path:
          personDetails?.profile_path || person?.profile_path || "",
        profile_url: buildTmdbImageUrl(
          personDetails?.profile_path || person?.profile_path,
          "w500"
        ),
        known_for_department:
          personDetails?.known_for_department ||
          person?.known_for_department ||
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
