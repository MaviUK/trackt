function getNumericId(value) {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : null;
}

function buildSearchFallback(show) {
  const query = encodeURIComponent(
    show?.name || show?.title || show?.show_name || ""
  );
  return query ? `/search?q=${query}` : "/search";
}

export function normalizeMappedShow(show) {
  if (!show || typeof show !== "object") {
    return {
      ...show,
      resolved_tvdb_id: null,
      resolved_href: "/search",
      is_mapped: false,
    };
  }

  const source = String(show.source || "").toLowerCase();

  const explicitTvdbId =
    getNumericId(show.tvdb_id) ??
    getNumericId(show.tvdbId) ??
    getNumericId(show.mapped_tvdb_id) ??
    getNumericId(show.mappedTvdbId) ??
    getNumericId(show.show_id);

  const sourceAwareTvdbId =
    explicitTvdbId ??
    (source === "tvdb" ? getNumericId(show.id) : null);

  const resolvedTvdbId = sourceAwareTvdbId || null;
  const resolvedHref = resolvedTvdbId
    ? `/show/${resolvedTvdbId}`
    : buildSearchFallback(show);

  return {
    ...show,
    resolved_tvdb_id: resolvedTvdbId,
    resolved_href: resolvedHref,
    is_mapped: Boolean(resolvedTvdbId),
  };
}

export function getMappedShowHref(show) {
  return normalizeMappedShow(show).resolved_href;
}

export function isMappedToTvdb(show) {
  return normalizeMappedShow(show).is_mapped;
}

export async function enrichTmdbShowsWithMappings(shows = []) {
  if (!Array.isArray(shows) || !shows.length) {
    return [];
  }

  const payload = shows.map((show) => ({
    id: show?.id,
    name: show?.name || show?.title || show?.show_name || "",
    first_air_date:
      show?.first_air_date || show?.firstAired || show?.first_aired || "",
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

  return Array.isArray(data?.shows)
    ? data.shows.map((show) =>
        normalizeMappedShow({
          ...show,
          source: show?.source || "tmdb",
        })
      )
    : [];
}
