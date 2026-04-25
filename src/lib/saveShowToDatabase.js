import { supabase } from "./supabase";

function normalizeDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function normalizeNumber(value) {
  if (value === null || value === undefined) return null;

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const num = Number(trimmed);
    return Number.isFinite(num) ? num : null;
  }

  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function normalizeNetwork(networkValue) {
  if (!networkValue) return null;

  if (Array.isArray(networkValue)) {
    const names = networkValue
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object") return item.name ?? null;
        return null;
      })
      .filter(Boolean);

    return names.length ? names.join(", ") : null;
  }

  if (typeof networkValue === "object") {
    return networkValue.name ?? null;
  }

  return networkValue;
}

function normalizeTextArray(value) {
  if (!Array.isArray(value)) return [];

  return Array.from(
    new Set(
      value
        .map((item) => {
          if (typeof item === "string") return item.trim();
          if (item && typeof item === "object") {
            return (item.name ?? item.value ?? item.label ?? "").trim();
          }
          return "";
        })
        .filter(Boolean)
    )
  );
}

function normalizeGenres(genresValue) {
  if (!Array.isArray(genresValue)) return [];

  return genresValue
    .map((genre) => {
      if (typeof genre === "string") return genre;
      if (genre && typeof genre === "object") {
        return genre.name ?? genre.genre ?? null;
      }
      return null;
    })
    .filter(Boolean);
}

