import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { getShowStatus } from "../lib/showStatus";
import "./Dashboard.css";

const TMDB_API_KEY = import.meta.env.VITE_TMDB_API_KEY;
const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/w500";

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function toIsoDate(date) {
  return date.toISOString().slice(0, 10);
}

function isAired(dateValue) {
  if (!dateValue) return false;
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return false;
  return date <= new Date();
}

function daysUntil(dateValue) {
  if (!dateValue) return null;

  const now = new Date();
  const target = new Date(dateValue);

  if (Number.isNaN(target.getTime())) return null;

  const nowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const targetStart = new Date(
    target.getFullYear(),
    target.getMonth(),
    target.getDate()
  );

  return Math.ceil((targetStart - nowStart) / 86400000);
}

function toStatusEpisodeShape(ep) {
  return {
    seasonNumber: ep.season_number,
    number: ep.episode_number,
    aired: ep.aired_date,
    airDate: ep.aired_date,
    name: ep.name,
  };
}

function pickShowImage(show) {
  if (show?.poster_url) return show.poster_url;
  if (show?.backdrop_url) return show.backdrop_url;
  if (show?.poster_path) return `${TMDB_IMAGE_BASE}${show.poster_path}`;
  if (show?.backdrop_path) return `${TMDB_IMAGE_BASE}${show.backdrop_path}`;
  return "";
}

async function fetchTmdbJson(url) {
  const res = await fetch(url);
  const data = await res.json();

  if (!res.ok) {
    throw new Error(data?.status_message || `TMDB request failed: ${res.status}`);
  }

  return data;
}

async function fetchTrendingShows() {
  if (!TMDB_API_KEY) return [];

  const data = await fetchTmdbJson(
    `https://api.themoviedb.org/3/trending/tv/week?api_key=${encodeURIComponent(
      TMDB_API_KEY
    )}`
  );

  return (data.results || []).map((show) => ({
    tmdb_id: show.id,
    name: show.name,
    poster_path: show.poster_path,
    backdrop_path: show.backdrop_path,
    first_air_date: show.first_air_date,
    vote_average: show.vote_average,
  }));
}

async function fetchPremieringSoon() {
  if (!TMDB_API_KEY) return [];

  const today = startOfToday();
  const end = new Date(today);
  end.setDate(end.getDate() + 10);

  const todayStr = toIsoDate(today);
  const endStr = toIsoDate(end);

  const pages = await Promise.all(
    [1, 2, 3].map((page) =>
      fetchTmdbJson(
        `https://api.themoviedb.org/3/discover/tv?api_key=${encodeURIComponent(
          TMDB_API_KEY
        )}&sort_by=first_air_date.asc&first_air_date.gte=${todayStr}&first_air_date.lte=${endStr}&page=${page}`
      ).catch(() => ({ results: [] }))
    )
  );

  const merged = pages.flatMap((page) => page.results || []);

  const unique = Array.from(
    new Map(merged.map((show) => [String(show.id), show])).values()
  );

  return unique
    .filter((show) => {
      if (!show.first_air_date) return false;
      return show.first_air_date >= todayStr && show.first_air_date <= endStr;
    })
    .sort((a, b) => {
      const aDate = a.first_air_date || "";
      const bDate = b.first_air_date || "";
      return aDate.localeCompare(bDate);
    })
    .map((show) => ({
      tmdb_id: show.id,
      name: show.name,
      poster_path: show.poster_path,
      backdrop_path: show.backdrop_path,
      first_air_date: show.first_air_date,
      vote_average: show.vote_average,
    }));
}

