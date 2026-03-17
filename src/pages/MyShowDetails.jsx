import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { formatDate } from "../lib/date";
import "./MyShowDetails.css";
import {
  makeEpisodeCode,
  buildWatchedSets,
  isEpisodeWatched,
} from "../lib/episodeHelpers";

function isFuture(dateString) {
  if (!dateString) return false;
  const d = new Date(dateString);
  return !Number.isNaN(d.getTime()) && d > new Date();
}

function getDaysUntil(dateString) {
  if (!dateString) return null;
  const now = new Date();
  const target = new Date(dateString);
  if (Number.isNaN(target.getTime())) return null;
  const nowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const targetStart = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  return Math.ceil((targetStart.getTime() - nowStart.getTime()) / 86400000);
}

async function fetchWatchedRows(userId, showId) {
  const { data, error } = await supabase
    .from("watched_episodes")
    .select("episode_row_id, episode_id, episode_code, season_number, episode_number")
    .eq("user_id", userId)
    .eq("show_tvdb_id", String(showId));

  if (error) throw error;
  return data || [];
}

export default function MyShowDetails() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const targetEpisodeId = searchParams.get("episode");

  const [loading, setLoading] = useState(true);
  const [show, setShow] = useState(null);
  const [episodes, setEpisodes] = useState([]);
  const [watchedRows, setWatchedRows] = useState([]);
  const [expandedSeasons, setExpandedSeasons] = useState({});

  const watchedSets = useMemo(() => buildWatchedSets(watchedRows), [watchedRows]);

  useEffect(() => {
    async function loadShow() {
      setLoading(true);
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          setLoading(false);
          return;
        }

        const { data: showData, error: showError } = await supabase
          .from("user_shows")
          .select("*")
          .eq("user_id", user.id)
          .eq("tvdb_id", String(id))
          .single();

        if (showError) throw showError;

        const [{ data: storedShow }, { data: episodeRows, error: episodeError }, watchedRowsData] = await Promise.all([
          supabase.from("shows").select("*").eq("tvdb_id", String(id)).maybeSingle(),
          supabase
            .from("episodes")
            .select("*")
            .eq("show_tvdb_id", String(id))
            .order("season_number", { ascending: true })
            .order("episode_number", { ascending: true }),
          fetchWatchedRows(user.id, id),
        ]);

        if (episodeError) throw episodeError;

        const normalizedEpisodes = (episodeRows || []).map((row) => ({
          id: row.id,
          tvdb_episode_id: row.tvdb_episode_id,
          seasonNumber: row.season_number,
          number: row.episode_number,
          aired: row.aired,
          airDate: row.aired,
          name: row.episode_name || "Untitled episode",
          overview: row.overview || "",
          image: row.image_url || null,
          episode_code: row.episode_code,
        }));

        const seasonMap = {};
        normalizedEpisodes.forEach((ep) => {
          if (!(ep.seasonNumber in seasonMap)) seasonMap[ep.seasonNumber] = false;
        });

        if (targetEpisodeId) {
          const targetEpisode = normalizedEpisodes.find((ep) => String(ep.id) === String(targetEpisodeId));
          if (targetEpisode) seasonMap[targetEpisode.seasonNumber] = true;
        }

        setShow({
          ...showData,
          overview: showData.overview || storedShow?.overview || "",
          poster_url: showData.poster_url || storedShow?.poster_url || null,
          first_aired: showData.first_aired || storedShow?.first_air_date || null,
        });
        setEpisodes(normalizedEpisodes);
        setWatchedRows(watchedRowsData);
        setExpandedSeasons(seasonMap);
      } catch (error) {
        console.error("Failed loading show:", error);
        setShow(null);
      } finally {
        setLoading(false);
      }
    }

    loadShow();
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
      if (!grouped[ep.seasonNumber]) grouped[ep.seasonNumber] = [];
      grouped[ep.seasonNumber].push(ep);
    }

    return Object.entries(grouped)
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([seasonNumber, seasonEpisodes]) => {
        const watchedCount = seasonEpisodes.filter((ep) => isEpisodeWatched(ep, watchedSets)).length;
        return {
          seasonNumber: Number(seasonNumber),
          episodes: seasonEpisodes,
          watchedCount,
          totalCount: seasonEpisodes.length,
          complete: seasonEpisodes.length > 0 && watchedCount === seasonEpisodes.length,
        };
      });
  }, [episodes, watchedSets]);

  const stats = useMemo(() => {
    const total = episodes.length;
    const watched = episodes.filter((ep) => isEpisodeWatched(ep, watchedSets)).length;
    const pct = total > 0 ? Math.round((watched / total) * 100) : 0;
    const nextEpisode = episodes.find((ep) => !isEpisodeWatched(ep, watchedSets) && isFuture(ep.aired));
    return { total, watched, pct, nextEpisode };
  }, [episodes, watchedSets]);

  function toggleSeason(seasonNumber) {
    setExpandedSeasons((prev) => ({ ...prev, [seasonNumber]: !prev[seasonNumber] }));
  }

  async function refreshWatched(showTvdbId, userId) {
    const fresh = await fetchWatchedRows(userId, showTvdbId);
    setWatchedRows(fresh);
  }

  async function handleMarkWatched(ep) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    try {
      const payload = {
        user_id: user.id,
        show_tvdb_id: String(id),
        episode_row_id: ep.id,
        episode_id: ep.tvdb_episode_id ? String(ep.tvdb_episode_id) : null,
        season_number: ep.seasonNumber,
        episode_number: ep.number,
        episode_code: makeEpisodeCode(ep),
      };

      const { error } = await supabase
        .from("watched_episodes")
        .upsert(payload, { onConflict: "user_id,show_tvdb_id,season_number,episode_number" });

      if (error) throw error;
      await refreshWatched(String(id), user.id);
    } catch (error) {
      console.error("Failed marking watched:", error);
      alert(error.message || "Failed marking watched");
    }
  }

  async function handleWatchUpToHere(targetEpisode) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    try {
      const showTvdbId = String(id);
      const episodesToBeWatched = episodes.filter((ep) => {
        if (ep.seasonNumber < targetEpisode.seasonNumber) return true;
        return ep.seasonNumber === targetEpisode.seasonNumber && ep.number <= targetEpisode.number;
      });

      const { error: deleteError } = await supabase
        .from("watched_episodes")
        .delete()
        .eq("user_id", user.id)
        .eq("show_tvdb_id", showTvdbId);

      if (deleteError) throw deleteError;

      if (episodesToBeWatched.length > 0) {
        const rows = episodesToBeWatched.map((ep) => ({
          user_id: user.id,
          show_tvdb_id: showTvdbId,
          episode_row_id: ep.id,
          episode_id: ep.tvdb_episode_id ? String(ep.tvdb_episode_id) : null,
          season_number: ep.seasonNumber,
          episode_number: ep.number,
          episode_code: makeEpisodeCode(ep),
        }));

        const { error: insertError } = await supabase
          .from("watched_episodes")
          .upsert(rows, { onConflict: "user_id,show_tvdb_id,season_number,episode_number" });

        if (insertError) throw insertError;
      }

      await refreshWatched(showTvdbId, user.id);
    } catch (error) {
      console.error("Failed watch up to here:", error);
      alert(error.message || "Failed watch up to here");
    }
  }

  if (loading) {
    return <div className="msd-page"><div className="msd-shell"><div className="msd-loading">Loading show...</div></div></div>;
  }

  if (!show) {
    return <div className="msd-page"><div className="msd-shell"><div className="msd-empty"><p>Show not found.</p><Link to="/my-shows" className="msd-back-link">Back to My Shows</Link></div></div></div>;
  }

  return (
    <div className="msd-page">
      <div className="msd-shell">
        <Link to="/my-shows" className="msd-back-link">← Back to My Shows</Link>

        <section className="msd-hero">
          <img src={show.poster_url} alt={show.show_name} className="msd-poster" />

          <div className="msd-hero-main">
            <h1 className="msd-title">{show.show_name}</h1>
            {show.overview ? <p className="msd-overview">{show.overview}</p> : null}

            <div className="msd-meta">
              {show.first_aired ? <div>First aired: {formatDate(show.first_aired)}</div> : null}
              {stats.nextEpisode ? (
                <div>
                  Next episode: {formatDate(stats.nextEpisode.aired)} (
                  {getDaysUntil(stats.nextEpisode.aired) === 0 ? "TODAY" : getDaysUntil(stats.nextEpisode.aired) === 1 ? "IN 1 DAY" : `IN ${getDaysUntil(stats.nextEpisode.aired)} DAYS`})
                </div>
              ) : null}
            </div>

            <div className="msd-stats-row">
              <div className="msd-stat-box"><span className="msd-stat-label">Watched</span><strong className="msd-stat-value">{stats.watched}</strong></div>
              <div className="msd-stat-box"><span className="msd-stat-label">Total</span><strong className="msd-stat-value">{stats.total}</strong></div>
              <div className="msd-stat-box"><span className="msd-stat-label">Progress</span><strong className="msd-stat-value">{stats.pct}%</strong></div>
            </div>

            <div className="msd-progress"><div className="msd-progress-fill" style={{ width: `${stats.pct}%` }} /></div>
          </div>
        </section>

        <section className="msd-episodes-section">
          <h2 className="msd-section-title">Episodes</h2>
          <div className="msd-seasons">
            {groupedSeasons.map((season) => (
              <section key={season.seasonNumber} className={`msd-season-card ${season.complete ? "msd-season-complete" : ""}`}>
                <button type="button" className="msd-season-toggle" onClick={() => toggleSeason(season.seasonNumber)}>
                  <div>
                    <div className="msd-season-title">Season {season.seasonNumber}</div>
                    <div className="msd-season-subtitle">{season.watchedCount}/{season.totalCount} watched</div>
                  </div>
                  <div className="msd-season-toggle-right">
                    {season.complete ? <span className="msd-season-badge">Completed</span> : null}
                    <span className="msd-season-chevron">{expandedSeasons[season.seasonNumber] ? "▲" : "▼"}</span>
                  </div>
                </button>

                {expandedSeasons[season.seasonNumber] && (
                  <div className="msd-episode-list">
                    {season.episodes.map((ep) => {
                      const watched = isEpisodeWatched(ep, watchedSets);
                      return (
                        <article id={`episode-${ep.id}`} key={ep.id} className={`msd-episode-card ${watched ? "msd-episode-watched" : ""}`}>
                          <div className="msd-episode-top">
                            <div>
                              <h3 className="msd-episode-title">{makeEpisodeCode(ep)} - {ep.name}</h3>
                              <div className="msd-episode-date">Air date: {formatDate(ep.aired)}</div>
                            </div>
                            {watched ? <span className="msd-watched-pill">Watched</span> : null}
                          </div>
                          {ep.overview ? <p className="msd-episode-overview">{ep.overview}</p> : null}
                          <div className="msd-actions">
                            <button type="button" className={`msd-btn ${watched ? "msd-btn-success" : "msd-btn-primary"}`} onClick={() => handleMarkWatched(ep)} disabled={watched}>{watched ? "Watched" : "Mark Watched"}</button>
                            <button type="button" className="msd-btn msd-btn-secondary" onClick={() => handleWatchUpToHere(ep)}>Watch up to here</button>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
