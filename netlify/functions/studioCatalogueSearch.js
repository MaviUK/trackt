import { handler as legacyStudioSearch } from "./studioSearchShows.js";

const TVDB_BASE = "https://api4.thetvdb.com/v4";
const TMDB_BASE = "https://api.themoviedb.org/3";
const IMAGE_BASE = "https://image.tmdb.org/t/p";
const MAX_TMDB_PAGE = 500;

let tvdbToken = null;
let tvdbTokenExpiresAt = 0;
let genreMapCache = null;

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset