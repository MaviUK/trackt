import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { formatDate } from "../lib/date";
import "./Dashboard.css";


function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function parseDate(dateStr) {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getDisplayEpisodeCode(ep) {
  return `S${String(ep.seasonNumber).padStart(2, "0")}E${String(
    ep.number
  ).padStart(2, "0")}`;
}

function isEpisodeWatched(ep, watchedEpisodeIds) {
  if (!ep?.id) return false;
  return watchedEpisodeIds.has(String(ep.id));
}

function isFirstEpisode(ep) {
  return Number(ep?.seasonNumber) === 1 && Number(ep?.episodeNumber) === 1;
}

function normalizeStatus(value) {
  if (!value) return "";
  return String(value).trim().toLowerCase();
}

function isArchivedStatus(value) {
  const status = normalizeStatus(value);
  return status === "archived" || status === "archive";
}

function isWatchlistStatus(value) {
  const status = normalizeStatus(value);
  return status === "watchlist" || status === "plan_to_watch";
}

function formatMinutes(totalMinutes) {
  const minutes = Number(totalMinutes) || 0;

  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;

  return `${days}d ${hours}h ${mins}m`;
}

function chunkArray(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

async function fetchEpisodesForShowIds(showIds) {
  if (!showIds.length) return [];

  const batches = chunkArray(showIds, 4);
  const allEpisodes = [];
  const pageSize = 1000;

  for (const batch of batches) {
    let from = 0;
    let done = false;

    while (!done) {
      const to = from + pageSize - 1;

      const { data, error } = await supabase
        .from("episodes")
        .select(`
          id,
          show_id,
          season_number,
          episode_number,
          name,
          aired_date,
          overview,
          image_url,
          episode_code,
          created_at,
          runtime_minutes
        `)
        .in("show_id", batch)
        .order("show_id", { ascending: true })
        .order("season_number", { ascending: true })
        .order("episode_number", { ascending: true })
        .range(from, to);

      if (error) throw error;

      const rows = data || [];
      allEpisodes.push(...rows);

      if (rows.length < pageSize) {
        done = true;
      } else {
        from += pageSize;
      }
    }
  }

  return allEpisodes;
}

async function fetchAllWatchedEpisodeRows(userId) {
  const pageSize = 1000;
  let from = 0;
  let done = false;
  const allRows = [];

  while (!done) {
    const to = from + pageSize - 1;

    const { data, error } = await supabase
      .from("watched_episodes")
      .select("episode_id")
      .eq("user_id", userId)
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

function DashboardEpisodeItem({
  show,
  episode,
  dateLabel = "Airs",
  dateValue,
}) {
  return (
    <Link
      to={`/my-shows/${show.tvdb_id}?episode=${episode.id}`}
      className="dashboard-item"
    >
      {show.poster_url ? (
        <img
          src={show.poster_url}
          alt={show.show_name}
          className="dashboard-poster"
        />
      ) : (
        <div className="dashboard-poster" />
      )}

      <div className="dashboard-item-info">
        <strong>{show.show_name}</strong>
        <span>
          {getDisplayEpisodeCode(episode)} - {episode.name}
        </span>
        <small>
          {dateLabel}: {formatDate(dateValue || episode.aired)}
        </small>
      </div>
    </Link>
  );
}

function StatCard({ label, value, to = null }) {
  const content = (
    <>
      <span className="stat-label">{label}</span>
      <strong className="stat-value">{value}</strong>
    </>
  );

  if (to) {
    return (
      <Link to={to} className="stat-card stat-card-link">
        {content}
      </Link>
    );
  }

  return <div className="stat-card">{content}</div>;
}

export default function Dashboard() {
  const [profile, setProfile] = useState(null);
  const [shows, setShows] = useState([]);
  const [watchedEpisodeIds, setWatchedEpisodeIds] = useState(new Set());
  const [episodesByShow, setEpisodesByShow] = useState({});
  const [upcomingItems, setUpcomingItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadDashboard() {
      setLoading(true);

      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          setProfile(null);
          setShows([]);
          setWatchedEpisodeIds(new Set());
          setEpisodesByShow({});
          setUpcomingItems([]);
          setLoading(false);
          return;
        }

        const [profileResp, showsResp] = await Promise.all([
          supabase
            .from("profiles")
            .select(`
              id,
              username,
              full_name,
              avatar_url,
              dob,
              gender,
              country,
              bio,
              instagram_url,
              x_url,
              tiktok_url,
              youtube_url,
              website_url
            `)
            .eq("id", user.id)
            .maybeSingle(),

          supabase
            .from("user_shows_new")
            .select(`
              id,
              user_id,
              show_id,
              watch_status,
              archived_at,
              added_at,
              created_at,
              shows!inner(
                id,
                tvdb_id,
                name,
                overview,
                status,
                poster_url,
                first_aired
              )
            `)
            .eq("user_id", user.id),
        ]);

        if (profileResp.error) {
          console.error("Error loading profile:", profileResp.error);
        }

        if (showsResp.error) {
          throw showsResp.error;
        }

        const normalizedShows = (showsResp.data || []).map((row) => ({
          id: row.id,
          user_id: row.user_id,
          show_id: row.show_id,
          watch_status: row.watch_status || "watching",
          archived_at: row.archived_at || null,
          added_at: row.added_at,
          created_at: row.created_at,
          tvdb_id: row.shows.tvdb_id,
          show_name: row.shows.name || "Unknown title",
          overview: row.shows.overview || "",
          status: row.shows.status || null,
          poster_url: row.shows.poster_url || null,
          first_aired: row.shows.first_aired || null,
        }));

        const showIds = normalizedShows
          .map((show) => show.show_id)
          .filter(Boolean);

        if (!showIds.length) {
          setProfile(profileResp.data || null);
          setShows([]);
          setWatchedEpisodeIds(new Set());
          setEpisodesByShow({});
          setUpcomingItems([]);
          setLoading(false);
          return;
        }

        const [watchedRows, allEpisodes] = await Promise.all([
          fetchAllWatchedEpisodeRows(user.id),
          fetchEpisodesForShowIds(showIds),
        ]);

        const watchedIds = new Set(
          (watchedRows || [])
            .map((row) => row.episode_id)
            .filter(Boolean)
            .map(String)
        );

        const episodesLookup = {};
        for (const row of allEpisodes || []) {
          if (!episodesLookup[row.show_id]) {
            episodesLookup[row.show_id] = [];
          }

          episodesLookup[row.show_id].push({
            id: row.id,
            show_id: row.show_id,
            seasonNumber: row.season_number,
            number: row.episode_number,
            episodeNumber: row.episode_number,
            name: row.name || "Untitled episode",
            aired: row.aired_date,
            overview: row.overview || "",
            image: row.image_url || null,
            episodeCode: row.episode_code || null,
            created_at: row.created_at || null,
            runtime_minutes: Number(row.runtime_minutes) || 0,
          });
        }

        const showLookup = {};
        for (const show of normalizedShows) {
          showLookup[show.show_id] = show;
        }

        const today = startOfToday();
        const upcomingByShow = {};

        for (const row of allEpisodes || []) {
          const show = showLookup[row.show_id];
          if (!show) continue;
          if (!row.aired_date) continue;

          const airDate = new Date(row.aired_date);
          if (Number.isNaN(airDate.getTime())) continue;

          const airDay = new Date(airDate);
          airDay.setHours(0, 0, 0, 0);

          if (airDay < today) continue;

          if (!upcomingByShow[row.show_id]) {
            upcomingByShow[row.show_id] = [];
          }

          upcomingByShow[row.show_id].push({
            id: row.id,
            show_id: row.show_id,
            showTvdbId: String(show.tvdb_id),
            showName: show.show_name,
            posterUrl: show.poster_url,
            watchStatus: show.watch_status,
            seasonNumber: row.season_number,
            episodeNumber: row.episode_number,
            name: row.name || "Untitled episode",
            aired: row.aired_date,
          });
        }

        const collectedUpcoming = [];

        Object.values(upcomingByShow).forEach((showEpisodes) => {
          if (!showEpisodes.length) return;

          showEpisodes.sort((a, b) => new Date(a.aired) - new Date(b.aired));

          const firstUpcomingEpisode = showEpisodes[0];
          const status = normalizeStatus(firstUpcomingEpisode.watchStatus);

          if (isArchivedStatus(status)) {
            return;
          }

          if (isWatchlistStatus(status) && !isFirstEpisode(firstUpcomingEpisode)) {
            return;
          }

          collectedUpcoming.push(
            ...showEpisodes.map((ep) => ({
              show: {
                tvdb_id: ep.showTvdbId,
                show_name: ep.showName,
                poster_url: ep.posterUrl,
              },
              episode: {
                id: ep.id,
                show_id: ep.show_id,
                seasonNumber: ep.seasonNumber,
                number: ep.episodeNumber,
                episodeNumber: ep.episodeNumber,
                name: ep.name,
                aired: ep.aired,
              },
            }))
          );
        });

        collectedUpcoming.sort(
          (a, b) => new Date(a.episode.aired) - new Date(b.episode.aired)
        );

        setProfile(profileResp.data || null);
        setShows(normalizedShows);
        setWatchedEpisodeIds(watchedIds);
        setEpisodesByShow(episodesLookup);
        setUpcomingItems(collectedUpcoming);
      } catch (error) {
        console.error("Error loading dashboard:", error);
        setProfile(null);
        setShows([]);
        setWatchedEpisodeIds(new Set());
        setEpisodesByShow({});
        setUpcomingItems([]);
      } finally {
        setLoading(false);
      }
    }

    loadDashboard();
  }, []);

  const dashboardData = useMemo(() => {
    let completedCount = 0;
    let inProgressCount = 0;
    let watchedMinutes = 0;

    for (const show of shows) {
      const isArchived = isArchivedStatus(show.watch_status);
      const episodes = episodesByShow[show.show_id] || [];

      const mainEpisodes = episodes.filter(
        (ep) => Number(ep.seasonNumber ?? 0) !== 0
      );

      const watchedMainEpisodes = mainEpisodes.filter((ep) =>
        isEpisodeWatched(ep, watchedEpisodeIds)
      );

      const watchedMainCount = watchedMainEpisodes.length;
      const totalMainEpisodes = mainEpisodes.length;

      for (const watchedEp of watchedMainEpisodes) {
        watchedMinutes += Number(watchedEp.runtime_minutes) || 0;
      }

      const isCompleted =
        totalMainEpisodes > 0 &&
        watchedMainCount >= totalMainEpisodes &&
        !isArchived;

      const isInProgress =
        watchedMainCount > 0 &&
        watchedMainCount < totalMainEpisodes &&
        !isArchived;

      if (isCompleted) completedCount += 1;
      if (isInProgress) inProgressCount += 1;
    }

    const today = startOfToday();
    const end = new Date(today);
    end.setDate(today.getDate() + 7);

    const airingThisWeek = upcomingItems.filter((item) => {
      const d = new Date(item.episode.aired);
      return d >= today && d < end;
    });

    return {
      totalShows: shows.length,
      completedCount,
      inProgressCount,
      watchedMinutes,
      airingThisWeek,
    };
  }, [shows, watchedEpisodeIds, episodesByShow, upcomingItems]);

  if (loading) {
    return (
      <div className="page">
        <p>Loading dashboard...</p>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>Dashboard</h1>
        <p>Your TV tracking at a glance.</p>
      </div>

      <section className="dashboard-card profile-card">
        <div className="profile-header-row">
          <div className="profile-main">
           {profile?.avatar_url ? (
  <img
    src={profile.avatar_url}
    alt={profile?.username || profile?.full_name || "Profile"}
    className="profile-avatar"
    style={{
      objectFit: "cover",
      objectPosition: `${profile?.avatar_x ?? 50}% ${profile?.avatar_y ?? 50}%`,
      transform: `scale(${profile?.avatar_zoom ?? 1})`,
    }}
  />
) : (
  <div className="profile-avatar profile-avatar-placeholder">
    {(profile?.username || profile?.full_name || "U")
      .charAt(0)
      .toUpperCase()}
  </div>
)}

            <div className="profile-meta">
              <h2>{profile?.username || profile?.full_name || "Set your profile"}</h2>
              {profile?.country ? <p>{profile.country}</p> : null}
              {profile?.bio ? <small>{profile.bio}</small> : null}
            </div>
          </div>

          <Link to="/profile/edit" className="profile-edit-button">
            Edit
          </Link>
        </div>
      </section>

      <div className="stats-scroll-row">
        <div className="stats-grid stats-grid-scroll">
          <StatCard
            label="Total Shows"
            value={dashboardData.totalShows}
            to="/my-shows"
          />
          <StatCard
            label="In Progress"
            value={dashboardData.inProgressCount}
          />
          <StatCard
            label="Completed"
            value={dashboardData.completedCount}
          />
          <StatCard
            label="Time Watched"
            value={formatMinutes(dashboardData.watchedMinutes)}
          />
        </div>
      </div>

      <div className="dashboard-grid">
        <section className="dashboard-card">
          <div className="card-header">
            <h2>Airing This Week</h2>
          </div>

          {dashboardData.airingThisWeek.length === 0 ? (
            <p className="empty-state">No episodes airing in this range.</p>
          ) : (
            <div className="dashboard-list">
              {dashboardData.airingThisWeek.map(({ show, episode }) => (
                <DashboardEpisodeItem
                  key={`${show.tvdb_id}-${episode.id}-week`}
                  show={show}
                  episode={episode}
                  dateLabel="Airs"
                  dateValue={episode.aired}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
