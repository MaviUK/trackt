import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { formatDate } from "../lib/date";
import "./MyShowDetails.css";
import {
  enrichTmdbShowsWithMappings,
  getMappedShowHref,
  normalizeMappedShow,
} from "../lib/tmdbMappings";

function makeEpisodeCode(ep) {
  if (Number(ep?.seasonNumber) === 0) {
    if (!ep?.number) return "Special";
    return `Special ${ep.number}`;
  }

  if (!ep?.seasonNumber || !ep?.number) return "Episode";
  return `S${String(ep.seasonNumber).padStart(2, "0")}E${String(
    ep.number
  ).padStart(2, "0")}`;
}

function createWatchedLookup(rows) {
  return {
    byEpisodeId: new Set(
      (rows || [])
        .map((row) => row?.episode_id)
        .filter(Boolean)
        .map(String)
    ),
  };
}

function isEpisodeWatched(ep, watchedLookup) {
  if (!ep?.id) return false;
  return watchedLookup.byEpisodeId.has(String(ep.id));
}

function isFuture(dateString) {
  if (!dateString) return false;
  const d = new Date(dateString);
  return !Number.isNaN(d.getTime()) && d > new Date();
}

function getYear(dateString) {
  if (!dateString) return "";
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return "";
  return String(d.getFullYear());
}

function sortSeasonGroups(a, b) {
  const aNum = Number(a[0]);
  const bNum = Number(b[0]);

  if (aNum === 0 && bNum !== 0) return -1;
  if (bNum === 0 && aNum !== 0) return 1;
  return aNum - bNum;
}

function getBannerFromExtras(extras) {
  if (!extras || typeof extras !== "object") return null;

  return (
    extras.backdrop_url ||
    extras.backdropUrl ||
    extras.banner_url ||
    extras.bannerUrl ||
    extras.background_url ||
    extras.backgroundUrl ||
    extras.show?.backdrop_url ||
    extras.show?.banner_url ||
    extras.show?.background_url ||
    null
  );
}

async function fetchAllWatchedRows() {
  const pageSize = 1000;
  let from = 0;
  let done = false;
  const allRows = [];

  while (!done) {
    const to = from + pageSize - 1;

    const { data, error } = await supabase
      .from("watched_episodes")
      .select("user_id, episode_id")
      .range(from, to);

    if (error) throw error;

    const rows = data || [];
    allRows.push(...rows);

    if (rows.length < pageSize) {
      done = true;
    } else {
      from += pageSize;
    }
  }

  return allRows;
}

async function fetchBurgrRatings(showId) {
  const { data, error } = await supabase
    .from("burgr_ratings")
    .select("user_id, show_id, rating")
    .eq("show_id", showId);

  if (error) {
    console.warn("burgr_ratings load failed:", error);
    return [];
  }

  return data || [];
}

async function fetchAllEpisodeRatingsForShowEpisodeIds(showEpisodeIds) {
  if (!showEpisodeIds?.length) return [];

  const pageSize = 1000;
  let from = 0;
  let done = false;
  const allRows = [];

  while (!done) {
    const to = from + pageSize - 1;

    const { data, error } = await supabase
      .from("episode_ratings")
      .select("user_id, episode_id, rating")
      .range(from, to);

    if (error) {
      console.warn("episode_ratings load failed:", error);
      return [];
    }

    const rows = data || [];
    allRows.push(...rows);

    if (rows.length < pageSize) {
      done = true;
    } else {
      from += pageSize;
    }
  }

  const allowedIds = new Set(showEpisodeIds.map(String));
  return allRows.filter((row) => allowedIds.has(String(row.episode_id)));
}

function buildEpisodeRatingsMap(rows, userId) {
  const map = new Map();

  for (const row of rows || []) {
    if (!row?.episode_id) continue;
    if (row.user_id !== userId) continue;
    map.set(String(row.episode_id), String(row.rating));
  }

  return map;
}

function buildEpisodeAverageRatingsMap(rows) {
  const grouped = new Map();

  for (const row of rows || []) {
    const episodeId = String(row?.episode_id || "");
    const rating = Number(row?.rating);

    if (!episodeId || Number.isNaN(rating)) continue;

    if (!grouped.has(episodeId)) grouped.set(episodeId, []);
    grouped.get(episodeId).push(rating);
  }

  const averages = new Map();

  for (const [episodeId, ratings] of grouped.entries()) {
    const avg = ratings.reduce((sum, n) => sum + n, 0) / ratings.length;
    averages.set(episodeId, {
      avg: avg.toFixed(1),
      count: ratings.length,
    });
  }

  return averages;
}

function emptyState() {
  return {
    show: null,
    episodes: [],
    watchedRows: [],
    communityWatchedRows: [],
    expandedSeasons: {},
    cast: [],
    crew: [],
    recommendedShows: [],
    peopleAlsoWatch: [],
    savedShowTvdbIds: new Set(),
    burgrRatings: [],
    myBurgrRating: "",
    episodeRatings: [],
    savingEpisodeRatingId: null,
    hoverEpisodeRatings: {},
    openEpisodeRatingPickerId: null,
    mobileBannerUrl: null,
  };
}

