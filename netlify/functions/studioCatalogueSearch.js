import { handler as legacyStudioSearch } from "./studioSearchShows.js";

const TVDB_BASE = "https://api4.thetvdb.com/v4";
const TMDB_BASE = "https://api.themoviedb.org/3";
const IMAGE_BASE = "https://image.tmdb.org/t/p";
const MAX_TMDB_PAGE = 500;
const CACHE_TTL_MS = 30 * 60 * 1000;
const ENTITY_SUFFIXES = new Set([
  "channel",
  "company",
  "entertainment",
  "media",
  "network",