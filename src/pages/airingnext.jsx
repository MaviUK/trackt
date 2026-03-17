import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { formatDate } from "../lib/date";
import "./AiringNextPage.css";

function getDaysUntil(dateString) {
  if (!dateString) return null;

  const now = new Date();
  const target = new Date(dateString);

  if (Number.isNaN(target.getTime())) return null;

  const nowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const targetStart = new Date(
    target.getFullYear(),
    target.getMonth(),
    target.getDate()
  );

  const diffMs = targetStart.getTime() - nowStart.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

function getEpisodeCode(ep) {
  return `S${String(ep.seasonNumber).padStart(2, "0")}E${String(
    ep.number
  ).padStart(2, "0")}`;
}

export default function AiringNextPage() {
  const [loading, setLoading] = useState(true);
  const [shows, setShows] = useState([]);
  const [episodesByShow, setEpisodesByShow] = useState({});

  useEffect(() => {
    async function loadData() {
      setLoading(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setShows([]);
        setEpisodesByShow({});
        setLoading(false);
        return;
      }

      const { data: userShows, error: showsError } = await supabase
        .from("user_shows")
        .select("*")
        .eq("user_id", user.id)
        .order("show_name", { ascending: true });

      if (showsError) {
        console.error("Failed to load user shows:", showsError);
        setShows([]);
        setEpisodesByShow({});
        setLoading(false);
        return;
      }

      const safeShows = userShows || [];
      const tvdbIds = safeShows.map((show) => String(show.tvdb_id));

      let episodesLookup = {};

      if (tvdbIds.length > 0) {
        const { data: episodeRows, error: episodesError } = await supabase
          .from("episodes")
          .select("*")
          .in("show_tvdb_id", tvdbIds)
          .order("season_number", { ascending: true })
          .order("episode_number", { ascending: true });

        if (episodesError) {
          console.error("Failed to load episodes:", episodesError);
        } else {
          for (const row of episodeRows || []) {
            const showId = String(row.show_tvdb_id);

            if (!episodesLookup[showId]) {
              episodesLookup[showId] = [];
            }

            episodesLookup[showId].push({
              id: row.id,
              tvdbEpisodeId: row.tvdb_episode_id,
              seasonNumber: row.season_number,
              number: row.episode_number,
              name: row.episode_name,
              aired: row.aired,
              overview: row.overview,
              image: row.image_url,
              episodeCode: row.episode_code,
            });
          }
        }
      }

      setShows(safeShows);
      setEpisodesByShow(episodesLookup);
      setLoading(false);
    }

    loadData();
  }, []);

  const upcomingEpisodes = useMemo(() => {
    const now = new Date();
    const items = [];

    for (const show of shows) {
      const episodes = episodesByShow[String(show.tvdb_id)] || [];

      const futureEpisodes = episodes
        .filter((ep) => {
          if (!ep?.aired) return false;
          const airDate = new Date(ep.aired);
          return !Number.isNaN(airDate.getTime()) && airDate > now;
        })
        .sort((a, b) => new Date(a.aired) - new Date(b.aired));

      if (futureEpisodes.length > 0) {
        const nextEpisode = futureEpisodes[0];
        const daysUntil = getDaysUntil(nextEpisode.aired);

        items.push({
          show,
          episode: nextEpisode,
          daysUntil,
        });
      }
    }

    return items.sort(
      (a, b) => new Date(a.episode.aired) - new Date(b.episode.aired)
    );
  }, [shows, episodesByShow]);

  if (loading) {
    return (
      <div className="airing-page">
        <div className="airing-shell">
          <div className="airing-header">
            <h1>Airing Next</h1>
            <p>Loading upcoming episodes...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="airing-page">
      <div className="airing-shell">
        <div className="airing-header">
          <h1>Airing Next</h1>
          <p>The next upcoming episode for each show in My Shows.</p>
        </div>

        {upcomingEpisodes.length === 0 ? (
          <div className="airing-empty">
            <p>No upcoming episodes found.</p>
          </div>
        ) : (
          <div className="airing-list">
            {upcomingEpisodes.map(({ show, episode, daysUntil }) => (
              <Link
                key={`${show.tvdb_id}-${episode.id}`}
                to={`/my-shows/${show.tvdb_id}?episode=${episode.id}`}
                className="airing-card"
              >
                <img
                  src={show.poster_url}
                  alt={show.show_name}
                  className="airing-poster"
                />

                <div className="airing-main">
                  <h2 className="airing-show-title">{show.show_name}</h2>
                  <div className="airing-episode-code">
                    {getEpisodeCode(episode)}
                  </div>
                  <div className="airing-episode-name">{episode.name}</div>
                  <div className="airing-date">{formatDate(episode.aired)}</div>
                </div>

                <div className="airing-badge-wrap">
                  <div className="airing-badge">
                    {daysUntil === 0
                      ? "TODAY"
                      : daysUntil === 1
                      ? "IN 1 DAY"
                      : `IN ${daysUntil} DAYS`}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