function chunkArray(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

async function upsertInBatches(table, rows, onConflict, batchSize = 200) {
  if (!rows.length) return;

  const chunks = chunkArray(rows, batchSize);

  for (const chunk of chunks) {
    const { error } = await supabase.from(table).upsert(chunk, { onConflict });
    if (error) throw error;
  }
}

function dedupeByKey(rows, getKey) {
  const map = new Map();

  for (const row of rows) {
    const key = getKey(row);
    if (!key) continue;
    map.set(key, row);
  }

  return [...map.values()];
}

function looksLikeOverviewText(value) {
  if (typeof value !== "string") return false;

  const text = value.trim();
  if (!text) return false;
  if (text.length > 140) return true;
  if (/[.?!]\s+[A-Z]/.test(text) && text.length > 60) return true;
  if (
    /\b(the story|follows|centers on|focuses on|about|journey|after|when)\b/i.test(
      text
    )
  ) {
    return true;
  }

  return false;
}

function cleanText(value) {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text || null;
}

function pickEnglishName(showDetails) {
  const candidates = [
    showDetails?.english_name,
    showDetails?.name_eng,
    showDetails?.english_title,
    showDetails?.nameEn,
    showDetails?.translations?.eng?.name,
    showDetails?.translations?.en?.name,
    showDetails?.seriesName,
    showDetails?.series_name,
    showDetails?.name,
    showDetails?.show_name,
  ];

  for (const candidate of candidates) {
    const value = cleanText(candidate);
    if (!value) continue;
    if (looksLikeOverviewText(value)) continue;
    return value;
  }

  return cleanText(showDetails?.name) || "Unknown title";
}

function pickEnglishOverview(showDetails) {
  const candidates = [
    showDetails?.english_overview,
    showDetails?.overview_eng,
    showDetails?.overview_english,
    showDetails?.translations?.eng?.overview,
    showDetails?.translations?.en?.overview,
    showDetails?.overview,
  ];

  for (const candidate of candidates) {
    const value = cleanText(candidate);
    if (!value) continue;
    return value;
  }

  return null;
}

function buildShowPayload(showDetails) {
  const tvdbId = normalizeNumber(showDetails.tvdb_id || null);
  const tmdbId = normalizeNumber(showDetails.tmdb_id || null);

  if (!tvdbId && !tmdbId) {
    throw new Error("Missing valid show id");
  }

  const resolvedName = pickEnglishName(showDetails);
  const resolvedOverview = pickEnglishOverview(showDetails);

  return {
    tvdb_id: tvdbId,
    tmdb_id: tmdbId,
    slug: showDetails.slug ?? null,
    name: resolvedName,
    original_name:
      showDetails.original_name ??
      (showDetails.name && showDetails.name !== resolvedName
        ? showDetails.name
        : null),
    overview: resolvedOverview,
    status:
      typeof showDetails.status === "object"
        ? showDetails.status?.name ?? null
        : showDetails.status ?? null,
    original_country: showDetails.original_country ?? null,
    original_language: showDetails.original_language ?? null,
    first_aired: normalizeDate(
      showDetails.first_aired ??
        showDetails.first_air_date ??
        showDetails.first_air_time
    ),
    last_aired: normalizeDate(showDetails.last_aired ?? null),
    next_aired: normalizeDate(showDetails.next_aired ?? null),
    runtime_minutes: normalizeNumber(
      showDetails.runtime_minutes ??
        showDetails.averageRuntime ??
        showDetails.runtime
    ),
    network: normalizeNetwork(
      showDetails.network ??
        showDetails.originalNetwork ??
        showDetails.latestNetwork ??
        showDetails.networks
    ),
    content_rating:
      showDetails.content_rating ?? showDetails.contentRating ?? null,
    genres: normalizeGenres(showDetails.genres),
    aliases: normalizeTextArray(showDetails.aliases),
    relationship_types: normalizeTextArray(showDetails.relationship_types),
    settings: normalizeTextArray(showDetails.settings),
    poster_url:
      showDetails.poster_url ??
      showDetails.image_url ??
      showDetails.image ??
      null,
    backdrop_url:
      showDetails.backdrop_url ??
      showDetails.backdrop ??
      showDetails.background_url ??
      null,
    banner_url: showDetails.banner_url ?? showDetails.banner ?? null,
    external_ids: showDetails.external_ids ?? {},
    rating_average: normalizeNumber(
      showDetails.rating_average ??
        showDetails.siteRating ??
        showDetails.score ??
        showDetails.rating ??
        showDetails.vote_average
    ),
    rating_count: normalizeNumber(
      showDetails.rating_count ??
        showDetails.siteRatingCount ??
        showDetails.vote_count
    ),
    last_synced_at: new Date().toISOString(),
  };
}

function buildSeasonRows(showId, episodes) {
  const bySeason = new Map();

  for (const ep of episodes) {
    const seasonNumber = Number(ep.seasonNumber ?? ep.season_number ?? 0);
    const airedDate = normalizeDate(ep.aired ?? ep.aired_date ?? null);

    const existing = bySeason.get(seasonNumber) ?? {
      show_id: showId,
      season_type: "official",
      season_number: seasonNumber,
      name: seasonNumber === 0 ? "Specials" : `Season ${seasonNumber}`,
      episode_count: 0,
      aired_from: null,
      aired_to: null,
      last_synced_at: new Date().toISOString(),
    };

    existing.episode_count += 1;

    if (airedDate) {
      if (!existing.aired_from || airedDate < existing.aired_from) {
        existing.aired_from = airedDate;
      }
      if (!existing.aired_to || airedDate > existing.aired_to) {
        existing.aired_to = airedDate;
      }
    }

    bySeason.set(seasonNumber, existing);
  }

  return [...bySeason.values()].sort(
    (a, b) => a.season_number - b.season_number
  );
}

function buildEpisodeRows(showId, seasonIdByNumber, episodes) {
  const rows = episodes
    .filter((ep) => {
      const seasonNumber = Number(ep.seasonNumber ?? ep.season_number ?? 0);
      const episodeNumber = Number(ep.number ?? ep.episode_number ?? 0);
      return seasonNumber >= 0 && episodeNumber > 0;
    })
    .map((ep) => {
      const seasonNumber = Number(ep.seasonNumber ?? ep.season_number ?? 0);
      const episodeNumber = Number(ep.number ?? ep.episode_number ?? 0);
      const tvdbEpisodeId = ep.id ? Number(ep.id) : null;
      const tmdbStillPath = ep.tmdb_still_path ?? null;
      const tmdbStillUrl = tmdbStillPath
        ? `https://image.tmdb.org/t/p/w500${tmdbStillPath}`
        : null;

      return {
        tvdb_id: Number.isFinite(tvdbEpisodeId) ? tvdbEpisodeId : null,
        show_id: showId,
        season_id: seasonIdByNumber.get(seasonNumber) ?? null,
        season_type: "official",
        season_number: seasonNumber,
        episode_number: episodeNumber,
        absolute_number: normalizeNumber(
          ep.absoluteNumber ?? ep.absolute_number
        ),
        name: ep.name ?? `Episode ${episodeNumber}`,
        overview: ep.overview ?? null,
        aired_date: normalizeDate(ep.aired ?? ep.aired_date ?? null),
        runtime_minutes: normalizeNumber(ep.runtime ?? ep.runtime_minutes),
        image_url: tmdbStillUrl ?? ep.image ?? ep.image_url ?? null,
        is_special: seasonNumber === 0,
        is_premiere: Boolean(ep.isPremiere ?? ep.is_premiere ?? false),
        is_finale: Boolean(ep.isFinale ?? ep.is_finale ?? false),
        rating_average: normalizeNumber(ep.rating_average ?? ep.siteRating),
        rating_count: normalizeNumber(ep.rating_count ?? ep.siteRatingCount),
        tmdb_vote_average: normalizeNumber(ep.tmdb_vote_average),
        tmdb_vote_count: normalizeNumber(ep.tmdb_vote_count),
        tmdb_still_path: tmdbStillPath,
        last_synced_at: new Date().toISOString(),
      };
    });

  return dedupeByKey(
    rows,
    (row) =>
      `${row.show_id}|${row.season_type}|${row.season_number}|${row.episode_number}`
  );
}

async function fetchJsonWithTimeout(url, timeoutMs = 45000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, { signal: controller.signal });
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data?.message || `Request failed: ${res.status}`);
    }

    return data;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchShowDetails(tvdbId) {
  return fetchJsonWithTimeout(
    `/.netlify/functions/getShowDetails?tvdb_id=${encodeURIComponent(tvdbId)}`
  );
}

