import { createClient } from "@supabase/supabase-js";
import { installSmartShowLinks } from "./smartShowLinks";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const MY_SHOWS_CACHE_PREFIX = "trackt_my_shows_cache_v1";
const DASHBOARD_CACHE_PREFIX = "trackt_dashboard_cache_v6_SAVED_SHOW_ID_LINKS";
const