export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState("");
  const [userAvatar, setUserAvatar] = useState("");
  const [myShows, setMyShows] = useState([]);
  const [trendingShows, setTrendingShows] = useState([]);
  const [premieringSoon, setPremieringSoon] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadDashboard() {
      try {
        setLoading(true);
        setError("");

        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          if (active) {
            setMyShows([]);
            setTrendingShows([]);
            setPremieringSoon([]);
          }
          return;
        }

        const [{ data: profile }, { data: userShowsRows, error: userShowsError }] =
          await Promise.all([
            supabase
              .from("profiles")
              .select("display_name, avatar_url")
              .eq("id", user.id)
              .maybeSingle(),
            supabase
              .from("user_shows_new")
              .select(`
                id,
                status,
                archived,
                shows (
                  id,
                  name,
                  poster_url,
                  backdrop_url,
                  first_aired,
                  last_aired,
                  next_aired,
                  status,
                  runtime_minutes,
                  episodes (
                    season_number,
                    episode_number,
                    aired_date,
                    name
                  )
                )
              `)
              .eq("user_id", user.id),
          ]);

        if (userShowsError) throw userShowsError;

        const [trending, premiering] = await Promise.all([
          fetchTrendingShows(),
          fetchPremieringSoon(),
        ]);

        if (!active) return;

        setUserName(
          profile?.display_name ||
            user.user_metadata?.display_name ||
            user.email?.split("@")[0] ||
            "User"
        );
        setUserAvatar(profile?.avatar_url || user.user_metadata?.avatar_url || "");
        setMyShows(userShowsRows || []);
        setTrendingShows(trending);
        setPremieringSoon(premiering);
      } catch (err) {
        console.error(err);
        if (active) {
          setError(err.message || "Failed to load dashboard.");
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    loadDashboard();

    return () => {
      active = false;
    };
  }, []);

  const stats = useMemo(() => {
    const rows = myShows || [];

    const totalShows = rows.filter((row) => !row.archived).length;
    const archivedShows = rows.filter((row) => row.archived).length;
    const completedShows = rows.filter(
      (row) => !row.archived && row.status === "completed"
    ).length;
    const inProgressShows = rows.filter(
      (row) => !row.archived && row.status === "watching"
    ).length;

    let totalRuntimeMinutes = 0;

    for (const row of rows) {
      if (row.archived) continue;

      const show = row.shows;
      const eps = (show?.episodes || []).filter((ep) => isAired(ep.aired_date));
      const runtime = Number(show?.runtime_minutes) || 0;

      if (runtime > 0 && eps.length > 0) {
        totalRuntimeMinutes += runtime * eps.length;
      }
    }

    const totalHours = Math.round(totalRuntimeMinutes / 60);

    return {
      totalShows,
      inProgressShows,
      completedShows,
      archivedShows,
      totalHours,
    };
  }, [myShows]);

  const airingThisWeek = useMemo(() => {
    const today = startOfToday();
    const weekEnd = new Date(today);
    weekEnd.setDate(weekEnd.getDate() + 7);
    const endStr = toIsoDate(weekEnd);
    const todayStr = toIsoDate(today);

    return (myShows || [])
      .filter((row) => !row.archived && row.shows)
      .map((row) => {
        const show = row.shows;
        const upcomingEpisode = (show.episodes || [])
          .filter((ep) => ep.aired_date && ep.aired_date >= todayStr && ep.aired_date <= endStr)
          .sort((a, b) => (a.aired_date || "").localeCompare(b.aired_date || ""))[0];

        if (!upcomingEpisode) return null;

        return {
          id: show.id,
          name: show.name,
          poster_url: show.poster_url,
          backdrop_url: show.backdrop_url,
          airDate: upcomingEpisode.aired_date,
          episodeLabel: `S${String(upcomingEpisode.season_number).padStart(2, "0")}E${String(
            upcomingEpisode.episode_number
          ).padStart(2, "0")}`,
          episodeName: upcomingEpisode.name,
          statusText: getShowStatus({
            show: {
              ...show,
              episodes: (show.episodes || []).map(toStatusEpisodeShape),
            },
          }),
        };
      })
      .filter(Boolean)
      .sort((a, b) => (a.airDate || "").localeCompare(b.airDate || ""));
  }, [myShows]);

  if (loading) {
    return <div className="dashboard-loading">Loading dashboard…</div>;
  }

  if (error) {
    return <div className="dashboard-error">{error}</div>;
  }

  return (
    <div className="dashboard-page">
      <header className="dashboard-topbar">
        <div className="dashboard-brand">BURGRS</div>

        <Link to="/profile-edit" className="dashboard-profile-link">
          {userAvatar ? (
            <img className="dashboard-avatar" src={userAvatar} alt={userName} />
          ) : (
            <div className="dashboard-avatar dashboard-avatar-fallback">
              {userName.slice(0, 1).toUpperCase()}
            </div>
          )}
          <span className="dashboard-profile-name">{userName}</span>
        </Link>
      </header>

      <section className="dashboard-section">
        <h2 className="dashboard-section-title">Trending Shows</h2>
        <div className="dashboard-poster-row">
          {trendingShows.map((show) => (
            <Link
              key={show.tmdb_id}
              to={`/search?tmdb=${show.tmdb_id}`}
              className="dashboard-poster-card"
            >
              <img
                src={pickShowImage(show)}
                alt={show.name}
                className="dashboard-poster-image"
              />
            </Link>
          ))}
        </div>
      </section>

      <section className="dashboard-section dashboard-premiering-section">
        <h2 className="dashboard-section-title">Premiering Soon</h2>
        <div className="dashboard-poster-row">
          {premieringSoon.map((show) => (
            <Link
              key={show.tmdb_id}
              to={`/search?tmdb=${show.tmdb_id}`}
              className="dashboard-poster-card"
            >
              <img
                src={pickShowImage(show)}
                alt={show.name}
                className="dashboard-poster-image"
              />
              <div className="dashboard-poster-meta">
                <span className="dashboard-poster-date">
                  {formatDate(show.first_air_date)}
                </span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="dashboard-section dashboard-stats-section">
        <div className="dashboard-stats-row">
          <div className="dashboard-stat-card">
            <span className="dashboard-stat-label">Total Shows</span>
            <strong className="dashboard-stat-value">{stats.totalShows}</strong>
          </div>

          <div className="dashboard-stat-card">
            <span className="dashboard-stat-label">In Progress</span>
            <strong className="dashboard-stat-value">{stats.inProgressShows}</strong>
          </div>

          <div className="dashboard-stat-card">
            <span className="dashboard-stat-label">Completed</span>
            <strong className="dashboard-stat-value">{stats.completedShows}</strong>
          </div>

          <div className="dashboard-stat-card">
            <span className="dashboard-stat-label">Time Watched</span>
            <strong className="dashboard-stat-value">{stats.totalHours}h</strong>
          </div>

          <div className="dashboard-stat-card">
            <span className="dashboard-stat-label">Archived</span>
            <strong className="dashboard-stat-value">{stats.archivedShows}</strong>
          </div>
        </div>
      </section>

      <section className="dashboard-section">
        <h2 className="dashboard-section-title">Airing This Week</h2>

        <div className="dashboard-airing-list">
          {airingThisWeek.length === 0 ? (
            <div className="dashboard-empty-card">No upcoming episodes this week.</div>
          ) : (
            airingThisWeek.map((show) => (
              <Link
                key={`${show.id}-${show.episodeLabel}-${show.airDate}`}
                to={`/my-shows/${show.id}`}
                className="dashboard-airing-card"
              >
                <img
                  src={pickShowImage(show)}
                  alt={show.name}
                  className="dashboard-airing-image"
                />

                <div className="dashboard-airing-content">
                  <div className="dashboard-airing-title-row">
                    <h3>{show.name}</h3>
                    <span className="dashboard-airing-date">
                      {formatDate(show.airDate)}
                    </span>
                  </div>

                  <div className="dashboard-airing-subtitle">
                    {show.episodeLabel}
                    {show.episodeName ? ` • ${show.episodeName}` : ""}
                  </div>

                  {typeof show.statusText === "string" && show.statusText ? (
                    <div className="dashboard-airing-status">{show.statusText}</div>
                  ) : null}
                </div>
              </Link>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
