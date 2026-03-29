const TVDB_BASE_URL = "https://api4.thetvdb.com/v4";
const TMDB_BASE_URL = "https://api.themoviedb.org/3";
const TMDB_IMAGE_BASE_URL = "https://image.tmdb.org/t/p/w500";

let cachedToken = null;
let cachedTokenExpiresAt = 0;

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

async function readJsonSafe(response) {
  const text = await response.text();

  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

async function getTvdbToken() {
  const now = Date.now();

  if (cachedToken && now < cachedTokenExpiresAt) {
    return cachedToken;
  }

  const apikey = process.env.TVDB_API_KEY;
  const pin = process.env.TVDB_PIN;

  if (!apikey) {
    throw new Error("Missing TVDB_API_KEY environment variable");
  }

  const payload = { apikey };

  if (pin) {
    payload.pin = pin;
  }

  const loginRes = await fetch(`${TVDB_BASE_URL}/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const loginJson = await readJsonSafe(loginRes);

  if (!loginRes.ok) {
    throw new Error(
      `TVDB login failed (${loginRes.status}): ${
        loginJson?.message || loginJson?.status || "Unknown error"
      }`
    );
  }

  const token = loginJson?.data?.token;

  if (!token) {
    throw new Error("TVDB login succeeded but no token was returned");
  }

  cachedToken = token;
  cachedTokenExpiresAt = now + 27 * 24 * 60 * 60 * 1000;

  return token;
}

async function tvdbGet(path) {
  const token = await getTvdbToken();

  const res = await fetch(`${TVDB_BASE_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });

  const json = await readJsonSafe(res);

  if (!res.ok) {
    throw new Error(
      `TVDB request failed (${res.status}) for ${path}: ${
        json?.message || json?.status || "Unknown error"
      }`
    );
  }

  return json;
}

function pickImage(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function normalizeStringArray(values) {
  if (!Array.isArray(values)) return [];

  return values
    .map((item) => {
      if (typeof item === "string") return item.trim();
      if (item && typeof item === "object") {
        return (
          item.name ??
          item.genre ??
          item.type ??
          item.setting ??
          item.label ??
          item.value ??
          null
        );
      }
      return null;
    })
    .filter(Boolean);
}

function normalizeShow(seriesData, tvdbId) {
  if (!seriesData || typeof seriesData !== "object") return null;

  const companies = Array.isArray(seriesData?.companies) ? seriesData.companies : [];
  const originalNetwork = companies.find(
    (company) =>
      company?.primaryCompanyType === 1 ||
      company?.companyType?.companyTypeId === 1 ||
      String(company?.companyType?.name || "").toLowerCase() === "network"
  );

  const genres = normalizeStringArray(seriesData?.genres);
  const relationshipTypes = normalizeStringArray(
    seriesData?.relationship_types || seriesData?.relationshipTypes
  );
  const settings = normalizeStringArray(seriesData?.settings);

  const score =
    seriesData?.score != null && !Number.isNaN(Number(seriesData.score))
      ? Number(seriesData.score)
      : null;

  return {
    tvdb_id: tvdbId,
    name:
      seriesData?.name ||
      seriesData?.seriesName ||
      seriesData?.translations?.name ||
      "Unknown title",
    overview:
      seriesData?.overview ||
      seriesData?.translations?.overview ||
      "",
    status: seriesData?.status?.name || seriesData?.status || null,
    poster_url: pickImage(
      seriesData?.image,
      seriesData?.image_url,
      seriesData?.poster,
      seriesData?.poster_url,
      seriesData?.thumbnail
    ),
    first_aired:
      seriesData?.firstAired ||
      seriesData?.first_aired ||
      seriesData?.year ||
      null,
    network:
      originalNetwork?.name ||
      seriesData?.originalNetwork?.name ||
      seriesData?.network ||
      "",
    genres,
    original_language:
      seriesData?.originalLanguage ||
      seriesData?.original_language ||
      "",
    relationship_types: relationshipTypes,
    settings,
    rating_average: score,
    rating_count:
      seriesData?.scoreCount != null && !Number.isNaN(Number(seriesData.scoreCount))
        ? Number(seriesData.scoreCount)
        : null,
  };
}

function normalizeEpisodes(seriesData, tvdbId) {
  const rawEpisodes = Array.isArray(seriesData?.episodes) ? seriesData.episodes : [];

  return rawEpisodes
    .map((ep, index) => ({
      id: ep?.id || `${tvdbId}-ep-${index}`,
      tvdb_id: ep?.id || ep?.tvdb_id || ep?.tvdbId || null,
      season_number:
        ep?.seasonNumber ??
        ep?.season_number ??
        ep?.airedSeason ??
        0,
      episode_number:
        ep?.number ??
        ep?.episodeNumber ??
        ep?.episode_number ??
        ep?.airedEpisodeNumber ??
        0,
      episode_code:
        ep?.productionCode ||
        ep?.episodeCode ||
        ep?.episode_code ||
        null,
      name: ep?.name || "Untitled episode",
      overview: ep?.overview || "",
      aired_date:
        ep?.aired ||
        ep?.airDate ||
        ep?.aired_date ||
        null,
      image_url: pickImage(ep?.image, ep?.image_url, ep?.thumbnail),
    }))
    .sort((a, b) => {
      const seasonDiff = Number(a.season_number) - Number(b.season_number);
      if (seasonDiff !== 0) return seasonDiff;
      return Number(a.episode_number) - Number(b.episode_number);
    });
}

async function getSeriesEpisodesDefault(tvdbId) {
  try {
    const json = await tvdbGet(`/series/${tvdbId}/episodes/default`);
    const data = Array.isArray(json?.data?.episodes)
      ? json.data.episodes
      : Array.isArray(json?.data)
      ? json.data
      : [];

    return data
      .map((ep, index) => ({
        id: ep?.id || `${tvdbId}-ep-default-${index}`,
        tvdb_id: ep?.id || ep?.tvdb_id || ep?.tvdbId || null,
        season_number:
          ep?.seasonNumber ??
          ep?.season_number ??
          ep?.airedSeason ??
          0,
        episode_number:
          ep?.number ??
          ep?.episodeNumber ??
          ep?.episode_number ??
          ep?.airedEpisodeNumber ??
          0,
        episode_code:
          ep?.productionCode ||
          ep?.episodeCode ||
          ep?.episode_code ||
          null,
        name: ep?.name || "Untitled episode",
        overview: ep?.overview || "",
        aired_date:
          ep?.aired ||
          ep?.airDate ||
          ep?.aired_date ||
          null,
        image_url: pickImage(ep?.image, ep?.image_url, ep?.thumbnail),
      }))
      .sort((a, b) => {
        const seasonDiff = Number(a.season_number) - Number(b.season_number);
        if (seasonDiff !== 0) return seasonDiff;
        return Number(a.episode_number) - Number(b.episode_number);
      });
  } catch (error) {
    console.error("default episodes fetch failed:", error);
    return [];
  }
}

function normalizeCastFromSeries(seriesData) {
  const rawCharacters = Array.isArray(seriesData?.characters)
    ? seriesData.characters
    : [];

  return rawCharacters
    .map((item, index) => {
      const personName =
        item?.personName ||
        item?.person_name ||
        item?.people?.name ||
        item?.person?.name ||
        item?.name ||
        null;

      const characterName =
        item?.name ||
        item?.characterName ||
        item?.character_name ||
        item?.role ||
        null;

      const image = pickImage(
        item?.image,
        item?.image_url,
        item?.personImgURL,
        item?.personImgUrl,
        item?.people?.image,
        item?.person?.image
      );

      return {
        id: item?.id || item?.peopleId || item?.personId || `cast-${index}`,
        personName,
        characterName,
        image,
        sort: typeof item?.sort === "number" ? item.sort : index,
      };
    })
    .filter((item) => item.personName)
    .sort((a, b) => a.sort - b.sort)
    .slice(0, 18)
    .map(({ id, personName, characterName, image }) => ({
      id,
      personName,
      characterName,
      image,
    }));
}

function buildRecommendationItem(item, index, prefix = "rec") {
  const tvdbId =
    item?.tvdb_id ||
    item?.tvdbId ||
    item?.id ||
    item?.seriesId ||
    item?.series_id ||
    item?.remoteIds?.tvdb ||
    null;

  const name =
    item?.name ||
    item?.seriesName ||
    item?.series_name ||
    item?.translations?.name ||
    null;

  const posterUrl = pickImage(
    item?.poster_url,
    item?.posterUrl,
    item?.poster,
    item?.image,
    item?.image_url,
    item?.thumbnail
  );

  const firstAired =
    item?.firstAired ||
    item?.first_aired ||
    item?.year ||
    null;

  return {
    id: item?.id || `${prefix}-${index}`,
    tvdb_id: tvdbId,
    tvdbId,
    name,
    poster_url: posterUrl,
    posterUrl,
    first_aired: firstAired,
    firstAired,
  };
}

function dedupeRecommendations(items) {
  const seen = new Set();

  return items.filter((item) => {
    const key = String(item.tvdb_id || item.tvdbId || item.name || "");
    if (!key) return false;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizePeopleAlsoWatch(seriesData) {
  const candidates = [
    ...(Array.isArray(seriesData?.peopleAlsoWatch) ? seriesData.peopleAlsoWatch : []),
    ...(Array.isArray(seriesData?.people_also_watch) ? seriesData.people_also_watch : []),
  ];

  return dedupeRecommendations(
    candidates
      .map((item, index) => buildRecommendationItem(item, index, "paw"))
      .filter((item) => item.tvdb_id && item.name)
  ).slice(0, 12);
}

function normalizeRecommendations(seriesData) {
  const candidates = [
    ...(Array.isArray(seriesData?.recommendations) ? seriesData.recommendations : []),
    ...(Array.isArray(seriesData?.similar) ? seriesData.similar : []),
    ...(Array.isArray(seriesData?.relatedSeries) ? seriesData.relatedSeries : []),
    ...(Array.isArray(seriesData?.related_series) ? seriesData.related_series : []),
  ];

  return dedupeRecommendations(
    candidates
      .map((item, index) => buildRecommendationItem(item, index, "rec"))
      .filter((item) => item.tvdb_id && item.name)
  ).slice(0, 12);
}

async function getPeopleAlsoWatch(tvdbId) {
  try {
    const json = await tvdbGet(`/series/${tvdbId}/filter`);
    const data = Array.isArray(json?.data) ? json.data : [];

    return dedupeRecommendations(
      data
        .map((item, index) => ({
          id: item?.id || `paw-${index}`,
          tvdb_id: item?.id || item?.tvdb_id || item?.tvdbId || null,
          tvdbId: item?.id || item?.tvdb_id || item?.tvdbId || null,
          name:
            item?.name ||
            item?.seriesName ||
            item?.series_name ||
            item?.translations?.name ||
            null,
          poster_url: pickImage(
            item?.image,
            item?.thumbnail,
            item?.poster,
            item?.poster_url,
            item?.posterUrl
          ),
          posterUrl: pickImage(
            item?.image,
            item?.thumbnail,
            item?.poster,
            item?.poster_url,
            item?.posterUrl
          ),
          first_aired:
            item?.firstAired ||
            item?.first_aired ||
            item?.year ||
            null,
          firstAired:
            item?.firstAired ||
            item?.first_aired ||
            item?.year ||
            null,
        }))
        .filter((item) => item.tvdb_id && item.name)
    ).slice(0, 12);
  } catch (error) {
    console.error("peopleAlsoWatch fetch failed:", error);
    return [];
  }
}

async function findTmdbTvIdByTvdbId(tvdbId) {
  const apiKey = process.env.TMDB_API_KEY;

  if (!apiKey) return null;

  const findRes = await fetch(
    `${TMDB_BASE_URL}/find/${tvdbId}?api_key=${encodeURIComponent(
      apiKey
    )}&external_source=tvdb_id`,
    {
      headers: {
        Accept: "application/json",
      },
    }
  );

  const findJson = await readJsonSafe(findRes);

  if (!findRes.ok) {
    throw new Error(
      `TMDB find failed (${findRes.status}): ${
        findJson?.status_message || "Unknown error"
      }`
    );
  }

  return findJson?.tv_results?.[0]?.id || null;
}

async function getTmdbRecommendations(tvdbId) {
  try {
    const apiKey = process.env.TMDB_API_KEY;
    if (!apiKey) return [];

    const tmdbId = await findTmdbTvIdByTvdbId(tvdbId);
    if (!tmdbId) return [];

    const recRes = await fetch(
      `${TMDB_BASE_URL}/tv/${tmdbId}/recommendations?api_key=${encodeURIComponent(
        apiKey
      )}`,
      {
        headers: {
          Accept: "application/json",
        },
      }
    );

    const recJson = await readJsonSafe(recRes);

    if (!recRes.ok) {
      throw new Error(
        `TMDB recommendations failed (${recRes.status}): ${
          recJson?.status_message || "Unknown error"
        }`
      );
    }

    return dedupeRecommendations(
      (Array.isArray(recJson?.results) ? recJson.results : [])
        .map((item, index) => ({
          id: item?.id || `tmdb-rec-${index}`,
          tmdb_id: item?.id || null,
          tvdb_id: null,
          tvdbId: null,
          source: "tmdb",
          name: item?.name || item?.original_name || null,
          overview: item?.overview || "",
          first_air_date: item?.first_air_date || null,
          first_aired: item?.first_air_date || null,
          firstAired: item?.first_air_date || null,
          poster_path: item?.poster_path || "",
          poster_url: item?.poster_path
            ? `${TMDB_IMAGE_BASE_URL}${item.poster_path}`
            : null,
          posterUrl: item?.poster_path
            ? `${TMDB_IMAGE_BASE_URL}${item.poster_path}`
            : null,
        }))
        .filter((item) => item.name)
    ).slice(0, 12);
  } catch (error) {
    console.error("TMDB recommendations failed:", error);
    return [];
  }
}

async function getTmdbProvidersAndTrailer(tvdbId) {
  try {
    const apiKey = process.env.TMDB_API_KEY;
    if (!apiKey) {
      return { providers: [], trailer: null };
    }

    const tmdbId = await findTmdbTvIdByTvdbId(tvdbId);
    if (!tmdbId) {
      return { providers: [], trailer: null };
    }

    const [providersRes, videosRes] = await Promise.all([
      fetch(
        `${TMDB_BASE_URL}/tv/${tmdbId}/watch/providers?api_key=${encodeURIComponent(
          apiKey
        )}`,
        {
          headers: { Accept: "application/json" },
        }
      ),
      fetch(
        `${TMDB_BASE_URL}/tv/${tmdbId}/videos?api_key=${encodeURIComponent(apiKey)}`,
        {
          headers: { Accept: "application/json" },
        }
      ),
    ]);

    const providersJson = await readJsonSafe(providersRes);
    const videosJson = await readJsonSafe(videosRes);

    if (!providersRes.ok) {
      throw new Error(
        `TMDB providers failed (${providersRes.status}): ${
          providersJson?.status_message || "Unknown error"
        }`
      );
    }

    if (!videosRes.ok) {
      throw new Error(
        `TMDB videos failed (${videosRes.status}): ${
          videosJson?.status_message || "Unknown error"
        }`
      );
    }

    const providerRegion =
      providersJson?.results?.GB ||
      providersJson?.results?.US ||
      null;

    const providerItems = [
      ...(Array.isArray(providerRegion?.flatrate) ? providerRegion.flatrate : []),
      ...(Array.isArray(providerRegion?.free) ? providerRegion.free : []),
      ...(Array.isArray(providerRegion?.ads) ? providerRegion.ads : []),
      ...(Array.isArray(providerRegion?.rent) ? providerRegion.rent : []),
      ...(Array.isArray(providerRegion?.buy) ? providerRegion.buy : []),
    ];

    const seenProviders = new Set();
    const providers = providerItems
      .filter((item) => {
        const key = String(item?.provider_id || item?.provider_name || "");
        if (!key || seenProviders.has(key)) return false;
        seenProviders.add(key);
        return true;
      })
      .map((item) => ({
        id: item?.provider_id || item?.provider_name,
        name: item?.provider_name || "Unknown provider",
        logo: item?.logo_path ? `${TMDB_IMAGE_BASE_URL}${item.logo_path}` : null,
      }))
      .slice(0, 8);

    const videos = Array.isArray(videosJson?.results) ? videosJson.results : [];
    const trailerCandidate =
      videos.find(
        (video) =>
          video?.site === "YouTube" &&
          video?.type === "Trailer" &&
          video?.official
      ) ||
      videos.find(
        (video) =>
          video?.site === "YouTube" &&
          video?.type === "Trailer"
      ) ||
      videos.find(
        (video) =>
          video?.site === "YouTube" &&
          video?.type === "Teaser"
      ) ||
      null;

    const trailer = trailerCandidate?.key
      ? {
          name: trailerCandidate.name || "Watch Trailer",
          url: `https://www.youtube.com/watch?v=${trailerCandidate.key}`,
        }
      : null;

    return { providers, trailer };
  } catch (error) {
    console.error("TMDB providers/trailer failed:", error);
    return { providers: [], trailer: null };
  }
}

export async function handler(event) {
  try {
    const tvdbIdRaw = event.queryStringParameters?.tvdbId;
    const tvdbId = Number(tvdbIdRaw);

    if (!tvdbIdRaw || Number.isNaN(tvdbId) || tvdbId <= 0) {
      return jsonResponse(400, { error: "Missing or invalid tvdbId" });
    }

    const seriesJson = await tvdbGet(`/series/${tvdbId}/extended`);
    const seriesData = seriesJson?.data || {};

    const show = normalizeShow(seriesData, tvdbId);

    const inlineEpisodes = normalizeEpisodes(seriesData, tvdbId);
    const fetchedEpisodes = await getSeriesEpisodesDefault(tvdbId);
    const episodes = fetchedEpisodes.length > 0 ? fetchedEpisodes : inlineEpisodes;

    const cast = normalizeCastFromSeries(seriesData);

    const inlinePeopleAlsoWatch = normalizePeopleAlsoWatch(seriesData);
    const fetchedPeopleAlsoWatch = await getPeopleAlsoWatch(tvdbId);
    const peopleAlsoWatch =
      fetchedPeopleAlsoWatch.length > 0
        ? fetchedPeopleAlsoWatch
        : inlinePeopleAlsoWatch;

    const fallbackRecommendations = normalizeRecommendations(seriesData);

    let tmdbRecommendations = [];
    if (peopleAlsoWatch.length === 0 && fallbackRecommendations.length === 0) {
      tmdbRecommendations = await getTmdbRecommendations(tvdbId);
    }

    const recommendations =
      peopleAlsoWatch.length > 0
        ? peopleAlsoWatch
        : fallbackRecommendations.length > 0
        ? fallbackRecommendations
        : tmdbRecommendations;

    const { providers, trailer } = await getTmdbProvidersAndTrailer(tvdbId);

    return jsonResponse(200, {
      show,
      episodes,
      cast,
      providers,
      trailer,
      peopleAlsoWatch,
      recommendations,
      debug: {
        showFound: !!show,
        inlineEpisodeCount: inlineEpisodes.length,
        fetchedEpisodeCount: fetchedEpisodes.length,
        episodeCount: episodes.length,
        castCount: cast.length,
        providerCount: providers.length,
        hasTrailer: !!trailer,
      },
    });
  } catch (error) {
    console.error("getShowExtras failed:", error);

    return jsonResponse(500, {
      error: error.message || "Failed to load show extras",
      show: null,
      episodes: [],
      cast: [],
      providers: [],
      trailer: null,
      peopleAlsoWatch: [],
      recommendations: [],
    });
  }
}
