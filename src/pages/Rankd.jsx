import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import "./Rankd.css";

const DEFAULT_RATING = 1200;
const K_FACTOR = 32;
const SWIPE_THRESHOLD = 70;

function chunkArray(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
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

function makePairKey(firstId, secondId) {
  return [firstId, secondId].map(String).sort().join(":");
}

function getOrderedPair(firstId, secondId) {
  const [showAId, showBId] = [firstId, secondId].map(String).sort();
  return { showAId, showBId, pairKey: `${showAId}:${showBId}` };
}

function shuffle(items) {
  return [...items].sort(() => Math.random() - 0.5);
}

function getFairPair(items, matchupMap, previousPairKey = "") {
  if (items.length < 2) return [];

  const pairs = [];

  for (let i = 0; i < items.length; i += 1) {
    for (let j = i + 1; j < items.length; j += 1) {
      const pairKey = makePairKey(items[i].show_id, items[j].show_id);
      const stats = matchupMap.get(pairKey);

      pairs.push({
        first: items[i],
        second: items[j],
        pairKey,
        timesMatched: stats?.times_matched ?? 0,
        lastMatchedAt: stats?.updated_at || stats?.created_at || "",
      });
    }
  }

  const usablePairs = pairs.filter((pair) => pair.pairKey !== previousPairKey);
  const pool = usablePairs.length ? usablePairs : pairs;
  const lowestCount = Math.min(...pool.map((pair) => pair.timesMatched));
  const leastUsed = pool.filter((pair) => pair.timesMatched === lowestCount);

  const oldestDate = leastUsed
    .map((pair) => pair.lastMatchedAt)
    .filter(Boolean)
    .sort()[0];

  const oldestLeastUsed = oldestDate
    ? leastUsed.filter((pair) => !pair.lastMatchedAt || pair.lastMatchedAt === oldestDate)
    : leastUsed;

  const chosen = shuffle(oldestLeastUsed)[0] || shuffle(leastUsed)[0] || pool[0];

  return Math.random() > 0.5
    ? [chosen.first, chosen.second]
    : [chosen.second, chosen.first];
}

function getWinCount(stats, showId) {
  if (!stats) return 0;

  return String(stats.show_a_id) === String(showId)
    ? Number(stats.show_a_wins || 0)
    : Number(stats.show_b_wins || 0);
}

function getWinPercent(stats, showId) {
  const total = Number(stats?.times_matched || 0);
  if (!total) return 0;

  const wins = getWinCount(stats, showId);
  return Math.round((wins / total) * 100);
}

async function hydrateComments(rows) {
  const comments = rows || [];
  const userIds = Array.from(
    new Set(comments.map((comment) => comment.user_id).filter(Boolean))
  );

  if (!userIds.length) return comments;

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, username, full_name")
    .in("id", userIds);

  const profileMap = new Map(
    (profiles || []).map((profile) => [String(profile.id), profile])
  );

  return comments.map((comment) => ({
    ...comment,
    profile: profileMap.get(String(comment.user_id)) || null,
  }));
}

function buildCommentTree(comments) {
  const byId = new Map();
  const roots = [];

  comments.forEach((comment) => {
    byId.set(String(comment.id), { ...comment, replies: [] });
  });

  byId.forEach((comment) => {
    if (comment.parent_comment_id && byId.has(String(comment.parent_comment_id))) {
      byId.get(String(comment.parent_comment_id)).replies.push(comment);
    } else {
      roots.push(comment);
    }
  });

  return roots;
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
    done = rows.length < pageSize;
    from += pageSize;
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
      done = rows.length < pageSize;
      from += pageSize;
    }
  }

  return allEpisodes;
}

function RankCard({ show, onChoose, onTouchStart, onTouchEnd }) {
  return (
    <button
      type="button"
      onClick={onChoose}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      className="rankd-poster-button"
      aria-label={`Choose ${show.show_name}`}
      title={show.show_name}
    >
      <div className="rankd-poster-frame">
        {show.poster_url ? (
          <img src={show.poster_url} alt={show.show_name} className="rankd-poster-image" />
        ) : (
          <div className="rankd-poster-placeholder">{show.show_name}</div>
        )}
      </div>

      <strong className="rankd-card-title">{show.show_name}</strong>
    </button>
  );
}

