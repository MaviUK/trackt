import { useParams } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { formatDate, getDaysUntil } from "../lib/date";
import { supabase } from "../lib/supabase";

export default function MyShowDetails() {
  const { id } = useParams();

  const [show, setShow] = useState(null);
  const [episodes, setEpisodes] = useState([]);
  const [openSeasons, setOpenSeasons] = useState({});
  const [watchedEpisodes, setWatchedEpisodes] = useState({});
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [nextEpisode, setNextEpisode] = useState(null);

  useEffect(() => {
    const loadPage = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          setMessage("You need to log in");
          setLoading(false);
          return;
        }

        const { data: matchedShow, error: showError } = await supabase
          .from("user_shows")
          .select("*")
          .eq("user_id", user.id)
          .eq("tvdb_id", String(id))
          .maybeSingle();

        if (showError || !matchedShow) {
          setShow(null);
          setLoading(false);
          return;
        }

        setShow(matchedShow);

        const savedWatched = JSON.parse(
          localStorage.getItem(`watchedEpisodes_${id}`) || "{}"
        );
        setWatchedEpisodes(savedWatched);

        const res = await fetch(`/.netlify/functions/getEpisodes?tvdb_id=${id}`);
        const data = await res.json();
        const episodeList = data || [];

        setEpisodes(episodeList);

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const upcoming = episodeList
          .filter((ep) => (ep.seasonNumber ?? 0) > 0)
          .filter((ep) => ep.airDate || ep.aired)
          .filter((ep) => {
            const d = new Date(ep.airDate || ep.aired);
            d.setHours(0, 0, 0, 0);
            return d >= today;
          })
          .sort(
            (a, b) =>
              new Date(a.airDate || a.aired) -
              new Date(b.airDate || b.aired)
          );

        if (upcoming.length > 0) {
          setNextEpisode(upcoming[0]);
        }
      } catch (error) {
        setMessage("Failed to load show");
      } finally {
        setLoading(false);
      }
    };

    loadPage();
  }, [id]);

  const saveWatchedEpisodes = (updated) => {
    setWatchedEpisodes(updated);
    localStorage.setItem(`watchedEpisodes_${id}`, JSON.stringify(updated));
  };

  const toggleSeason = (season) => {
    setOpenSeasons((prev) => ({
      ...prev,
      [season]: !prev[season],
    }));
  };

  const toggleWatched = (episodeId) => {
    const updated = {
      ...watchedEpisodes,
      [episodeId]: !watchedEpisodes[episodeId],
    };

    if (!updated[episodeId]) {
      delete updated[episodeId];
    }

    saveWatchedEpisodes(updated);
  };

  const markUpToEpisodeWatched = (targetSeason, targetEpisodeNumber) => {
    const updated = { ...watchedEpisodes };

    episodes.forEach((episode) => {
      const seasonNumber = episode.seasonNumber ?? 0;
      const episodeNumber = episode.number ?? 0;

      if (!seasonNumber || seasonNumber === 0) return;

      const isEarlierSeason = seasonNumber < targetSeason;
      const isSameSeasonUpToEpisode =
        seasonNumber === targetSeason && episodeNumber <= targetEpisodeNumber;

      if (isEarlierSeason || isSameSeasonUpToEpisode) {
        updated[episode.id] = true;
      }
    });

    saveWatchedEpisodes(updated);
  };

  const episodesBySeason = useMemo(() => {
    const grouped = {};

    episodes.forEach((episode) => {
      const season = episode.seasonNumber;

      if (!season || season === 0) return;

      if (!grouped[season]) {
        grouped[season] = [];
      }

      grouped[season].push(episode);
    });

    Object.keys(grouped).forEach((season) => {
      grouped[season].sort((a, b) => (a.number ?? 0) - (b.number ?? 0));
    });

    return Object.entries(grouped).sort((a, b) => Number(a[0]) - Number(b[0]));
  }, [episodes]);

  const isSeasonFullyWatched = (seasonEpisodes) => {
    if (!seasonEpisodes.length) return false;
    return seasonEpisodes.every((episode) => watchedEpisodes[episode.id]);
  };

  if (loading) {
    return <div className="page">Loading...</div>;
  }

  if (!show) {
    return <div className="page">Show not found in My Shows</div>;
  }

  return (
    <div className="page">
      <h1>{show.show_name}</h1>

      {show.poster_url && (
        <img
          src={show.poster_url}
          alt={show.show_name}
          width="200"
          style={{ borderRadius: "12px" }}
        />
      )}

      {show.overview && <p>{show.overview}</p>}
      {show.first_aired && <p>First aired: {formatDate(show.first_aired)}</p>}

      {nextEpisode && (
        <p>
          Next episode: {formatDate(nextEpisode.airDate || nextEpisode.aired)} (
          {getDaysUntil(nextEpisode.airDate || nextEpisode.aired)})
        </p>
      )}

      <hr style={{ margin: "24px 0" }} />

      <h2>Episodes</h2>

      {message && <p>{message}</p>}
      {episodesBySeason.length === 0 && <p>No episodes found.</p>}

      {episodesBySeason.map(([season, seasonEpisodes]) => {
        const seasonNumber = Number(season);
        const isOpen = !!openSeasons[season];
        const fullyWatched = isSeasonFullyWatched(seasonEpisodes);

        return (
          <div
            key={season}
            style={{
              marginBottom: "20px",
              borderRadius: "12px",
              padding: "12px",
              background: fullyWatched ? "#dcfce7" : "#f8fafc",
              border: fullyWatched ? "1px solid #86efac" : "1px solid #e5e7eb",
            }}
          >
            <button
              onClick={() => toggleSeason(season)}
              style={{
                width: "100%",
                textAlign: "left",
                background: "transparent",
                border: "none",
                padding: "0",
                fontSize: "20px",
                fontWeight: "700",
                cursor: "pointer",
              }}
            >
              Season {season} {isOpen ? "−" : "+"}
              {fullyWatched ? " ✓" : ""}
            </button>

            {isOpen && (
              <div className="show-list" style={{ marginTop: "12px" }}>
                {seasonEpisodes.map((episode) => {
                  const watched = !!watchedEpisodes[episode.id];

                  return (
                    <div
                      className="show-card"
                      key={episode.id}
                      style={{
                        background: watched ? "#ecfdf5" : "white",
                        border: watched ? "1px solid #86efac" : "1px solid #e5e7eb",
                      }}
                    >
                      <strong>
                        E{episode.number ?? "?"} - {episode.name}
                      </strong>

                      {(episode.airDate || episode.aired) && (
                        <p style={{ margin: "8px 0 0 0" }}>
                          Air date: {formatDate(episode.airDate || episode.aired)}
                        </p>
                      )}

                      {episode.overview && (
                        <p style={{ margin: "8px 0 0 0" }}>
                          {episode.overview.length > 180
                            ? `${episode.overview.slice(0, 180)}...`
                            : episode.overview}
                        </p>
                      )}

                      <div
                        style={{
                          display: "flex",
                          gap: "10px",
                          marginTop: "10px",
                          flexWrap: "wrap",
                        }}
                      >
                        <button onClick={() => toggleWatched(episode.id)}>
                          {watched ? "Watched" : "Mark as Watched"}
                        </button>

                        <button
                          onClick={() =>
                            markUpToEpisodeWatched(
                              seasonNumber,
                              episode.number ?? 0
                            )
                          }
                        >
                          Watch up to here
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
