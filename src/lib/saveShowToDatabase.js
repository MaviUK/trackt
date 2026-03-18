import { supabase } from "./supabase";

function normalizeDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
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

function buildShowPayload(showDetails) {
  const tvdbId = Number(showDetails.tvdb_id || showDetails.id);
  if (!tvdbId) {
    throw new Error("Missing valid TVDB show id");
  }

  return {
    tvdb_id: tvdbId,
    slug: showDetails.slug ?? null,
    name: showDetails.name ?? showDetails.show_name ?? "Unknown title",
    original_name: showDetails.original_name ?? null,
    overview: showDetails.overview ?? null,
    status: showDetails.status ?? null,
    original_country: showDetails.original_country ?? null,
    original_language: showDetails.original_language ?? null,
    first_aired: normalizeDate(
      showDetails.first_aired ??
        showDetails.first_air_date ??
        showDetails.first_air_time
    ),
    last_aired: normalizeDate(showDetails.last_aired ?? null),
    next_aired: normalizeDate(showDetails.next_aired ?? null),
    runtime_minutes: Number.isFinite(Number(showDetails.runtime_minutes))
      ? Number(showDetails.runtime_minutes)
      : null,
    network: normalizeNetwork(showDetails.network),
    content_rating: showDetails.content_rating ?? null,
    genres: normalizeGenres(showDetails.genres),
    aliases: Array.isArray(showDetails.aliases)
      ? showDetails.aliases.filter(Boolean)
      : [],
    poster_url: showDetails.poster_url ?? showDetails.image_url ?? null,
    backdrop_url: showDetails.backdrop_url ?? null,
    banner_url: showDetails.banner_url ?? null,
    external_ids: showDetails.external_ids ?? {},
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
  return episodes
    .filter((ep) => {
      const seasonNumber = Number(ep.seasonNumber ?? ep.season_number ?? 0);
      const episodeNumber = Number(ep.number ?? ep.episode_number ?? 0);
      return seasonNumber >= 0 && episodeNumber > 0;
    })
    .map((ep) => {
      const seasonNumber = Number(ep.seasonNumber ?? ep.season_number ?? 0);
      const episodeNumber = Number(ep.number ?? ep.episode_number ?? 0);
      const tvdbEpisodeId = ep.id ? Number(ep.id) : null;
      const runtime = Number.isFinite(Number(ep.runtime ?? ep.runtime_minutes))
        ? Number(ep.runtime ?? ep.runtime_minutes)
        : null;

      return {
        tvdb_id: Number.isFinite(tvdbEpisodeId) ? tvdbEpisodeId : null,
        show_id: showId,
        season_id: seasonIdByNumber.get(seasonNumber) ?? null,
        season_type: "official",
        season_number: seasonNumber,
        episode_number: episodeNumber,
        absolute_number: Number.isFinite(
          Number(ep.absoluteNumber ?? ep.absolute_number)
        )
          ? Number(ep.absoluteNumber ?? ep.absolute_number)
          : null,
        name: ep.name ?? `Episode ${episodeNumber}`,
        overview: ep.overview ?? null,
        aired_date: normalizeDate(ep.aired ?? ep.aired_date ?? null),
        runtime_minutes: runtime,
        image_url: ep.image ?? ep.image_url ?? null,
        is_special: seasonNumber === 0,
        is_premiere: Boolean(ep.isPremiere ?? ep.is_premiere ?? false),
        is_finale: Boolean(ep.isFinale ?? ep.is_finale ?? false),
        last_synced_at: new Date().toISOString(),
      };
    });
}

async function fetchShowDetails(tvdbId) {
  const res = await fetch(
    `/.netlify/functions/getShowDetails?tvdb_id=${encodeURIComponent(tvdbId)}`
  );
  const data = await res.json();

  if (!res.ok) {
    throw new Error(data?.message || "Failed to fetch show details");
  }

  return data;
}

async function fetchShowEpisodes(tvdbId) {
  const res = await fetch(
    `/.netlify/functions/getShowEpisodes?tvdb_id=${encodeURIComponent(tvdbId)}`
  );
  const data = await res.json();

  if (!res.ok) {
    throw new Error(data?.message || "Failed to fetch show episodes");
  }

  return Array.isArray(data) ? data : data?.episodes ?? [];
}

export async function saveShowToDatabase(show) {
  const tvdbId = Number(show?.tvdb_id || show?.id);

  if (!tvdbId) {
    throw new Error("Missing show tvdb_id");
  }

  const [showDetails, rawEpisodes] = await Promise.all([
    fetchShowDetails(tvdbId),
    fetchShowEpisodes(tvdbId),
  ]);

  const showPayload = buildShowPayload({
    ...show,
    ...showDetails,
    tvdb_id: tvdbId,
  });

  const { data: savedShow, error: showError } = await supabase
    .from("shows")
    .upsert(showPayload, { onConflict: "tvdb_id" })
    .select()
    .single();

  if (showError) {
    throw showError;
  }

  const seasonRows = buildSeasonRows(savedShow.id, rawEpisodes);

  if (seasonRows.length > 0) {
    const { error: seasonsError } = await supabase
      .from("seasons")
      .upsert(seasonRows, {
        onConflict: "show_id,season_type,season_number",
      });

    if (seasonsError) {
      throw seasonsError;
    }
  }

  const { data: savedSeasons, error: savedSeasonsError } = await supabase
    .from("seasons")
    .select("id, season_number")
    .eq("show_id", savedShow.id)
    .eq("season_type", "official");

  if (savedSeasonsError) {
    throw savedSeasonsError;
  }

  const seasonIdByNumber = new Map(
    (savedSeasons || []).map((season) => [season.season_number, season.id])
  );

  const episodeRows = buildEpisodeRows(
    savedShow.id,
    seasonIdByNumber,
    rawEpisodes
  );

  if (episodeRows.length > 0) {
    const { error: episodesError } = await supabase
      .from("episodes")
      .upsert(episodeRows, {
        onConflict: "show_id,season_type,season_number,episode_number",
      });

    if (episodesError) {
      throw episodesError;
    }
  }

  return savedShow;
}
