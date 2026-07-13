import { handler as legacyStudioSearch } from "./studioSearchShows.js";

const TMDB_BASE = "https://api.themoviedb.org/3";
const IMAGE_BASE = "https://image.tmdb.org/t/p";
const DEFAULT_REGION = "GB";
const MAX_TMDB_PAGE = 500;

// Some values shown as a show's studio are actually original TV networks.
const NETWORK_ALIASES = new Map([
  ["peacock", { id: 3353, name: "Peacock" }],
  ["