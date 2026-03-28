export function getMappedShowHref(show) {
  const tvdbId =
    show?.tvdb_id ??
    show?.tvdbId ??
    show?.mapped_tvdb_id ??
    show?.mappedTvdbId ??
    null;

  if (tvdbId) {
    return `/show/${tvdbId}`;
  }

  const query = encodeURIComponent(show?.name || show?.title || "");
  return query ? `/search?q=${query}` : "/search";
}

export function isMappedToTvdb(show) {
  return Boolean(
    show?.tvdb_id ??
      show?.tvdbId ??
      show?.mapped_tvdb_id ??
      show?.mappedTvdbId
  );
}

export async function enrichTmdbShowsWithMappings(shows = []) {
  if (!Array.isArray(shows) || !shows.length) {
    return [];
  }

  const payload = shows.map((show) => ({
    id: show?.id,
    name: show?.name || show?.title || "",
    first_air_date: show?.first_air_date || show?.firstAirDate || "",
    poster_path: show?.poster_path || "",
    backdrop_path: show?.backdrop_path || "",
    overview: show?.overview || "",
    vote_average: show?.vote_average || 0,
  }));

  const response = await fetch("/.netlify/functions/mapTmdbShows", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ shows: payload }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.message || "Failed to map shows");
  }

  return Array.isArray(data?.shows) ? data.shows : [];
}
