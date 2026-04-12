import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";

const DEFAULT_RATING = 1200;
const K_FACTOR = 32;
const SWIPE_THRESHOLD = 70;

function chunkArray(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function expectedScore(playerRating, opponentRating) {
  return 1 / (1 + 10 ** ((opponentRating - playerRating) / 400));
}

function calculateNextRatings(winnerRating, loserRating) {
  const winnerExpected = expectedScore(winnerRating, loserRating);
  const loserExpected = expectedScore(loserRating, winnerRating);

  return {
    winner: Math.round(winnerRating + K_FACTOR * (1 - winnerExpected)),
    loser: Math.round(loserRating + K_FACTOR * (0 - loserExpected)),
  };
}

function getRandomPair(items, previousPairKey = "") {
  if (items.length < 2) return [];

  const attempts = 30;

  for (let i = 0; i < attempts; i += 1) {
    const firstIndex = Math.floor(Math.random() * items.length);
    let secondIndex = Math.floor(Math.random() * items.length);

    while (secondIndex === firstIndex) {
      secondIndex = Math.floor(Math.random() * items.length);
    }

    const pair = [items[firstIndex], items[secondIndex]];
    const pairKey = [pair[0].show_id, pair[1].show_id].sort().join(":");

    if (pairKey !== previousPairKey) {
      return pair;
    }
  }

  return [items[0], items[1]];
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
        .select("id, show_id, season_number, episode_number")
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

function RankCard({ show, label, onChoose, onTouchStart, onTouchEnd }) {
  return (
    <button
      type="button"
      onClick={onChoose}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      style={{
        width: "100%",
        border: "1px solid var(--border)",
        borderRadius: 24,
        background:
          "linear-gradient(180deg, var(--panel) 0%, var(--bg-elevated) 100%)",
        color: "var(--text)",
        boxShadow: "var(--shadow)",
        overflow: "hidden",
        cursor: "pointer",
        padding: 0,
        textAlign: "left",
      }}
    >
      <div
        style={{
          position: "relative",
          aspectRatio: "2 / 3",
          background: "#111827",
        }}
      >
        {show.poster_url ? (
          <img
            src={show.poster_url}
            alt={show.show_name}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : null}

        <div
          style={{
            position: "absolute",
            top: 14,
            left: 14,
            padding: "8px 12px",
            borderRadius: 999,
            background: "rgba(11, 16, 32, 0.82)",
            border: "1px solid rgba(255,255,255,0.12)",
            fontWeight: 800,
            fontSize: ".85rem",
            backdropFilter: "blur(8px)",
          }}
        >
          {label}
        </div>
      </div>

      <div style={{ padding: 18 }}>
        <div
          style={{
            fontSize: "1.15rem",
            fontWeight: 800,
            lineHeight: 1.2,
            marginBottom: 8,
          }}
        >
          {show.show_name}
        </div>

        <div
          style={{
            color: "var(--text-muted)",
            fontSize: ".95rem",
            marginBottom: 12,
          }}
        >
          {show.watchedMainCount} watched
          {show.totalMainEpisodes > 0
            ? ` • ${show.totalMainEpisodes} total`
            : ""}
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <span
            style={{
              padding: "8px 10px",
              borderRadius: 999,
              background: "rgba(139, 92, 246, 0.14)",
              border: "1px solid rgba(139, 92, 246, 0.28)",
              fontSize: ".82rem",
              fontWeight: 700,
            }}
          >
            Rating {Math.round(show.rank_rating || DEFAULT_RATING)}
          </span>

          <span
            style={{
              padding: "8px 10px",
              borderRadius: 999,
              background: "rgba(255, 255, 255, 0.05)",
              border: "1px solid var(--border)",
              fontSize: ".82rem",
              fontWeight: 700,
            }}
          >
            {show.rank_comparisons || 0} matchups
          </span>
        </div>
      </div>
    </button>
  );
}

export default function Rankd() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [eligibleShows, setEligibleShows] = useState([]);
  const [currentPair, setCurrentPair] = useState([]);
  const [lastPairKey, setLastPairKey] = useState("");
  const [error, setError] = useState("");
  const touchStartX = useRef(null);

  useEffect(() => {
    async function loadRankd() {
      try {
        setLoading(true);
        setError("");

        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError) throw userError;

        if (!user) {
          setEligibleShows([]);
          setCurrentPair([]);
          return;
        }

        const { data: userShows, error: userShowsError } = await supabase
          .from("user_shows_new")
          .select(`
            show_id,
            watch_status,
            shows!inner(
              id,
              tvdb_id,
              name,
              poster_url
            )
          `)
          .eq("user_id", user.id);

        if (userShowsError) throw userShowsError;

        const normalizedShows = (userShows || [])
          .filter(
            (row) =>
              String(row.watch_status || "").toLowerCase() !== "watchlist"
          )
          .filter(
            (row) => String(row.watch_status || "").toLowerCase() !== "archived"
          )
          .map((row) => ({
            show_id: row.show_id,
            tvdb_id: row.shows?.tvdb_id,
            show_name: row.shows?.name || "Unknown title",
            poster_url: row.shows?.poster_url || null,
          }));

        const showIds = normalizedShows
          .map((show) => show.show_id)
          .filter(Boolean);

        if (!showIds.length) {
          setEligibleShows([]);
          setCurrentPair([]);
          return;
        }

        const [watchedRows, allEpisodes, rankingRows] = await Promise.all([
          fetchAllWatchedEpisodeRows(user.id),
          fetchEpisodesForShowIds(showIds),
          supabase
            .from("user_show_rankings")
            .select("show_id, rating, wins, losses, comparisons")
            .eq("user_id", user.id),
        ]);

        if (rankingRows.error) throw rankingRows.error;

        const watchedEpisodeIds = new Set(
          (watchedRows || [])
            .map((row) => row.episode_id)
            .filter(Boolean)
            .map(String)
        );

        const rankingMap = new Map(
          (rankingRows.data || []).map((row) => [String(row.show_id), row])
        );

        const episodesByShowId = {};
        for (const ep of allEpisodes || []) {
          const key = String(ep.show_id);
          if (!episodesByShowId[key]) episodesByShowId[key] = [];
          episodesByShowId[key].push(ep);
        }

        const withProgress = normalizedShows
          .map((show) => {
            const mainEpisodes = (
              episodesByShowId[String(show.show_id)] || []
            ).filter((ep) => Number(ep.season_number ?? 0) !== 0);

            const watchedMainCount = mainEpisodes.filter((ep) =>
              watchedEpisodeIds.has(String(ep.id))
            ).length;

            const ranking = rankingMap.get(String(show.show_id));

            return {
              ...show,
              totalMainEpisodes: mainEpisodes.length,
              watchedMainCount,
              rank_rating: ranking?.rating ?? DEFAULT_RATING,
              rank_wins: ranking?.wins ?? 0,
              rank_losses: ranking?.losses ?? 0,
              rank_comparisons: ranking?.comparisons ?? 0,
            };
          })
          .filter((show) => show.watchedMainCount > 0)
          .sort((a, b) => {
            if (
              (b.rank_rating || DEFAULT_RATING) !==
              (a.rank_rating || DEFAULT_RATING)
            ) {
              return (
                (b.rank_rating || DEFAULT_RATING) -
                (a.rank_rating || DEFAULT_RATING)
              );
            }
            return (b.rank_wins || 0) - (a.rank_wins || 0);
          });

        setEligibleShows(withProgress);

        const firstPair = getRandomPair(withProgress);
        setCurrentPair(firstPair);
        setLastPairKey(
          firstPair.length === 2
            ? [firstPair[0].show_id, firstPair[1].show_id].sort().join(":")
            : ""
        );
      } catch (loadError) {
        console.error("RANKD LOAD FAILED:", loadError);
        setError(loadError.message || "Failed to load Rank'd.");
      } finally {
        setLoading(false);
      }
    }

    loadRankd();
  }, []);

  const leaderboard = useMemo(() => {
    return [...eligibleShows].sort((a, b) => {
      if (
        (b.rank_rating || DEFAULT_RATING) !==
        (a.rank_rating || DEFAULT_RATING)
      ) {
        return (
          (b.rank_rating || DEFAULT_RATING) -
          (a.rank_rating || DEFAULT_RATING)
        );
      }

      if ((b.rank_wins || 0) !== (a.rank_wins || 0)) {
        return (b.rank_wins || 0) - (a.rank_wins || 0);
      }

      return (a.show_name || "").localeCompare(b.show_name || "");
    });
  }, [eligibleShows]);

  async function handleChoice(winnerShowId) {
    if (saving || currentPair.length !== 2) return;

    const [firstShow, secondShow] = currentPair;
    const winner =
      String(firstShow.show_id) === String(winnerShowId)
        ? firstShow
        : secondShow;
    const loser =
      String(firstShow.show_id) === String(winnerShowId)
        ? secondShow
        : firstShow;

    const nextRatings = calculateNextRatings(
      winner.rank_rating || DEFAULT_RATING,
      loser.rank_rating || DEFAULT_RATING
    );

    try {
      setSaving(true);
      setError("");

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) throw userError;
      if (!user) throw new Error("You must be logged in to use Rank'd.");

      const upsertPayload = [
        {
          user_id: user.id,
          show_id: winner.show_id,
          rating: nextRatings.winner,
          wins: (winner.rank_wins || 0) + 1,
          losses: winner.rank_losses || 0,
          comparisons: (winner.rank_comparisons || 0) + 1,
          updated_at: new Date().toISOString(),
        },
        {
          user_id: user.id,
          show_id: loser.show_id,
          rating: nextRatings.loser,
          wins: loser.rank_wins || 0,
          losses: (loser.rank_losses || 0) + 1,
          comparisons: (loser.rank_comparisons || 0) + 1,
          updated_at: new Date().toISOString(),
        },
      ];

      const { error: saveError } = await supabase
        .from("user_show_rankings")
        .upsert(upsertPayload, { onConflict: "user_id,show_id" });

      if (saveError) throw saveError;

      const updatedShows = eligibleShows.map((show) => {
        if (String(show.show_id) === String(winner.show_id)) {
          return {
            ...show,
            rank_rating: nextRatings.winner,
            rank_wins: (show.rank_wins || 0) + 1,
            rank_comparisons: (show.rank_comparisons || 0) + 1,
          };
        }

        if (String(show.show_id) === String(loser.show_id)) {
          return {
            ...show,
            rank_rating: nextRatings.loser,
            rank_losses: (show.rank_losses || 0) + 1,
            rank_comparisons: (show.rank_comparisons || 0) + 1,
          };
        }

        return show;
      });

      setEligibleShows(updatedShows);

      const nextPair = getRandomPair(updatedShows, lastPairKey);
      setCurrentPair(nextPair);
      setLastPairKey(
        nextPair.length === 2
          ? [nextPair[0].show_id, nextPair[1].show_id].sort().join(":")
          : ""
      );
    } catch (saveChoiceError) {
      console.error("RANKD SAVE FAILED:", saveChoiceError);
      setError(saveChoiceError.message || "Failed to save your Rank'd vote.");
    } finally {
      setSaving(false);
    }
  }

  function buildTouchStartHandler() {
    return (event) => {
      touchStartX.current = event.changedTouches?.[0]?.clientX ?? null;
    };
  }

  function buildTouchEndHandler(showId, side) {
    return (event) => {
      const startX = touchStartX.current;
      const endX = event.changedTouches?.[0]?.clientX ?? null;

      if (startX == null || endX == null) return;

      const deltaX = endX - startX;

      if (side === "left" && deltaX <= -SWIPE_THRESHOLD) {
        handleChoice(showId);
      }

      if (side === "right" && deltaX >= SWIPE_THRESHOLD) {
        handleChoice(showId);
      }
    };
  }

  if (loading) {
    return (
      <div className="page">
        <div className="page-shell">
          <div className="page-header">
            <h1>Rank'd</h1>
            <p>Loading your matchups...</p>
          </div>
        </div>
      </div>
    );
  }

  if (eligibleShows.length < 2) {
    return (
      <div className="page">
        <div className="page-shell">
          <div className="page-header">
            <h1>Rank'd</h1>
            <p>
              Swipe your favourite shows against each other to build your
              personal ranking.
            </p>
          </div>

          <div className="section-card" style={{ padding: 24 }}>
            <p style={{ marginTop: 0, color: "var(--text-soft)" }}>
              You need at least 2 shows with watched episodes before Rank'd can
              start.
            </p>
            <p style={{ color: "var(--text-muted)", marginBottom: 18 }}>
              Shows with 0 watched episodes are excluded automatically.
            </p>
            <Link
              to="/my-shows"
              className="top-tab active"
              style={{ display: "inline-flex" }}
            >
              Go to My Shows
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-shell">
        <div className="page-header">
          <h1>Rank'd</h1>
          <p>
            Choose the better show each round. Your ranking updates after every
            pick.
          </p>
        </div>

        {error ? (
          <div
            className="section-card"
            style={{
              padding: 16,
              marginBottom: 18,
              borderColor: "rgba(239,68,68,.35)",
            }}
          >
            <strong style={{ display: "block", marginBottom: 6 }}>
              Something went wrong
            </strong>
            <span style={{ color: "var(--text-muted)" }}>{error}</span>
          </div>
        ) : null}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr)",
            gap: 24,
            alignItems: "start",
          }}
        >
          <div className="section-card" style={{ padding: 20 }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                gap: 18,
                alignItems: "stretch",
              }}
            >
              <RankCard
                show={currentPair[0]}
                label="Swipe left to choose"
                onChoose={() => handleChoice(currentPair[0].show_id)}
                onTouchStart={buildTouchStartHandler()}
                onTouchEnd={buildTouchEndHandler(currentPair[0].show_id, "left")}
              />

              <RankCard
                show={currentPair[1]}
                label="Swipe right to choose"
                onChoose={() => handleChoice(currentPair[1].show_id)}
                onTouchStart={buildTouchStartHandler()}
                onTouchEnd={buildTouchEndHandler(
                  currentPair[1].show_id,
                  "right"
                )}
              />
            </div>

            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 12,
                justifyContent: "center",
                marginTop: 18,
              }}
            >
              <button
                type="button"
                className="msd-btn msd-btn-secondary"
                onClick={() => handleChoice(currentPair[0].show_id)}
                disabled={saving}
              >
                Pick {currentPair[0]?.show_name}
              </button>

              <button
                type="button"
                className="msd-btn msd-btn-secondary"
                onClick={() => handleChoice(currentPair[1].show_id)}
                disabled={saving}
              >
                Pick {currentPair[1]?.show_name}
              </button>
            </div>
          </div>

          <div className="section-card" style={{ padding: 20 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                alignItems: "center",
                marginBottom: 14,
              }}
            >
              <div>
                <h2 style={{ margin: 0, fontSize: "1.2rem" }}>
                  Your current order
                </h2>
                <p style={{ margin: "6px 0 0", color: "var(--text-muted)" }}>
                  Live ranking based on every Rank'd decision.
                </p>
              </div>

              <div
                style={{
                  padding: "8px 12px",
                  borderRadius: 999,
                  background: "rgba(139, 92, 246, 0.12)",
                  border: "1px solid rgba(139, 92, 246, 0.26)",
                  fontWeight: 800,
                  fontSize: ".85rem",
                }}
              >
                {leaderboard.length} shows
              </div>
            </div>

            <div style={{ display: "grid", gap: 12 }}>
              {leaderboard.map((show, index) => (
                <Link
                  key={show.show_id}
                  to={`/my-shows/${show.tvdb_id}`}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "56px 1fr auto",
                    gap: 14,
                    alignItems: "center",
                    padding: 12,
                    borderRadius: 16,
                    textDecoration: "none",
                    color: "inherit",
                    background: "rgba(255,255,255,0.02)",
                    border: "1px solid var(--border)",
                  }}
                >
                  <div
                    style={{
                      width: 56,
                      height: 56,
                      borderRadius: 14,
                      background: "#111827",
                      overflow: "hidden",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: 900,
                    }}
                  >
                    {show.poster_url ? (
                      <img
                        src={show.poster_url}
                        alt={show.show_name}
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                        }}
                      />
                    ) : (
                      <span>#{index + 1}</span>
                    )}
                  </div>

                  <div>
                    <div style={{ fontWeight: 800, marginBottom: 4 }}>
                      #{index + 1} {show.show_name}
                    </div>
                    <div style={{ color: "var(--text-muted)", fontSize: ".92rem" }}>
                      {show.watchedMainCount} watched • {show.rank_wins || 0} wins
                      {" • "}
                      {show.rank_losses || 0} losses
                    </div>
                  </div>

                  <div
                    style={{
                      padding: "8px 10px",
                      borderRadius: 999,
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid var(--border)",
                      fontWeight: 800,
                      fontSize: ".85rem",
                    }}
                  >
                    {Math.round(show.rank_rating || DEFAULT_RATING)}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