async function fetchTmdbShowDetails(tmdbId) {
  return fetchJsonWithTimeout(
    `/.netlify/functions/getTmdbShowDetails?tmdbId=${encodeURIComponent(tmdbId)}`
  );
}

async function fetchShowEpisodes(tvdbId) {
  const data = await fetchJsonWithTimeout(
    `/.netlify/functions/getShowEpisodes?tvdb_id=${encodeURIComponent(tvdbId)}`,
    90000
  );

  const episodes = Array.isArray(data) ? data : data?.episodes ?? [];

  return dedupeByKey(episodes, (ep) => {
    const seasonNumber = Number(ep.seasonNumber ?? ep.season_number ?? 0);
    const episodeNumber = Number(ep.number ?? ep.episode_number ?? 0);
    if (episodeNumber <= 0 || seasonNumber < 0) return null;
    return `${seasonNumber}|${episodeNumber}`;
  }).sort((a, b) => {
    const seasonDiff =
      Number(a.seasonNumber ?? a.season_number ?? 0) -
      Number(b.seasonNumber ?? b.season_number ?? 0);

    if (seasonDiff !== 0) return seasonDiff;

    return (
      Number(a.number ?? a.episode_number ?? 0) -
      Number(b.number ?? b.episode_number ?? 0)
    );
  });
}

function buildTmdbEpisodesFromSeasons(seasons) {
  const rows = [];

  for (const season of Array.isArray(seasons) ? seasons : []) {
    const seasonNumber = Number(season?.season_number ?? 0);
    const episodeCount = Number(season?.episode_count ?? 0);

    for (
      let episodeNumber = 1;
      episodeNumber <= episodeCount;
      episodeNumber += 1
    ) {
      rows.push({
        season_number: seasonNumber,
        seasonNumber,
        episode_number: episodeNumber,
        number: episodeNumber,
        aired_date: null,
        aired: null,
        name: `Episode ${episodeNumber}`,
        overview: null,
        runtime_minutes: null,
        runtime: null,
        image_url: null,
        image: null,
        is_special: seasonNumber === 0,
        is_premiere: episodeNumber === 1,
        is_finale: episodeNumber === episodeCount,
        rating_average: null,
        rating_count: null,
        tmdb_vote_average: null,
        tmdb_vote_count: null,
        tmdb_still_path: null,
      });
    }
  }

  return rows;
}

