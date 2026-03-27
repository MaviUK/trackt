import { getSupabaseAdmin } from "./_supabaseAdmin.js";
import { tmdbFetch } from "./_tmdb.js";
import { tvdbFetch } from "./_tvdb.js";

function normalizeTitle(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function getYear(dateValue) {
  if (!dateValue) return null;
  const match = String(dateValue).match(/^(\d{4})/);
  return match ? Number(match[1]) : null;
}

function getTvdbCandidateId(item) {
  return Number(
    item?.tvdb_id ??
      item?.tvdbId ??
      item?.id ??
      item?.series_id ??
      item?.seriesId ??
      0
  ) || null;
}

function getTvdbCandidateName(item) {
  return (
    item?.name ||
    item?.seriesName ||
    item?.title ||
    item?.translations?.eng ||
    item?.slug ||
    ""
  );
}

function getTvdbCandidateFirstAirDate(item) {
  return (
    item?.firstAired ||
    item?.first_air_time ||
    item?.year ||
    item?.releaseDate ||
    ""
  );
}

function scoreCandidate(tmdbShow, candidate) {
  const tmdbTitle = normalizeTitle(tmdbShow.name);
  const candidateTitle = normalizeTitle(getTvdbCandidateName(candidate));

  const tmdbYear = getYear(tmdbShow.first_air_date);
  const candidateYear = getYear(getTvdbCandidateFirstAirDate(candidate));

  let score = 0;

  if (tmdbTitle && candidateTitle) {
    if (tmdbTitle === candidateTitle) {
      score += 100;
    } else if (
      tmdbTitle.includes(candidateTitle) ||
      candidateTitle.includes(tmdbTitle)
    ) {
      score += 70;
    } else {
      const tmdbWords = new Set(tmdbTitle.split(" "));
      const candidateWords = new Set(candidateTitle.split(" "));
      const overlap = [...tmdbWords].filter((w) => candidateWords.has(w)).length;
      score += overlap * 10;
    }
  }

  if (tmdbYear && candidateYear) {
    const diff = Math.abs(tmdbYear - candidateYear);
    if (diff === 0) score += 30;
    else if (diff === 1) score += 15;
    else if (diff === 2) score += 5;
  }

  return score;
}

async function readCachedMapping(tmdbId) {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("show_mappings")
    .select("*")
    .eq("tmdb_id", tmdbId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data || null;
}

async function upsertMapping(row) {
  const supabase = getSupabaseAdmin();

  const payload = {
    ...row,
    last_checked_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("show_mappings")
    .upsert(payload, { onConflict: "tmdb_id" })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

async function findTvdbIdFromTmdbExternalIds(tmdbId) {
  const externalIds = await tmdbFetch(`/tv/${tmdbId}/external_ids`);
  const tvdbId = Number(externalIds?.tvdb_id || 0) || null;
  return tvdbId;
}

async function fallbackSearchTvdb(tmdbShow) {
  const search = await tvdbFetch("/search", {
    query: tmdbShow.name,
    type: "series",
  });

  const results = Array.isArray(search?.data) ? search.data : [];

  if (!results.length) {
    return null;
  }

  const ranked = results
    .map((item) => ({
      item,
      score: scoreCandidate(tmdbShow, item),
    }))
    .sort((a, b) => b.score - a.score);

  const best = ranked[0];

  if (!best || best.score < 80) {
    return null;
  }

  return {
    tvdb_id: getTvdbCandidateId(best.item),
    tvdb_name: getTvdbCandidateName(best.item),
    tvdb_first_air_date: getTvdbCandidateFirstAirDate(best.item) || null,
    match_method: "tvdb_search",
    confidence: Number((best.score / 130).toFixed(2)),
  };
}

export async function getOrCreateShowMapping(tmdbShow) {
  const tmdbId = Number(tmdbShow?.id);

  if (!tmdbId) {
    return {
      tmdb_id: null,
      tvdb_id: null,
      status: "unmatched",
      match_method: null,
      confidence: 0,
    };
  }

  const cached = await readCachedMapping(tmdbId);
  if (cached) {
    return cached;
  }

  const baseRow = {
    tmdb_id: tmdbId,
    tmdb_name: tmdbShow?.name || "",
    tmdb_first_air_date: tmdbShow?.first_air_date || null,
  };

  try {
    const tvdbIdFromExternalIds = await findTvdbIdFromTmdbExternalIds(tmdbId);

    if (tvdbIdFromExternalIds) {
      return await upsertMapping({
        ...baseRow,
        tvdb_id: tvdbIdFromExternalIds,
        status: "mapped",
        match_method: "tmdb_external_ids",
        confidence: 1,
      });
    }

    const fallback = await fallbackSearchTvdb(tmdbShow);

    if (fallback?.tvdb_id) {
      return await upsertMapping({
        ...baseRow,
        ...fallback,
        status: "mapped",
      });
    }

    return await upsertMapping({
      ...baseRow,
      tvdb_id: null,
      tvdb_name: null,
      tvdb_first_air_date: null,
      status: "unmatched",
      match_method: "none",
      confidence: 0,
    });
  } catch (error) {
    return await upsertMapping({
      ...baseRow,
      tvdb_id: null,
      tvdb_name: null,
      tvdb_first_air_date: null,
      status: "unmatched",
      match_method: "error",
      confidence: 0,
    });
  }
}

export async function enrichShowsWithMappings(shows = []) {
  const results = await Promise.all(
    shows.map(async (show) => {
      const mapping = await getOrCreateShowMapping(show);

      return {
        ...show,
        tvdb_id: mapping?.tvdb_id || null,
        mapping_status: mapping?.status || "unmatched",
        mapping_method: mapping?.match_method || null,
        mapping_confidence: mapping?.confidence || 0,
      };
    })
  );

  return results;
}
