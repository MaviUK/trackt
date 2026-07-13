const TMDB_BASE = "https://api.themoviedb.org/3";
const IMAGE_BASE = "https://image.tmdb.org/t/p";
const MAX_TMDB_PAGE = 500;

const TV_TYPE_ALIASES = new Map([
  ["mini series", { value: "2", label: "Mini-Series" }],
  ["miniseries", { value: "2", label: "Mini-Series" }],
  ["limited series", { value: "2", label: "Limited Series" }],
  ["limited tv series", { value: "2", label: "Limited Series" }],
  ["document