async function fetchTmdbEpisodeDetails(tmdbId, seasonNumber, episodeNumber) {
  if (
    !tmdbId ||
    !process.env.TMDB_API_KEY ||
    seasonNumber < 0 ||
    episodeNumber <= 0
  ) {
    return null;
  }

  return fetchJsonWithTimeout(
    `https://api.themoviedb.org/3/tv/${encodeURIComponent(
      tmdbId
    )}/season/${encodeURIComponent(
      seasonNumber
    )}/episode/${encodeURIComponent(
      episodeNumber
    )}?api_key=${encodeURIComponent(process.env.TMDB_API_KEY)}`,
    45000
  );
}

async function enrichEpisodesWithTmdb(showTmdbId, episodes) {
  if (!showTmdbId || !process.env.TMDB_API_KEY) {
    return episodes;
  }

  const enriched = await Promise.all(
    episodes.map(async (ep) => {
      const seasonNumber = Number(ep.seasonNumber ?? ep.season_number ?? 0);
      const episodeNumber = Number(ep.number ?? ep.episode_number ?? 0);

      if (seasonNumber < 0 || episodeNumber <= 0) {
        return ep;
      }

      try {
        const tmdbEpisode = await fetchTmdbEpisodeDetails(
          showTmdbId,
          seasonNumber,
          episodeNumber
        );

        return {
          ...ep,
          name: tmdbEpisode?.name ?? ep.name,
          overview: tmdbEpisode?.overview ?? ep.overview,
          aired_date:
            normalizeDate(tmdbEpisode?.air_date) ??
            ep.aired_date ??
            ep.aired ??
            null,
          aired:
            normalizeDate(tmdbEpisode?.air_date) ??
            ep.aired ??
            ep.aired_date ??
            null,
          runtime_minutes:
            normalizeNumber(tmdbEpisode?.runtime) ??
            ep.runtime_minutes ??
            ep.runtime ??
            null,
          tmdb_vote_average: tmdbEpisode?.vote_average ?? null,
          tmdb_vote_count: tmdbEpisode?.vote_count ?? null,
          tmdb_still_path: tmdbEpisode?.still_path ?? null,
        };
      } catch (error) {
        console.error(
          `Failed TMDB episode fetch for S${seasonNumber}E${episodeNumber}:`,
          error
        );
        return ep;
      }
    })
  );

  return enriched;
}