function CommentItem({ comment, currentUserId, onReply }) {
  const author = comment.profile?.username || comment.profile?.full_name || "Rank'd user";

  return (
    <div className="rankd-comment-item">
      <div className="rankd-comment-meta">
        <strong>{author}</strong>
        <span>{new Date(comment.created_at).toLocaleString()}</span>
      </div>

      <p>{comment.body}</p>

      {String(comment.user_id) !== String(currentUserId) ? (
        <button type="button" className="rankd-text-button" onClick={() => onReply(comment)}>
          Reply
        </button>
      ) : null}

      {comment.replies?.length ? (
        <div className="rankd-comment-replies">
          {comment.replies.map((reply) => (
            <CommentItem
              key={reply.id}
              comment={reply}
              currentUserId={currentUserId}
              onReply={onReply}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function Rankd() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [eligibleShows, setEligibleShows] = useState([]);
  const [currentPair, setCurrentPair] = useState([]);
  const [lastPairKey, setLastPairKey] = useState("");
  const [matchupMap, setMatchupMap] = useState(new Map());
  const [matchupStats, setMatchupStats] = useState(null);
  const [comments, setComments] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [commentText, setCommentText] = useState("");
  const [replyTo, setReplyTo] = useState(null);
  const [showComments, setShowComments] = useState(false);
  const [error, setError] = useState("");
  const [userId, setUserId] = useState(null);
  const touchStartX = useRef(null);

  const currentPairKey =
    currentPair.length === 2
      ? makePairKey(currentPair[0].show_id, currentPair[1].show_id)
      : "";

  const commentTree = useMemo(() => buildCommentTree(comments), [comments]);

  async function loadCurrentMatchup(pair) {
    if (!pair?.length || pair.length !== 2) {
      setMatchupStats(null);
      setComments([]);
      return;
    }

    const pairKey = makePairKey(pair[0].show_id, pair[1].show_id);
    const stats = matchupMap.get(pairKey);

    setMatchupStats(stats || null);

    if (!stats?.id) {
      setComments([]);
      return;
    }

    const { data, error: commentsError } = await supabase
      .from("rankd_matchup_comments")
      .select("id, matchup_id, user_id, parent_comment_id, body, created_at")
      .eq("matchup_id", stats.id)
      .order("created_at", { ascending: true });

    if (commentsError) throw commentsError;

    setComments(await hydrateComments(data || []));
  }

  async function loadNotifications(nextUserId) {
    if (!nextUserId) return;

    const { data, error: notificationError } = await supabase
      .from("rankd_notifications")
      .select(`
        id,
        user_id,
        actor_user_id,
        matchup_id,
        comment_id,
        is_read,
        created_at,
        rankd_matchups(id, show_a_id, show_b_id, pair_key),
        rankd_matchup_comments(id, body, created_at)
      `)
      .eq("user_id", nextUserId)
      .order("created_at", { ascending: false })
      .limit(15);

    if (notificationError) throw notificationError;

    setNotifications(data || []);
  }

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

        setUserId(user.id);

        const { data: userShows, error: userShowsError } = await supabase
          .from("user_shows_new")
          .select(`
            show_id,
            watch_status,
            shows!inner(id, tvdb_id, name, poster_url)
          `)
          .eq("user_id", user.id);

        if (userShowsError) throw userShowsError;

        const normalizedShows = (userShows || [])
          .filter((row) => String(row.watch_status || "").toLowerCase() !== "watchlist")
          .map((row) => ({
            show_id: row.show_id,
            tvdb_id: row.shows?.tvdb_id,
            show_name: row.shows?.name || "Unknown title",
            poster_url: row.shows?.poster_url || null,
          }));

        const showIds = normalizedShows.map((show) => show.show_id).filter(Boolean);

        if (!showIds.length) {
          setEligibleShows([]);
          setCurrentPair([]);
          return;
        }

        const [watchedRows, allEpisodes, rankingRows, matchupRows] = await Promise.all([
          fetchAllWatchedEpisodeRows(user.id),
          fetchEpisodesForShowIds(showIds),
          supabase
            .from("user_show_rankings")
            .select("show_id, rating, wins, losses, comparisons")
            .eq("user_id", user.id),
          supabase
            .from("rankd_matchups")
            .select("*")
            .or(showIds.map((id) => `show_a_id.eq.${id},show_b_id.eq.${id}`).join(",")),
        ]);

        if (rankingRows.error) throw rankingRows.error;
        if (matchupRows.error) throw matchupRows.error;

        const watchedEpisodeIds = new Set(
          (watchedRows || [])
            .map((row) => row.episode_id)
            .filter(Boolean)
            .map(String)
        );

        const rankingMap = new Map(
          (rankingRows.data || []).map((row) => [String(row.show_id), row])
        );

        const nextMatchupMap = new Map(
          (matchupRows.data || []).map((row) => [row.pair_key, row])
        );

        setMatchupMap(nextMatchupMap);

        const episodesByShowId = {};

        for (const ep of allEpisodes || []) {
          const key = String(ep.show_id);
          if (!episodesByShowId[key]) episodesByShowId[key] = [];
          episodesByShowId[key].push(ep);
        }

        const withProgress = normalizedShows
          .map((show) => {
            const allShowEpisodes = episodesByShowId[String(show.show_id)] || [];

const mainEpisodes = allShowEpisodes.filter(
  (ep) => Number(ep.season_number ?? 0) !== 0
);

const seasonOneEpisodes = allShowEpisodes.filter(
  (ep) => Number(ep.season_number ?? 0) === 1
);

const watchedMainCount = mainEpisodes.filter((ep) =>
  watchedEpisodeIds.has(String(ep.id))
).length;

const watchedSeasonOneCount = seasonOneEpisodes.filter((ep) =>
  watchedEpisodeIds.has(String(ep.id))
).length;

const hasWatchedWholeFirstSeason =
  seasonOneEpisodes.length > 0 &&
  watchedSeasonOneCount === seasonOneEpisodes.length;

            const ranking = rankingMap.get(String(show.show_id));

            return {
              ...show,
              totalMainEpisodes: mainEpisodes.length,
              watchedMainCount,
              hasWatchedWholeFirstSeason,
              rank_rating: ranking?.rating ?? DEFAULT_RATING,
              rank_wins: ranking?.wins ?? 0,
              rank_losses: ranking?.losses ?? 0,
              rank_comparisons: ranking?.comparisons ?? 0,
            };
          })
          .filter((show) => show.watchedMainCount > 0)
          .sort((a, b) => {
            if ((b.rank_rating || DEFAULT_RATING) !== (a.rank_rating || DEFAULT_RATING)) {
              return (b.rank_rating || DEFAULT_RATING) - (a.rank_rating || DEFAULT_RATING);
            }

            return (b.rank_wins || 0) - (a.rank_wins || 0);
          });

        setEligibleShows(withProgress);

        const firstPair = getFairPair(withProgress, nextMatchupMap);
        setCurrentPair(firstPair);
        setLastPairKey(
          firstPair.length === 2
            ? makePairKey(firstPair[0].show_id, firstPair[1].show_id)
            : ""
        );

        await loadNotifications(user.id);
      } catch (loadError) {
        console.error("RANKD LOAD FAILED:", loadError);
        setError(loadError.message || "Failed to load Rank'd.");
      } finally {
        setLoading(false);
      }
    }

    loadRankd();
  }, []);

  useEffect(() => {
    loadCurrentMatchup(currentPair).catch((matchupError) => {
      console.error("RANKD MATCHUP LOAD FAILED:", matchupError);
      setError(matchupError.message || "Failed to load this matchup.");
    });
  }, [currentPairKey, matchupMap]);

  useEffect(() => {
    const notificationId = searchParams.get("notification");
    if (!notificationId || !notifications.length) return;

    const notification = notifications.find((item) => String(item.id) === String(notificationId));
    if (!notification?.rankd_matchups?.pair_key) return;

    const showIds = notification.rankd_matchups.pair_key.split(":");
    const pair = showIds
      .map((id) => eligibleShows.find((show) => String(show.show_id) === String(id)))
      .filter(Boolean);

    if (pair.length === 2) {
      setCurrentPair(pair);
      setLastPairKey(notification.rankd_matchups.pair_key);
      setShowComments(true);

      supabase
        .from("rankd_notifications")
        .update({ is_read: true })
        .eq("id", notification.id)
        .then(() => loadNotifications(userId));

      setSearchParams({});
    }
  }, [searchParams, notifications, eligibleShows, userId, setSearchParams]);

  const leaderboard = useMemo(() => {
    return [...eligibleShows].sort((a, b) => {
      if ((b.rank_rating || DEFAULT_RATING) !== (a.rank_rating || DEFAULT_RATING)) {
        return (b.rank_rating || DEFAULT_RATING) - (a.rank_rating || DEFAULT_RATING);
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
    const winner = String(firstShow.show_id) === String(winnerShowId) ? firstShow : secondShow;
    const loser = String(firstShow.show_id) === String(winnerShowId) ? secondShow : firstShow;

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

      for (const rankingRow of upsertPayload) {
        const { data: existingRanking, error: findRankingError } = await supabase
          .from("user_show_rankings")
          .select("id")
          .eq("user_id", rankingRow.user_id)
          .eq("show_id", rankingRow.show_id)
          .maybeSingle();

        if (findRankingError) throw findRankingError;

        if (existingRanking?.id) {
          const { error: updateRankingError } = await supabase
            .from("user_show_rankings")
            .update({
              rating: rankingRow.rating,
              wins: rankingRow.wins,
              losses: rankingRow.losses,
              comparisons: rankingRow.comparisons,
              updated_at: rankingRow.updated_at,
            })
            .eq("id", existingRanking.id);

          if (updateRankingError) throw updateRankingError;
        } else {
          const { error: insertRankingError } = await supabase
            .from("user_show_rankings")
            .insert(rankingRow);

          if (insertRankingError) throw insertRankingError;
        }
      }

      const { showAId, showBId } = getOrderedPair(winner.show_id, loser.show_id);

      const { data: recordedMatchup, error: matchupError } = await supabase.rpc(
        "rankd_record_matchup_vote",
        {
          p_show_a_id: showAId,
          p_show_b_id: showBId,
          p_winner_show_id: String(winner.show_id),
          p_loser_show_id: String(loser.show_id),
        }
      );

      if (matchupError) throw matchupError;

      const nextMatchupRow = Array.isArray(recordedMatchup)
        ? recordedMatchup[0]
        : recordedMatchup;

      const updatedMatchupMap = new Map(matchupMap);

      if (nextMatchupRow?.pair_key) {
        updatedMatchupMap.set(nextMatchupRow.pair_key, nextMatchupRow);
      }

      setMatchupMap(updatedMatchupMap);

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

      const nextPair = getFairPair(updatedShows, updatedMatchupMap, lastPairKey);
      setCurrentPair(nextPair);
      setLastPairKey(
        nextPair.length === 2
          ? makePairKey(nextPair[0].show_id, nextPair[1].show_id)
          : ""
      );

      setCommentText("");
      setReplyTo(null);
      setShowComments(false);
    } catch (saveChoiceError) {
      console.error("RANKD SAVE FAILED:", saveChoiceError);
      setError(saveChoiceError.message || "Failed to save your Rank'd vote.");
    } finally {
      setSaving(false);
    }
  }

  async function handleAddComment(event) {
    event.preventDefault();

    const body = commentText.trim();
    if (!body || currentPair.length !== 2) return;

    try {
      setSaving(true);
      setError("");

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) throw userError;
      if (!user) throw new Error("You must be logged in to comment.");

      const { showAId, showBId } = getOrderedPair(
        currentPair[0].show_id,
        currentPair[1].show_id
      );

      const { data, error: commentError } = await supabase.rpc(
        "rankd_add_matchup_comment",
        {
          p_show_a_id: showAId,
          p_show_b_id: showBId,
          p_body: body,
          p_parent_comment_id: replyTo?.id || null,
        }
      );

      if (commentError) throw commentError;

      const nextMatchup = data?.matchup;
      const nextComment = data?.comment;

      if (nextMatchup?.pair_key) {
        const updatedMatchupMap = new Map(matchupMap);
        updatedMatchupMap.set(nextMatchup.pair_key, nextMatchup);
        setMatchupMap(updatedMatchupMap);
        setMatchupStats(nextMatchup);
      }

      if (nextComment) {
        const { data: hydrated } = await supabase
          .from("rankd_matchup_comments")
          .select("id, matchup_id, user_id, parent_comment_id, body, created_at")
          .eq("id", nextComment.id)
          .maybeSingle();

        const hydratedRows = await hydrateComments(hydrated ? [hydrated] : [nextComment]);
        setComments((current) => [...current, hydratedRows[0]]);
      }

      setCommentText("");
      setReplyTo(null);
      setShowComments(true);
      await loadNotifications(user.id);
    } catch (commentError) {
      console.error("RANKD COMMENT FAILED:", commentError);
      setError(commentError.message || "Failed to save your comment.");
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

      if (side === "left" && deltaX <= -SWIPE_THRESHOLD) handleChoice(showId);
      if (side === "right" && deltaX >= SWIPE_THRESHOLD) handleChoice(showId);
    };
  }

  if (loading) {
    return (
      <div className="page rankd-page">
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
      <div className="page rankd-page">
        <div className="page-shell">
          <div className="page-header">
            <h1>Rank'd</h1>
            <p>Swipe your favourite shows against each other to build your personal ranking.</p>
          </div>

          <div className="section-card rankd-empty-card">
            <p>You need at least 2 shows with watched episodes before Rank'd can start.</p>
            <p>Shows with 0 watched episodes are excluded automatically.</p>
            <Link to="/my-shows" className="top-tab active">
              Go to My Shows
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const lastComment = [...comments].sort(
    (a, b) => new Date(b.created_at) - new Date(a.created_at)
  )[0];

  const leftWinPercent = getWinPercent(matchupStats, currentPair[0].show_id);
  const rightWinPercent = getWinPercent(matchupStats, currentPair[1].show_id);
  const leftWins = getWinCount(matchupStats, currentPair[0].show_id);
  const rightWins = getWinCount(matchupStats, currentPair[1].show_id);

  return (
    <div className="page rankd-page">
      <div className="page-shell">
       <div className="rankd-matchup-number">
  Matchup #{Math.floor(
    leaderboard.reduce((total, show) => total + (show.rank_comparisons || 0), 0) / 2
  ) + 1}
</div>

        {error ? (
          <div className="section-card rankd-error-card">
            <strong>Something went wrong</strong>
            <span>{error}</span>
          </div>
        ) : null}

        <div className="rankd-main-grid">
  <div className="section-card rankd-battle-shell">
    <div className="rankd-battle-layout">
  <RankCard
    show={currentPair[0]}
    onChoose={() => handleChoice(currentPair[0].show_id)}
    onTouchStart={buildTouchStartHandler()}
    onTouchEnd={buildTouchEndHandler(currentPair[0].show_id, "left")}
  />

  <div className="rankd-battle-vs">VS</div>

  <RankCard
    show={currentPair[1]}
    onChoose={() => handleChoice(currentPair[1].show_id)}
    onTouchStart={buildTouchStartHandler()}
    onTouchEnd={buildTouchEndHandler(currentPair[1].show_id, "right")}
  />
</div>

<div className="rankd-matchup-dashboard">
  <div className="rankd-win-bars">
    <div className="rankd-win-row">
      <span>{currentPair[0].show_name}</span>
      <div>
        <i style={{ width: `${leftWinPercent}%` }} />
      </div>
      <strong>
        {leftWinPercent}% / {leftWins} wins
      </strong>
    </div>

    <div className="rankd-win-row">
      <span>{currentPair[1].show_name}</span>
      <div>
        <i style={{ width: `${rightWinPercent}%` }} />
      </div>
      <strong>
        {rightWinPercent}% / {rightWins} wins
      </strong>
    </div>
  </div>
</div>

            <form className="rankd-comment-form" onSubmit={handleAddComment}>
              {replyTo ? (
                <div className="rankd-replying-to">
                  Replying to: <strong>{replyTo.body}</strong>
                  <button type="button" onClick={() => setReplyTo(null)}>
                    Cancel
                  </button>
                </div>
              ) : null}

              <div className="rankd-comment-actions">
                <button
                  type="button"
                  className="rankd-outline-button"
                  onClick={() => setShowComments((value) => !value)}
                >
                  {showComments ? "Hide all comments" : `View all comments (${comments.length})`}
                </button>
              </div>

              <textarea
                value={commentText}
                onChange={(event) => setCommentText(event.target.value)}
                placeholder="Write a brief comment about this matchup..."
                rows={3}
              />

              <button type="submit" disabled={saving || !commentText.trim()}>
                {replyTo ? "Post reply" : "Post comment"}
              </button>
            </form>

            {showComments ? (
              <div className="rankd-comments-panel">
                <div className="rankd-comments-header">
                  <h2>Matchup comments</h2>
                  <button
                    type="button"
                    className="rankd-text-button"
                    onClick={() => setShowComments(false)}
                  >
                    Hide
                  </button>
                </div>

                {commentTree.length ? (
                  commentTree.map((comment) => (
                    <CommentItem
                      key={comment.id}
                      comment={comment}
                      currentUserId={userId}
                      onReply={(selected) => {
                        setReplyTo(selected);
                        setCommentText("");
                      }}
                    />
                  ))
                ) : (
                  <p className="rankd-muted">No comments yet. Add the first one.</p>
                )}
              </div>
            ) : null}
          </div>

          <div className="section-card rankd-leaderboard-card">
            <div className="rankd-leaderboard-header">
              <div>
                <h2>Your Top Shows</h2>
                <p>Your personal ranking from Rank'd decisions.</p>
              </div>
              <div>{leaderboard.length} shows</div>
            </div>

            <div className="rankd-leaderboard-list">
              {leaderboard.map((show, index) => (
                <Link
                  key={show.show_id}
                  to={`/my-shows/${show.tvdb_id}`}
                  className="rankd-leaderboard-row"
                >
                  <div className="rankd-leaderboard-poster">
                    {show.poster_url ? (
                      <img src={show.poster_url} alt={show.show_name} />
                    ) : (
                      <span>#{index + 1}</span>
                    )}
                  </div>

                  <div>
                    <div className="rankd-leaderboard-title">
                      #{index + 1} {show.show_name}
                    </div>
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