export default function MyShowDetails() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const targetEpisodeId = searchParams.get("episode");

  const [loading, setLoading] = useState(true);
  const [extrasLoading, setExtrasLoading] = useState(false);
  const [savingBurgr, setSavingBurgr] = useState(false);
  const [savingShowAction, setSavingShowAction] = useState(false);

  const [show, setShow] = useState(null);
  const [episodes, setEpisodes] = useState([]);
  const [watchedRows, setWatchedRows] = useState([]);
  const [communityWatchedRows, setCommunityWatchedRows] = useState([]);
  const [expandedSeasons, setExpandedSeasons] = useState({});

  const [cast, setCast] = useState([]);
  const [crew, setCrew] = useState([]);
  const [recommendedShows, setRecommendedShows] = useState([]);
  const [peopleAlsoWatch, setPeopleAlsoWatch] = useState([]);
  const [savedShowTvdbIds, setSavedShowTvdbIds] = useState(new Set());

  const [burgrRatings, setBurgrRatings] = useState([]);
  const [myBurgrRating, setMyBurgrRating] = useState("");
  const [hoverBurgrRating, setHoverBurgrRating] = useState(0);

  const [currentUserId, setCurrentUserId] = useState(null);
  const [episodeRatings, setEpisodeRatings] = useState([]);
  const [savingEpisodeRatingId, setSavingEpisodeRatingId] = useState(null);
  const [hoverEpisodeRatings, setHoverEpisodeRatings] = useState({});
  const [openEpisodeRatingPickerId, setOpenEpisodeRatingPickerId] =
    useState(null);
  const [mobileBannerUrl, setMobileBannerUrl] = useState(null);
  const [expandedOverview, setExpandedOverview] = useState(false);
  const [activeTab, setActiveTab] = useState("seasons");

  const watchedLookup = useMemo(
    () => createWatchedLookup(watchedRows),
    [watchedRows]
  );

  const myEpisodeRatings = useMemo(
    () => buildEpisodeRatingsMap(episodeRatings, currentUserId),
    [episodeRatings, currentUserId]
  );

  const episodeAverageRatings = useMemo(
    () => buildEpisodeAverageRatingsMap(episodeRatings),
    [episodeRatings]
  );

  useEffect(() => {
    let isCancelled = false;

    async function loadCoreShow() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        if (!isCancelled) {
          setCurrentUserId(null);
          const state = emptyState();
          setShow(state.show);
          setEpisodes(state.episodes);
          setWatchedRows(state.watchedRows);
          setCommunityWatchedRows(state.communityWatchedRows);
          setExpandedSeasons(state.expandedSeasons);
          setCast(state.cast);
          setCrew(state.crew);
          setRecommendedShows(state.recommendedShows);
          setPeopleAlsoWatch(state.peopleAlsoWatch);
          setSavedShowTvdbIds(state.savedShowTvdbIds);
          setBurgrRatings(state.burgrRatings);
          setMyBurgrRating(state.myBurgrRating);
          setEpisodeRatings(state.episodeRatings);
          setSavingEpisodeRatingId(state.savingEpisodeRatingId);
          setHoverEpisodeRatings(state.hoverEpisodeRatings);
          setOpenEpisodeRatingPickerId(state.openEpisodeRatingPickerId);
          setMobileBannerUrl(state.mobileBannerUrl);
        }
        return { found: true, user: null, showId: null, tvdbId: null };
      }

      if (!isCancelled) {
        setCurrentUserId(user.id);
      }

      const tvdbId = Number(id);
      if (Number.isNaN(tvdbId)) {
        if (!isCancelled) {
          setShow(null);
          setEpisodes([]);
          setWatchedRows([]);
          setCommunityWatchedRows([]);
          setExpandedSeasons({});
          setMobileBannerUrl(null);
        }
        return { found: false, user, showId: null, tvdbId: null };
      }

      const { data: showData, error: showError } = await supabase
        .from("shows")
        .select(`
          id,
          tvdb_id,
          name,
          overview,
          status,
          poster_url,
          first_aired,
          network,
          genres,
          original_language,
          relationship_types,
          settings,
          rating_average,
          rating_count
        `)
        .eq("tvdb_id", tvdbId)
        .maybeSingle();

      if (showError) throw showError;
      if (!showData) {
        if (!isCancelled) {
          setShow(null);
          setEpisodes([]);
          setWatchedRows([]);
          setCommunityWatchedRows([]);
          setExpandedSeasons({});
          setMobileBannerUrl(null);
        }
        return { found: false, user, showId: null, tvdbId };
      }

      const showId = showData.id;

      const { data: userShowData, error: userShowError } = await supabase
        .from("user_shows_new")
        .select(`
          id,
          user_id,
          show_id,
          watch_status,
          archived_at,
          added_at,
          created_at
        `)
        .eq("user_id", user.id)
        .eq("show_id", showId)
        .maybeSingle();

      if (userShowError) throw userShowError;

      const { data: episodeRows, error: episodeError } = await supabase
        .from("episodes")
        .select(`
          id,
          tvdb_id,
          show_id,
          season_number,
          episode_number,
          episode_code,
          name,
          overview,
          aired_date,
          image_url
        `)
        .eq("show_id", showId)
        .order("season_number", { ascending: true })
        .order("episode_number", { ascending: true });

      if (episodeError) throw episodeError;

      const normalizedEpisodes = (episodeRows || []).map((row) => ({
        id: row.id,
        tvdb_episode_id: row.tvdb_id,
        seasonNumber: row.season_number,
        number: row.episode_number,
        aired: row.aired_date,
        airDate: row.aired_date,
        name: row.name || "Untitled episode",
        overview: row.overview || "",
        image: row.image_url || null,
        episode_code: row.episode_code,
      }));

      const seasonMap = {};
      normalizedEpisodes.forEach((ep) => {
        const seasonKey = Number(ep.seasonNumber ?? 0);
        if (seasonKey === 0) return;
        if (!(seasonKey in seasonMap)) seasonMap[seasonKey] = false;
      });

      if (targetEpisodeId) {
        const targetEpisode = normalizedEpisodes.find(
          (ep) => String(ep.id) === String(targetEpisodeId)
        );
        if (targetEpisode) {
          seasonMap[Number(targetEpisode.seasonNumber ?? 0)] = true;
        }
      }

      if (!isCancelled) {
        setShow({
          id: showData.id,
          tvdb_id: showData.tvdb_id,
          show_name: showData.name || "Unknown title",
          overview: showData.overview || "",
          poster_url: showData.poster_url || null,
          first_aired: showData.first_aired || null,
          status: showData.status || null,
          network: showData.network || "",
          original_language: showData.original_language || "",
          genres: Array.isArray(showData.genres) ? showData.genres : [],
          relationship_types: Array.isArray(showData.relationship_types)
            ? showData.relationship_types
            : [],
          settings: Array.isArray(showData.settings) ? showData.settings : [],
          rating_average:
            showData.rating_average != null
              ? Number(showData.rating_average)
              : null,
          rating_count:
            showData.rating_count != null
              ? Number(showData.rating_count)
              : null,
          watch_status: userShowData?.watch_status || "watchlist",
          archived_at: userShowData?.archived_at || null,
          added_at: userShowData?.added_at || null,
          created_at: userShowData?.created_at || null,
        });

        setEpisodes(normalizedEpisodes);
        setExpandedSeasons(seasonMap);
        setMobileBannerUrl(null);
        setExpandedOverview(false);
        setActiveTab("seasons");
      }

      return {
        found: true,
        user,
        showId,
        tvdbId,
        episodeIds: normalizedEpisodes.map((ep) => ep.id),
      };
    }

    async function loadSecondaryData(user, showId, episodeIds, tvdbId) {
      try {
        const [
          savedShowsResult,
          burgrRows,
          allWatchedRows,
          episodeRatingRows,
        ] = await Promise.all([
          supabase
            .from("user_shows_new")
            .select(`shows!inner(tvdb_id)`)
            .eq("user_id", user.id),
          fetchBurgrRatings(showId),
          fetchAllWatchedRows(),
          fetchAllEpisodeRatingsForShowEpisodeIds(episodeIds),
        ]);

        if (isCancelled) return;

        const savedShowsData = savedShowsResult?.data || [];

        const savedTvdbIds = new Set(
          savedShowsData
            .map((row) => row?.shows?.tvdb_id)
            .filter(Boolean)
            .map(String)
        );

        const episodeIdSet = new Set((episodeIds || []).map(String));
        const showWatchedRows = (allWatchedRows || []).filter((row) =>
          episodeIdSet.has(String(row.episode_id))
        );

        const myWatchedRows = showWatchedRows.filter(
          (row) => String(row.user_id) === String(user.id)
        );

        const mine = (burgrRows || []).find((row) => row.user_id === user.id);

        setSavedShowTvdbIds(savedTvdbIds);
        setWatchedRows(myWatchedRows || []);
        setCommunityWatchedRows(showWatchedRows || []);
        setBurgrRatings(burgrRows || []);
        setMyBurgrRating(mine ? String(mine.rating) : "");
        setEpisodeRatings(episodeRatingRows || []);
        setSavingEpisodeRatingId(null);
        setHoverEpisodeRatings({});
        setOpenEpisodeRatingPickerId(null);

        try {
          setExtrasLoading(true);

          const extrasRes = await fetch(
            `/.netlify/functions/getShowExtras?tvdbId=${tvdbId}`
          );
          if (!extrasRes.ok) {
            throw new Error(`Failed to load show extras (${extrasRes.status})`);
          }

          const extras = await extrasRes.json();

          const castRows = Array.isArray(extras.cast) ? extras.cast : [];
          const crewRows = Array.isArray(extras.crew) ? extras.crew : [];
          const tvdbPeopleAlsoWatchRaw = Array.isArray(extras.peopleAlsoWatch)
            ? extras.peopleAlsoWatch
            : [];
          const fallbackRecommendations = Array.isArray(extras.recommendations)
            ? extras.recommendations
            : [];

          const bannerFromExtras = getBannerFromExtras(extras);

          const normalizedTvdbPeopleAlsoWatch = tvdbPeopleAlsoWatchRaw.map(
            (item) =>
              normalizeMappedShow({
                ...item,
                source: "tvdb",
                tvdb_id:
                  item?.tvdb_id ??
                  item?.tvdbId ??
                  item?.show_id ??
                  item?.id ??
                  null,
                name:
                  item?.name ||
                  item?.title ||
                  item?.show_name ||
                  "Unknown show",
                first_air_date:
                  item?.first_air_date ||
                  item?.firstAired ||
                  item?.first_aired ||
                  "",
                poster_url:
                  item?.poster_url ||
                  item?.posterUrl ||
                  item?.image_url ||
                  item?.image ||
                  item?.poster ||
                  "",
              })
          );

          let mappedFallbackRecommendations = [];
          try {
            mappedFallbackRecommendations =
              await enrichTmdbShowsWithMappings(fallbackRecommendations);
          } catch (mappingError) {
            console.error(
              "Failed mapping fallback recommendations:",
              mappingError
            );
            mappedFallbackRecommendations = fallbackRecommendations.map((item) =>
              normalizeMappedShow({
                ...item,
                source: "tmdb",
                poster_url:
                  item?.poster_url ||
                  item?.posterUrl ||
                  item?.image_url ||
                  item?.image ||
                  (item?.poster_path
                    ? `https://image.tmdb.org/t/p/w500${item.poster_path}`
                    : ""),
                poster_path: item?.poster_path || null,
              })
            );
          }

          const filteredTvdbPeopleAlsoWatch =
            normalizedTvdbPeopleAlsoWatch.filter((item) => {
              const recTvdbId =
                item?.resolved_tvdb_id ?? item?.tvdb_id ?? item?.tvdbId;
              if (!recTvdbId) return true;
              return !savedTvdbIds.has(String(recTvdbId));
            });

          const filteredFallbackRecommendations =
            mappedFallbackRecommendations.filter((item) => {
              const recTvdbId =
                item?.resolved_tvdb_id ?? item?.tvdb_id ?? item?.tvdbId;
              if (!recTvdbId) return true;
              return !savedTvdbIds.has(String(recTvdbId));
            });

          if (!isCancelled) {
            setCast(castRows);
            setCrew(crewRows);
            setPeopleAlsoWatch(filteredTvdbPeopleAlsoWatch);
            setRecommendedShows(
              filteredTvdbPeopleAlsoWatch.length > 0
                ? filteredTvdbPeopleAlsoWatch
                : filteredFallbackRecommendations
            );
            setMobileBannerUrl(bannerFromExtras || null);
          }
        } catch (extrasError) {
          console.error("Failed loading TVDB extras:", extrasError);
          if (!isCancelled) {
            setCast([]);
            setCrew([]);
            setRecommendedShows([]);
            setPeopleAlsoWatch([]);
            setMobileBannerUrl(null);
          }
        } finally {
          if (!isCancelled) {
            setExtrasLoading(false);
          }
        }
      } catch (secondaryError) {
        console.error("Failed loading secondary show data:", secondaryError);
        if (!isCancelled) {
          setWatchedRows([]);
          setCommunityWatchedRows([]);
          setBurgrRatings([]);
          setMyBurgrRating("");
          setEpisodeRatings([]);
          setCast([]);
          setCrew([]);
          setRecommendedShows([]);
          setPeopleAlsoWatch([]);
          setSavedShowTvdbIds(new Set());
          setExtrasLoading(false);
          setMobileBannerUrl(null);
        }
      }
    }

    async function loadShowWithRetry() {
      setLoading(true);
      setExtrasLoading(false);

      try {
        const maxAttempts = 6;

        for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
          const result = await loadCoreShow();

          if (result?.found) {
            if (
              result.user &&
              result.showId &&
              Array.isArray(result.episodeIds)
            ) {
              await loadSecondaryData(
                result.user,
                result.showId,
                result.episodeIds,
                result.tvdbId
              );
            }
            return;
          }

          if (attempt < maxAttempts - 1) {
            await new Promise((resolve) => setTimeout(resolve, 1000));
          }
        }

        if (!isCancelled) {
          setShow(null);
          setEpisodes([]);
          setWatchedRows([]);
          setCommunityWatchedRows([]);
          setExpandedSeasons({});
          setCast([]);
          setCrew([]);
          setRecommendedShows([]);
          setPeopleAlsoWatch([]);
          setSavedShowTvdbIds(new Set());
          setBurgrRatings([]);
          setMyBurgrRating("");
          setEpisodeRatings([]);
          setSavingEpisodeRatingId(null);
          setHoverEpisodeRatings({});
          setOpenEpisodeRatingPickerId(null);
          setMobileBannerUrl(null);
        }
      } catch (error) {
        console.error("Failed loading show:", error);
        if (!isCancelled) {
          setShow(null);
          setEpisodes([]);
          setWatchedRows([]);
          setCommunityWatchedRows([]);
          setExpandedSeasons({});
          setCast([]);
          setCrew([]);
          setRecommendedShows([]);
          setPeopleAlsoWatch([]);
          setSavedShowTvdbIds(new Set());
          setBurgrRatings([]);
          setMyBurgrRating("");
          setEpisodeRatings([]);
          setSavingEpisodeRatingId(null);
          setHoverEpisodeRatings({});
          setOpenEpisodeRatingPickerId(null);
          setMobileBannerUrl(null);
        }
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    }

    loadShowWithRetry();

    return () => {
      isCancelled = true;
    };
  }, [id, targetEpisodeId]);

  useEffect(() => {
    if (targetEpisodeId) return;
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [id, targetEpisodeId]);

  useEffect(() => {
    if (!targetEpisodeId || loading) return;

    const timer = setTimeout(() => {
      const el = document.getElementById(`episode-${targetEpisodeId}`);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("episode-highlight");
      setTimeout(() => el.classList.remove("episode-highlight"), 2500);
    }, 300);

    return () => clearTimeout(timer);
  }, [episodes, expandedSeasons, targetEpisodeId, loading]);

  const groupedSeasons = useMemo(() => {
    const grouped = {};

    for (const ep of episodes) {
      const seasonKey = Number(ep.seasonNumber ?? 0);
      if (seasonKey === 0) continue;

      if (!grouped[seasonKey]) grouped[seasonKey] = [];
      grouped[seasonKey].push(ep);
    }

    return Object.entries(grouped)
      .sort(sortSeasonGroups)
      .map(([seasonNumber, seasonEpisodes]) => {
        const watchedCount = seasonEpisodes.filter((ep) =>
          isEpisodeWatched(ep, watchedLookup)
        ).length;

        return {
          seasonNumber: Number(seasonNumber),
          label: `Season ${seasonNumber}`,
          episodes: seasonEpisodes,
          watchedCount,
          totalCount: seasonEpisodes.length,
          complete:
            seasonEpisodes.length > 0 &&
            watchedCount === seasonEpisodes.length,
        };
      });
  }, [episodes, watchedLookup]);

  const stats = useMemo(() => {
    const mainEpisodes = episodes.filter(
      (ep) => Number(ep.seasonNumber ?? 0) !== 0
    );

    const total = mainEpisodes.length;
    const watched = mainEpisodes.filter((ep) =>
      isEpisodeWatched(ep, watchedLookup)
    ).length;
    const pct = total > 0 ? Math.round((watched / total) * 100) : 0;
    const nextEpisode = mainEpisodes.find(
      (ep) => !isEpisodeWatched(ep, watchedLookup) && isFuture(ep.aired)
    );

    return { total, watched, pct, nextEpisode };
  }, [episodes, watchedLookup]);

  const nextUnwatchedEpisode = useMemo(() => {
    const mainEpisodes = [...episodes]
      .filter((ep) => Number(ep.seasonNumber ?? 0) > 0)
      .sort((a, b) => {
        const seasonDiff =
          Number(a.seasonNumber ?? 0) - Number(b.seasonNumber ?? 0);
        if (seasonDiff !== 0) return seasonDiff;
        return Number(a.number ?? 0) - Number(b.number ?? 0);
      });

    return (
      mainEpisodes.find((ep) => !isEpisodeWatched(ep, watchedLookup)) || null
    );
  }, [episodes, watchedLookup]);

  useEffect(() => {
    async function syncWatchStatus() {
      if (!currentUserId || !show?.id) return;
      if (show.watch_status === "not_added") return;
      if (show.watch_status === "archived") return;
      if (savingShowAction) return;

      const desiredStatus = stats.watched > 0 ? "watching" : "watchlist";
      if (show.watch_status === desiredStatus) return;

      try {
        const { error } = await supabase
          .from("user_shows_new")
          .update({
            watch_status: desiredStatus,
            archived_at: null,
          })
          .eq("user_id", currentUserId)
          .eq("show_id", show.id);

        if (error) throw error;

        setShow((prev) =>
          prev
            ? {
                ...prev,
                watch_status: desiredStatus,
                archived_at: null,
              }
            : prev
        );
      } catch (error) {
        console.error("Failed syncing watch status:", error);
      }
    }

    syncWatchStatus();
  }, [
    currentUserId,
    show?.id,
    show?.watch_status,
    stats.watched,
    savingShowAction,
  ]);

  const sourceYear = getYear(show?.first_aired);
  const sourceRating =
    show?.rating_average != null && !Number.isNaN(Number(show.rating_average))
      ? Number(show.rating_average).toFixed(1)
      : "";
  const sourceLanguage = show?.original_language || "";

  const isRemoved = show?.watch_status === "not_added";
  const isArchived = show?.watch_status === "archived";

  function toggleSeason(seasonNumber) {
    setExpandedSeasons((prev) => ({
      ...prev,
      [seasonNumber]: !prev[seasonNumber],
    }));
  }

  async function refreshBurgrRatings(showId, userId) {
    const fresh = await fetchBurgrRatings(showId);
    setBurgrRatings(fresh);
    const mine = (fresh || []).find((row) => row.user_id === userId);
    setMyBurgrRating(mine ? String(mine.rating) : "");
  }

  async function refreshEpisodeRatings(showEpisodeIds) {
    const fresh = await fetchAllEpisodeRatingsForShowEpisodeIds(showEpisodeIds);
    setEpisodeRatings(fresh);
  }

  async function handleToggleRemoveShow() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user || !show?.id || savingShowAction) return;

    setSavingShowAction(true);

    try {
      if (isRemoved) {
        const restoredStatus = stats.watched > 0 ? "watching" : "watchlist";

        const { error } = await supabase.from("user_shows_new").upsert(
          {
            user_id: user.id,
            show_id: show.id,
            watch_status: restoredStatus,
            archived_at: null,
          },
          { onConflict: "user_id,show_id" }
        );

        if (error) throw error;

        setShow((prev) =>
          prev
            ? {
                ...prev,
                watch_status: restoredStatus,
                archived_at: null,
              }
            : prev
        );
      } else {
        const { error } = await supabase
          .from("user_shows_new")
          .delete()
          .eq("user_id", user.id)
          .eq("show_id", show.id);

        if (error) throw error;

        setShow((prev) =>
          prev
            ? {
                ...prev,
                watch_status: "not_added",
                archived_at: null,
              }
            : prev
        );
      }
    } catch (error) {
      console.error("Failed toggling remove show:", error);
      alert(error.message || "Failed updating show");
    } finally {
      setSavingShowAction(false);
    }
  }

  async function handleToggleArchiveShow() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user || !show?.id || savingShowAction || isRemoved) return;

    setSavingShowAction(true);

    try {
      if (isArchived) {
        const restoredStatus = stats.watched > 0 ? "watching" : "watchlist";

        const { error } = await supabase
          .from("user_shows_new")
          .update({
            watch_status: restoredStatus,
            archived_at: null,
          })
          .eq("user_id", user.id)
          .eq("show_id", show.id);

        if (error) throw error;

        setShow((prev) =>
          prev
            ? {
                ...prev,
                watch_status: restoredStatus,
                archived_at: null,
              }
            : prev
        );
      } else {
        const { error } = await supabase
          .from("user_shows_new")
          .update({
            watch_status: "archived",
            archived_at: new Date().toISOString(),
          })
          .eq("user_id", user.id)
          .eq("show_id", show.id);

        if (error) throw error;

        setShow((prev) =>
          prev
            ? {
                ...prev,
                watch_status: "archived",
                archived_at: new Date().toISOString(),
              }
            : prev
        );
      }
    } catch (error) {
      console.error("Failed toggling archive show:", error);
      alert(error.message || "Failed updating archive status");
    } finally {
      setSavingShowAction(false);
    }
  }

  async function handleMarkWatched(ep) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user || ep?.id == null) return;

    const watched = isEpisodeWatched(ep, watchedLookup);
    const previousRows = watchedRows;
    const previousCommunityRows = communityWatchedRows;
    const optimisticRow = {
      user_id: user.id,
      episode_id: ep.id,
    };

    if (watched) {
      setWatchedRows((prev) =>
        (prev || []).filter(
          (row) => String(row?.episode_id ?? "") !== String(ep.id)
        )
      );
      setCommunityWatchedRows((prev) =>
        (prev || []).filter(
          (row) =>
            !(
              String(row?.episode_id ?? "") === String(ep.id) &&
              String(row?.user_id ?? "") === String(user.id)
            )
        )
      );
    } else {
      setWatchedRows((prev) => {
        const next = [...(prev || [])];
        if (
          !next.some((row) => String(row?.episode_id ?? "") === String(ep.id))
        ) {
          next.push(optimisticRow);
        }
        return next;
      });
      setCommunityWatchedRows((prev) => {
        const next = [...(prev || [])];
        if (
          !next.some(
            (row) =>
              String(row?.episode_id ?? "") === String(ep.id) &&
              String(row?.user_id ?? "") === String(user.id)
          )
        ) {
          next.push(optimisticRow);
        }
        return next;
      });
    }

    try {
      if (watched) {
        const { error } = await supabase
          .from("watched_episodes")
          .delete()
          .eq("user_id", user.id)
          .eq("episode_id", ep.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("watched_episodes")
          .upsert(
            {
              user_id: user.id,
              episode_id: ep.id,
            },
            { onConflict: "user_id,episode_id" }
          );

        if (error) throw error;
      }
    } catch (error) {
      console.error("Failed toggling watched state:", error);
      setWatchedRows(previousRows);
      setCommunityWatchedRows(previousCommunityRows);
      alert(error.message || "Failed updating watched status");
    }
  }

  async function handleMarkNextEpisodeWatched() {
    if (!nextUnwatchedEpisode) return;
    await handleMarkWatched(nextUnwatchedEpisode);
  }

  async function handleWatchUpToHere(targetEpisode) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    const previousRows = watchedRows;
    const previousCommunityRows = communityWatchedRows;

    try {
      const mainEpisodes = [...episodes]
        .filter((ep) => Number(ep.seasonNumber ?? 0) > 0)
        .sort((a, b) => {
          const seasonDiff =
            Number(a.seasonNumber ?? 0) - Number(b.seasonNumber ?? 0);
          if (seasonDiff !== 0) return seasonDiff;

          return Number(a.number ?? 0) - Number(b.number ?? 0);
        });

      const targetIndex = mainEpisodes.findIndex(
        (ep) => String(ep.id) === String(targetEpisode.id)
      );

      if (targetIndex === -1) return;

      const episodesToMark = mainEpisodes.slice(0, targetIndex + 1);

      const rowsToUpsert = episodesToMark.map((ep) => ({
        user_id: user.id,
        episode_id: ep.id,
      }));

      setWatchedRows((prev) => {
        const next = [...(prev || [])];
        const existing = new Set(next.map((r) => String(r.episode_id)));

        for (const row of rowsToUpsert) {
          if (!existing.has(String(row.episode_id))) {
            next.push(row);
            existing.add(String(row.episode_id));
          }
        }

        return next;
      });

      setCommunityWatchedRows((prev) => {
        const next = [...(prev || [])];
        const existing = new Set(
          next.map((r) => `${String(r.user_id)}:${String(r.episode_id)}`)
        );

        for (const row of rowsToUpsert) {
          const key = `${String(row.user_id)}:${String(row.episode_id)}`;
          if (!existing.has(key)) {
            next.push(row);
            existing.add(key);
          }
        }

        return next;
      });

      const batchSize = 100;

      for (let i = 0; i < rowsToUpsert.length; i += batchSize) {
        const batch = rowsToUpsert.slice(i, i + batchSize);

        const { error } = await supabase
          .from("watched_episodes")
          .upsert(batch, { onConflict: "user_id,episode_id" });

        if (error) throw error;
      }
    } catch (error) {
      console.error("Failed watch up to here:", error);
      setWatchedRows(previousRows);
      setCommunityWatchedRows(previousCommunityRows);
      alert("Failed to save watched episodes");
    }
  }

  async function handleSelectBurgrRating(value) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || !show?.id || savingBurgr) return;

    const rating = Number(value);
    if (Number.isNaN(rating) || rating < 1 || rating > 10) return;

    const previousRating = myBurgrRating;
    setMyBurgrRating(String(rating));
    setSavingBurgr(true);

    try {
      const { error } = await supabase.from("burgr_ratings").upsert(
        { user_id: user.id, show_id: show.id, rating },
        { onConflict: "user_id,show_id" }
      );
      if (error) throw error;
      await refreshBurgrRatings(show.id, user.id);
    } catch (error) {
      console.error("Failed saving Burgr rating:", error);
      setMyBurgrRating(previousRating);
      alert(error.message || "Failed saving Burgr rating");
    } finally {
      setSavingBurgr(false);
    }
  }

  async function handleSelectEpisodeRating(ep, value) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user || !ep?.id || savingEpisodeRatingId) return;

    const rating = Number(value);
    if (Number.isNaN(rating) || rating < 1 || rating > 10) return;

    setSavingEpisodeRatingId(ep.id);

    const previousRows = episodeRatings;

    const optimisticRows = [
      ...(episodeRatings || []).filter(
        (row) =>
          !(
            String(row.episode_id) === String(ep.id) && row.user_id === user.id
          )
      ),
      {
        user_id: user.id,
        episode_id: ep.id,
        rating,
      },
    ];

    setEpisodeRatings(optimisticRows);

    try {
      const { error } = await supabase.from("episode_ratings").upsert(
        {
          user_id: user.id,
          episode_id: ep.id,
          rating,
        },
        { onConflict: "user_id,episode_id" }
      );

      if (error) throw error;

      await refreshEpisodeRatings(episodes.map((episode) => episode.id));
      setOpenEpisodeRatingPickerId(null);
    } catch (error) {
      console.error("Failed saving episode rating:", error);
      setEpisodeRatings(previousRows);
      alert(error.message || "Failed saving episode rating");
    } finally {
      setSavingEpisodeRatingId(null);
    }
  }

  function handleOpenEpisodeRatingPicker(epId) {
    setOpenEpisodeRatingPickerId((prev) => (prev === epId ? null : epId));
  }

  if (loading) {
    return (
      <div className="msd-page">
        <div className="msd-shell">
          <div className="msd-loading">Loading show...</div>
        </div>
      </div>
    );
  }

  if (!show) {
    return (
      <div className="msd-page">
        <div className="msd-shell">
          <div className="msd-empty">
            <p>Show not found.</p>
          </div>
        </div>
      </div>
    );
  }

  const activeBurgrRating = hoverBurgrRating || Number(myBurgrRating || 0);
  const baseContext = `sourceShowId=${encodeURIComponent(
    show.tvdb_id
  )}&sourceYear=${encodeURIComponent(
    sourceYear
  )}&sourceRating=${encodeURIComponent(
    sourceRating
  )}&sourceLanguage=${encodeURIComponent(sourceLanguage)}`;

  return (
    <div className="msd-page">
      <div className="msd-shell">
        <section className="msd-mobile-banner-wrap">
          <div
            className={`msd-mobile-banner ${
              mobileBannerUrl ? "" : "msd-mobile-banner-fallback"
            }`}
            style={
              mobileBannerUrl
                ? { backgroundImage: `url(${mobileBannerUrl})` }
                : undefined
            }
          />
        </section>

        <section className="msd-hero">
          <div className="msd-hero-poster-wrap">
            {show.poster_url ? (
              <img
                src={show.poster_url}
                alt={show.show_name}
                className="msd-poster"
              />
            ) : null}
          </div>

          <div className="msd-hero-main msd-hero-main-mobile">
            <div className="msd-mobile-top-row">
              <div className="msd-mobile-title-wrap">
                <h1 className="msd-title">{show.show_name}</h1>
                {show.first_aired ? (
                  <>
                    <div className="msd-mobile-year">
                      {new Date(show.first_aired).getFullYear()}
                    </div>
                    <div className="msd-mobile-first-aired">
                      First aired: {formatDate(show.first_aired)}
                    </div>
                  </>
                ) : null}
              </div>

              {show.poster_url ? (
                <img
                  src={show.poster_url}
                  alt={show.show_name}
                  className="msd-mobile-thumb"
                />
              ) : null}
            </div>

            {show.overview ? (
              <div className="msd-overview-wrapper">
                <p
                  className={`msd-overview msd-overview-mobile ${
                    expandedOverview ? "expanded" : "collapsed"
                  }`}
                >
                  {show.overview}
                </p>

                <button
                  type="button"
                  className="msd-overview-dots"
                  onClick={() => setExpandedOverview((prev) => !prev)}
                  aria-label={
                    expandedOverview ? "Collapse overview" : "Expand overview"
                  }
                >
                  •••
                </button>
              </div>
            ) : null}

            <div className="msd-stats-row msd-stats-row-top">
              <div className="msd-stat-box">
                <span className="msd-stat-label">Watched</span>
                <strong className="msd-stat-value">{stats.watched}</strong>
              </div>
              <div className="msd-stat-box">
                <span className="msd-stat-label">Total</span>
                <strong className="msd-stat-value">{stats.total}</strong>
              </div>
              <div className="msd-stat-box">
                <span className="msd-stat-label">Progress</span>
                <strong className="msd-stat-value">{stats.pct}%</strong>
              </div>
            </div>

            <div className="msd-stat-box msd-stat-box-full">
              <span className="msd-stat-label">Your Burgr Rating</span>
              <div className="msd-burgr-form msd-burgr-form-compact">
                <div className="msd-burgr-picker msd-burgr-picker-compact">
                  {Array.from({ length: 10 }, (_, index) => {
                    const value = index + 1;
                    const filled = value <= activeBurgrRating;
                    return (
                      <button
                        key={value}
                        type="button"
                        className={`msd-burger-btn ${
                          filled ? "is-filled" : "is-empty"
                        }`}
                        onMouseEnter={() => setHoverBurgrRating(value)}
                        onMouseLeave={() => setHoverBurgrRating(0)}
                        onClick={() => handleSelectBurgrRating(value)}
                        aria-label={`Rate ${value} out of 10 burgers`}
                        title={`${value}/10`}
                        disabled={savingBurgr}
                      >
                        <img
                          src="/burger-rating.png"
                          alt=""
                          className="msd-burger-icon msd-burger-icon-small"
                        />
                      </button>
                    );
                  })}
                </div>
                <div className="msd-burgr-picker-footer msd-burgr-picker-footer-compact">
                  <span className="msd-burgr-current">
                    {savingBurgr
                      ? "Saving..."
                      : myBurgrRating
                      ? `${myBurgrRating}/10`
                      : "Select"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="msd-content-tabs-section">
          <div className="msd-content-tabs">
            <button
              type="button"
              className={`msd-content-tab ${
                activeTab === "seasons" ? "is-active" : ""
              }`}
              onClick={() => setActiveTab("seasons")}
            >
              Seasons
            </button>

            <button
              type="button"
              className={`msd-content-tab ${
                activeTab === "cast" ? "is-active" : ""
              }`}
              onClick={() => setActiveTab("cast")}
            >
              Cast
            </button>

            <button
              type="button"
              className={`msd-content-tab ${
                activeTab === "crew" ? "is-active" : ""
              }`}
              onClick={() => setActiveTab("crew")}
            >
              Crew
            </button>

            <button
              type="button"
              className={`msd-content-tab ${
                activeTab === "studio" ? "is-active" : ""
              }`}
              onClick={() => setActiveTab("studio")}
            >
              Studio
            </button>

            <button
              type="button"
              className={`msd-content-tab ${
                activeTab === "genre" ? "is-active" : ""
              }`}
              onClick={() => setActiveTab("genre")}
            >
              Genre
            </button>
          </div>

          <div className="msd-tab-panel">
            {activeTab === "seasons" && (
              <>
                <h2 className="msd-section-title">Seasons</h2>
                <div className="msd-seasons">
                  {groupedSeasons.map((season) => (
                    <section
                      key={season.seasonNumber}
                      className={`msd-season-card ${
                        season.complete ? "msd-season-complete" : ""
                      }`}
                    >
                      <button
                        type="button"
                        className="msd-season-toggle"
                        onClick={() => toggleSeason(season.seasonNumber)}
                      >
                        <div>
                          <div className="msd-season-title">{season.label}</div>
                          <div className="msd-season-subtitle">
                            {season.watchedCount}/{season.totalCount} watched
                          </div>
                        </div>
                        <div className="msd-season-toggle-right">
                          {season.complete ? (
                            <span className="msd-season-badge">Completed</span>
                          ) : null}
                          <span className="msd-season-chevron">
                            {expandedSeasons[season.seasonNumber] ? "▲" : "▼"}
                          </span>
                        </div>
                      </button>

                      {expandedSeasons[season.seasonNumber] && (
                        <div className="msd-episode-list">
                          {season.episodes.map((ep) => {
                            const watched = isEpisodeWatched(ep, watchedLookup);
                            const myEpisodeRating = Number(
                              myEpisodeRatings.get(String(ep.id)) || 0
                            );
                            const hoverEpisodeRating = Number(
                              hoverEpisodeRatings[String(ep.id)] || 0
                            );
                            const activeEpisodeRating =
                              hoverEpisodeRating || myEpisodeRating;
                            const averageEpisodeRating =
                              episodeAverageRatings.get(String(ep.id));
                            const savingThisEpisode =
                              savingEpisodeRatingId === ep.id;
                            const isPickerOpen =
                              openEpisodeRatingPickerId === ep.id;

                            return (
                              <article
                                id={`episode-${ep.id}`}
                                key={ep.id}
                                className={`msd-episode-card ${
                                  watched ? "msd-episode-watched" : ""
                                }`}
                              >
                                <div className="msd-episode-top">
                                  <div>
                                    <h3 className="msd-episode-title">
                                      {makeEpisodeCode(ep)} - {ep.name}
                                    </h3>
                                    <div className="msd-episode-date">
                                      Air date: {formatDate(ep.aired)}
                                    </div>
                                  </div>
                                  {watched ? (
                                    <span className="msd-watched-pill">
                                      Watched
                                    </span>
                                  ) : null}
                                </div>

                                {ep.overview ? (
                                  <p className="msd-episode-overview">
                                    {ep.overview}
                                  </p>
                                ) : null}

                                <div className="msd-episode-rating-box">
                                  <div className="msd-episode-rating-header">
                                    <span className="msd-stat-label">
                                      Your Episode Rating
                                    </span>
                                    <span className="msd-episode-rating-meta">
                                      {savingThisEpisode
                                        ? "Saving..."
                                        : myEpisodeRating
                                        ? `${myEpisodeRating}/10`
                                        : "Not rated"}
                                    </span>
                                  </div>

                                  <div className="msd-episode-rating-desktop">
                                    <div className="msd-burgr-picker msd-burgr-picker-compact">
                                      {Array.from(
                                        { length: 10 },
                                        (_, index) => {
                                          const value = index + 1;
                                          const filled =
                                            value <= activeEpisodeRating;

                                          return (
                                            <button
                                              key={value}
                                              type="button"
                                              className={`msd-burger-btn ${
                                                filled
                                                  ? "is-filled"
                                                  : "is-empty"
                                              }`}
                                              onMouseEnter={() =>
                                                setHoverEpisodeRatings(
                                                  (prev) => ({
                                                    ...prev,
                                                    [ep.id]: value,
                                                  })
                                                )
                                              }
                                              onMouseLeave={() =>
                                                setHoverEpisodeRatings(
                                                  (prev) => ({
                                                    ...prev,
                                                    [ep.id]: 0,
                                                  })
                                                )
                                              }
                                              onClick={() =>
                                                handleSelectEpisodeRating(
                                                  ep,
                                                  value
                                                )
                                              }
                                              aria-label={`Rate episode ${value} out of 10 burgers`}
                                              title={`${value}/10`}
                                              disabled={savingThisEpisode}
                                            >
                                              <img
                                                src="/burger-rating.png"
                                                alt=""
                                                className="msd-burger-icon msd-burger-icon-small"
                                              />
                                            </button>
                                          );
                                        }
                                      )}
                                    </div>
                                  </div>

                                  <div className="msd-episode-rating-mobile">
                                    <button
                                      type="button"
                                      className="msd-btn msd-btn-secondary msd-rating-trigger"
                                      onClick={() =>
                                        handleOpenEpisodeRatingPicker(ep.id)
                                      }
                                      disabled={savingThisEpisode}
                                    >
                                      {savingThisEpisode
                                        ? "Saving..."
                                        : myEpisodeRating
                                        ? `Rate Episode (${myEpisodeRating}/10)`
                                        : "Rate Episode"}
                                    </button>

                                    {isPickerOpen ? (
                                      <div className="msd-mobile-rating-sheet">
                                        <div className="msd-mobile-rating-grid">
                                          {Array.from(
                                            { length: 10 },
                                            (_, index) => {
                                              const value = index + 1;
                                              const selected =
                                                value === myEpisodeRating;

                                              return (
                                                <button
                                                  key={value}
                                                  type="button"
                                                  className={`msd-mobile-rating-option ${
                                                    selected
                                                      ? "is-selected"
                                                      : ""
                                                  }`}
                                                  onClick={() =>
                                                    handleSelectEpisodeRating(
                                                      ep,
                                                      value
                                                    )
                                                  }
                                                  disabled={savingThisEpisode}
                                                >
                                                  <img
                                                    src="/burger-rating.png"
                                                    alt=""
                                                    className="msd-burger-icon msd-burger-icon-small"
                                                  />
                                                  <span>{value}/10</span>
                                                </button>
                                              );
                                            }
                                          )}
                                        </div>
                                      </div>
                                    ) : null}
                                  </div>

                                  <div className="msd-episode-rating-footer">
                                    <span className="msd-muted">
                                      Average:{" "}
                                      {averageEpisodeRating
                                        ? `${averageEpisodeRating.avg}/10`
                                        : "—"}
                                      {averageEpisodeRating
                                        ? ` (${averageEpisodeRating.count})`
                                        : ""}
                                    </span>
                                  </div>
                                </div>

                                <div className="msd-actions">
                                  <button
                                    type="button"
                                    className={`msd-btn ${
                                      watched
                                        ? "msd-btn-secondary"
                                        : "msd-btn-primary"
                                    }`}
                                    onClick={() => handleMarkWatched(ep)}
                                  >
                                    {watched
                                      ? "Mark Unwatched"
                                      : "Mark Watched"}
                                  </button>

                                  <button
                                    type="button"
                                    className="msd-btn msd-btn-secondary"
                                    onClick={() => handleWatchUpToHere(ep)}
                                  >
                                    Watch up to here
                                  </button>
                                </div>
                              </article>
                            );
                          })}
                        </div>
                      )}
                    </section>
                  ))}
                </div>
              </>
            )}

            {activeTab === "cast" && (
              <>
                <h2 className="msd-section-title">Cast</h2>
                {extrasLoading ? (
                  <p className="msd-muted">Loading cast...</p>
                ) : cast.length > 0 ? (
                  <div className="msd-cast-grid msd-cast-grid-mobile">
                    {cast.map((member, index) => {
                      const actorName = member.personName || "Unknown actor";
                      const linkTarget = `/actor/${encodeURIComponent(
                        actorName
                      )}`;

                      return (
                        <Link
                          key={member.id || `${member.personName}-${index}`}
                          to={linkTarget}
                          className="msd-cast-card msd-cast-card-mobile"
                          style={{ textDecoration: "none", color: "inherit" }}
                        >
                          {member.image ? (
                            <img
                              src={member.image}
                              alt={actorName}
                              className="msd-cast-image msd-cast-image-mobile"
                            />
                          ) : (
                            <div className="msd-cast-image msd-cast-image-mobile msd-cast-placeholder" />
                          )}
                          <div className="msd-cast-name">{actorName}</div>
                        </Link>
                      );
                    })}
                  </div>
                ) : (
                  <p className="msd-muted">No cast available.</p>
                )}
              </>
            )}

            {activeTab === "crew" && (
              <>
                <h2 className="msd-section-title">Crew</h2>
                {extrasLoading ? (
                  <p className="msd-muted">Loading crew...</p>
                ) : crew.length > 0 ? (
                  <div className="msd-cast-grid msd-cast-grid-mobile">
                    {crew.map((member, index) => {
                      const personName = member.personName || "Unknown crew";
                      const roleName =
                        member.role ||
                        member.job ||
                        member.characterName ||
                        "Crew";

                      return (
                        <div
                          key={member.id || `${personName}-${roleName}-${index}`}
                          className="msd-cast-card msd-cast-card-mobile"
                        >
                          {member.image ? (
                            <img
                              src={member.image}
                              alt={personName}
                              className="msd-cast-image msd-cast-image-mobile"
                            />
                          ) : (
                            <div className="msd-cast-image msd-cast-image-mobile msd-cast-placeholder" />
                          )}
                          <div className="msd-cast-name">{personName}</div>
                          <div className="msd-cast-role">{roleName}</div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="msd-muted">No crew available yet.</p>
                )}
              </>
            )}

            {activeTab === "studio" && (
              <>
                <h2 className="msd-section-title">Studio</h2>
                <div className="msd-info-grid">
                  <div className="msd-info-card">
                    <span className="msd-stat-label">Studio</span>
                    <strong className="msd-stat-value">
                      {show.network ? (
                        <Link
                          to={`/search?network=${encodeURIComponent(
                            show.network
                          )}&${baseContext}`}
                          className="msd-link"
                        >
                          {show.network}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </strong>
                  </div>
                </div>
              </>
            )}

            {activeTab === "genre" && (
              <>
                <h2 className="msd-section-title">Genre</h2>
                <div className="msd-info-grid">
                  {show.genres?.length > 0 ? (
                    show.genres.map((genre) => (
                      <div key={genre} className="msd-info-card">
                        <Link
                          to={`/search?genre=${encodeURIComponent(
                            genre
                          )}&${baseContext}`}
                          className="msd-link msd-info-link"
                        >
                          {genre}
                        </Link>
                      </div>
                    ))
                  ) : (
                    <p className="msd-muted">No genres available.</p>
                  )}
                </div>
              </>
            )}
          </div>
        </section>

        <section className="msd-panel">
          <h2 className="msd-section-title">
            {peopleAlsoWatch.length > 0
              ? "People Also Watch"
              : "Recommended Shows"}
          </h2>
          {extrasLoading ? (
            <p className="msd-muted">Loading recommendations...</p>
          ) : recommendedShows.length > 0 ? (
            <div className="msd-recommended-grid">
              {recommendedShows.map((rec, index) => {
                const showName = rec.name || rec.title || "Unknown show";
                const linkTarget = getMappedShowHref(rec);
                const posterSrc =
                  rec.poster_url ||
                  rec.posterUrl ||
                  rec.image_url ||
                  rec.image ||
                  (rec.poster_path
                    ? `https://image.tmdb.org/t/p/w500${rec.poster_path}`
                    : "/no-image.png");

                return (
                  <Link
                    key={rec.id || `${showName}-${index}`}
                    to={linkTarget}
                    className="msd-rec-card"
                  >
                    <img
                      src={posterSrc}
                      alt={showName}
                      className="msd-rec-image"
                    />
                    <div className="msd-rec-title">{showName}</div>
                    {rec.first_aired || rec.firstAired || rec.first_air_date ? (
                      <div className="msd-rec-date">
                        {formatDate(
                          rec.first_aired ||
                            rec.firstAired ||
                            rec.first_air_date
                        )}
                      </div>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          ) : (
            <p className="msd-muted">No recommendations yet.</p>
          )}
        </section>

        <div className="msd-bottom-action-bar">
          <button
            type="button"
            className="msd-bottom-action-btn"
            onClick={handleToggleRemoveShow}
            disabled={savingShowAction}
          >
            {savingShowAction ? "Saving..." : isRemoved ? "Add Back" : "Remove"}
          </button>

          <button
            type="button"
            className="msd-bottom-action-btn"
            onClick={handleToggleArchiveShow}
            disabled={savingShowAction || isRemoved}
          >
            {savingShowAction
              ? "Saving..."
              : isArchived
              ? "Unarchive"
              : "Archive"}
          </button>

          {nextUnwatchedEpisode ? (
            <button
              type="button"
              className="msd-bottom-action-btn msd-bottom-action-btn-primary"
              onClick={handleMarkNextEpisodeWatched}
            >
              Watch Next
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