export async function saveShowToDatabase(show) {
  const tvdbId = normalizeNumber(show?.tvdb_id ?? show?.resolved_tvdb_id ?? show?.mapped_tvdb_id ?? null);
  const tmdbId = normalizeNumber(show?.tmdb_id ?? show?.resolved_tmdb_id ?? show?.mapped_tmdb_id ?? show?.show_tmdb_id ?? show?.id ?? null);

  if (!tvdbId && !tmdbId) {
    throw new Error("Missing show id");
  }

  async function findExistingShowByIds(nextTvdbId, nextTmdbId) {
    const safeTvdbId = normalizeNumber(nextTvdbId);
    const safeTmdbId = normalizeNumber(nextTmdbId);

    if (safeTvdbId) {
      const { data, error } = await supabase.from("shows").select("*").eq("tvdb_id", safeTvdbId).maybeSingle();
      if (error) throw error;
      if (data) return data;
    }

    if (safeTmdbId) {
      const { data, error } = await supabase.from("shows").select("*").eq("tmdb_id", safeTmdbId).maybeSingle();
      if (error) throw error;
      if (data) return data;
    }

    return null;
  }

  let existingShow = await findExistingShowByIds(tvdbId, tmdbId);

  let mergedShowDetails = {
    ...existingShow,
    ...show,
    tvdb_id: tvdbId ?? normalizeNumber(existingShow?.tvdb_id) ?? null,
    tmdb_id: tmdbId ?? normalizeNumber(existingShow?.tmdb_id) ?? null,
  };

  if (tvdbId) {
    try {
      const tvdbDetails = await fetchShowDetails(tvdbId);
      mergedShowDetails = {
        ...mergedShowDetails,
        ...tvdbDetails,
        tvdb_id: tvdbId,
        tmdb_id: normalizeNumber(mergedShowDetails?.tmdb_id ?? tvdbDetails?.tmdb_id ?? tmdbId),
      };
    } catch (error) {
      if (!tmdbId) throw error;
      console.error("TVDB show details failed, falling back to TMDB/show payload:", error);
    }
  }

  const resolvedTmdbId = normalizeNumber(mergedShowDetails?.tmdb_id ?? tmdbId);

  if (resolvedTmdbId) {
    try {
      const tmdbShowDetails = await fetchTmdbShowDetails(resolvedTmdbId);
      mergedShowDetails = {
        ...mergedShowDetails,
        ...tmdbShowDetails,
        tvdb_id: normalizeNumber(mergedShowDetails?.tvdb_id) ?? normalizeNumber(tmdbShowDetails?.tvdb_id) ?? null,
        tmdb_id: resolvedTmdbId,
        name: mergedShowDetails?.name || tmdbShowDetails?.name || "Unknown title",
        overview: mergedShowDetails?.overview || tmdbShowDetails?.overview || null,
        poster_url: mergedShowDetails?.poster_url || tmdbShowDetails?.poster_url || null,
        backdrop_url: mergedShowDetails?.backdrop_url || tmdbShowDetails?.backdrop_url || null,
        first_air_date: mergedShowDetails?.first_air_date || tmdbShowDetails?.first_air_date || null,
        first_aired: mergedShowDetails?.first_aired || tmdbShowDetails?.first_air_date || null,
        genres: mergedShowDetails?.genres?.length ? mergedShowDetails.genres : tmdbShowDetails?.genres || [],
        network: mergedShowDetails?.network || tmdbShowDetails?.networks || null,
        rating_average: mergedShowDetails?.rating_average ?? tmdbShowDetails?.vote_average ?? null,
        rating_count: mergedShowDetails?.rating_count ?? tmdbShowDetails?.vote_count ?? null,
      };
    } catch (error) {
      console.error("TMDB show details fallback failed:", error);
    }
  }

  const showPayload = buildShowPayload(mergedShowDetails);

  existingShow = existingShow || (await findExistingShowByIds(showPayload.tvdb_id, showPayload.tmdb_id));

  let savedShow;
  let showError;

  if (existingShow?.id) {
    const res = await supabase.from("shows").update(showPayload).eq("id", existingShow.id).select().single();
    savedShow = res.data;
    showError = res.error;
  } else {
    const res = await supabase.from("shows").insert(showPayload).select().single();
    savedShow = res.data;
    showError = res.error;

    if (showError && (showError.code === "23505" || /duplicate key value|unique constraint/i.test(showError.message || ""))) {
      existingShow = await findExistingShowByIds(showPayload.tvdb_id, showPayload.tmdb_id);
      if (existingShow?.id) {
        const retry = await supabase.from("shows").update(showPayload).eq("id", existingShow.id).select().single();
        savedShow = retry.data;
        showError = retry.error;
      }
    }
  }

  if (showError) throw showError;

  try {
    let rawEpisodes = [];

    if (savedShow.tvdb_id) {
      rawEpisodes = await fetchShowEpisodes(savedShow.tvdb_id);
    } else if (savedShow.tmdb_id) {
      const tmdbShowDetails = await fetchTmdbShowDetails(savedShow.tmdb_id);
      rawEpisodes = buildTmdbEpisodesFromSeasons(tmdbShowDetails?.seasons ?? []);
    }

    const enrichedEpisodes = await enrichEpisodesWithTmdb(savedShow.tmdb_id, rawEpisodes);
    const seasonRows = buildSeasonRows(savedShow.id, enrichedEpisodes);

    await upsertInBatches("seasons", seasonRows, "show_id,season_type,season_number", 100);

    const { data: savedSeasons, error: savedSeasonsError } = await supabase
      .from("seasons")
      .select("id, season_number")
      .eq("show_id", savedShow.id)
      .eq("season_type", "official");

    if (savedSeasonsError) throw savedSeasonsError;

    const seasonIdByNumber = new Map((savedSeasons || []).map((season) => [season.season_number, season.id]));
    const episodeRows = buildEpisodeRows(savedShow.id, seasonIdByNumber, enrichedEpisodes);

    await upsertInBatches("episodes", episodeRows, "show_id,season_type,season_number,episode_number", 200);
  } catch (error) {
    console.error("Episode sync failed, but show was saved:", error);
  }

  return savedShow;
}
