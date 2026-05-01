import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import "./Rankd.css";

const DEFAULT_LADDER_POSITION = 999999;
const SWIPE_THRESHOLD = 70;


function sortByLadder(a, b) {
  const aUnrated = (a.rank_comparisons || 0) === 0;
  const bUnrated = (b.rank_comparisons || 0) === 0;

  if (aUnrated && !bUnrated) return 1;
  if (!aUnrated && bUnrated) return -1;

  const aPos = a.ladder_position ?? DEFAULT_LADDER_POSITION;
  const bPos = b.ladder_position ?? DEFAULT_LADDER_POSITION;

  if (aPos !== bPos) return aPos - bPos;
  return (a.show_name || "").localeCompare(b.show_name || "");
}

function applyLadderWin(shows, winnerId, loserId) {
  const ranked = [...shows].sort(sortByLadder);

  const winnerIndex = ranked.findIndex(
    (show) => String(show.show_id) === String(winnerId)
  );

  const loserIndex = ranked.findIndex(
    (show) => String(show.show_id) === String(loserId)
  );

  if (winnerIndex === -1 || loserIndex === -1) return shows;

  if (winnerIndex < loserIndex) {
    return ranked.map((show, index) => ({
      ...show,
      ladder_position: index + 1,
    }));
  }

  const [winner] = ranked.splice(winnerIndex, 1);
  ranked.splice(loserIndex, 0, winner);

  return ranked.map((show, index) => ({
    ...show,
    ladder_position: index + 1,
  }));
}

function isFocusSettled(items, focus) {
  if (!focus) return false;

  const sorted = [...items].sort(sortByLadder);
  const focusIndex = sorted.findIndex(
    (show) => String(show.show_id) === String(focus.showId)
  );

  if (focusIndex === -1) return false;

  const above = sorted[focusIndex - 1];
  const below = sorted[focusIndex + 1];

  const lostToAbove =
    !above || (focus.lostToIds || []).includes(String(above.show_id));

  const beatBelow =
    !below || (focus.beatenIds || []).includes(String(below.show_id));

  return lostToAbove && beatBelow;
}

function getFocusedPair(items, focusShowId, focus = null) {
  const sorted = [...items].sort(sortByLadder);

  const focusIndex = sorted.findIndex(
    (show) => String(show.show_id) === String(focusShowId)
  );

  if (focusIndex === -1) return [];

  const focusShow = sorted[focusIndex];
  const testedIds = new Set((focus?.testedIds || []).map(String));

  const lowerBound = focus?.lowerBound ?? 0;
  const upperBound = focus?.upperBound ?? sorted.length - 1;

  let targetIndex = Math.floor((lowerBound + upperBound) / 2);

  if (targetIndex === focusIndex) {
    targetIndex = focusIndex > lowerBound ? focusIndex - 1 : focusIndex + 1;
  }

  let opponent = sorted[targetIndex];

  if (
    !opponent ||
    String(opponent.show_id) === String(focusShowId) ||
    testedIds.has(String(opponent.show_id))
  ) {
    opponent = sorted.find((show, index) => {
      if (String(show.show_id) === String(focusShowId)) return false;
      if (testedIds.has(String(show.show_id))) return false;
      return index >= lowerBound && index <= upperBound;
    });
  }

  if (!opponent) return [];

  return Math.random() > 0.5
    ? [focusShow, opponent]
    : [opponent, focusShow];
}

function chunkArray(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
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
    <div className="rankd-comment-item" id={`comment-${comment.id}`}>
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
  const [rankFocus, setRankFocus] = useState(null);
  const [lastPairKey, setLastPairKey] = useState("");
  const [matchupMap, setMatchupMap] = useState(new Map());
  const [matchupStats, setMatchupStats] = useState(null);
  const [comments, setComments] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [commentText, setCommentText] = useState("");
  const [replyTo, setReplyTo] = useState(null);
  const [showComments, setShowComments] = useState(false);
  const [pendingCommentId, setPendingCommentId] = useState(null);
  const [error, setError] = useState("");
  const [userId, setUserId] = useState(null);

  const touchStartX = useRef(null);
  const battleRef = useRef(null);

  const currentPairKey =
    currentPair.length === 2
      ? makePairKey(currentPair[0].show_id, currentPair[1].show_id)
      : "";

  const commentTree = useMemo(() => buildCommentTree(comments), [comments]);

  const leaderboard = useMemo(() => {
    return [...eligibleShows].sort(sortByLadder);
  }, [eligibleShows]);

  function scrollToComment(commentId) {
    if (!commentId) return;

    setTimeout(() => {
      const el = document.getElementById(`comment-${commentId}`);
      if (!el) return;

      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("rankd-comment-highlight");

      setTimeout(() => {
        el.classList.remove("rankd-comment-highlight");
      }, 2500);
    }, 500);
  }

  async function loadCurrentMatchup(pair) {
    if (!pair?.length || pair.length !== 2) {
      setMatchupStats(null);
      setComments([]);
      return;
    }

    const pairKey = makePairKey(pair[0].show_id, pair[1].show_id);
    let stats = matchupMap.get(pairKey);

    if (!stats?.id) {
      const { data: fetchedMatchup, error: fetchMatchupError } = await supabase
        .from("rankd_matchups")
        .select("*")
        .eq("pair_key", pairKey)
        .maybeSingle();

      if (fetchMatchupError) throw fetchMatchupError;

      if (fetchedMatchup?.id) {
        stats = fetchedMatchup;

        setMatchupMap((prev) => {
          const next = new Map(prev);
          next.set(fetchedMatchup.pair_key, fetchedMatchup);
          return next;
        });
      }
    }

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
            .select("show_id, ladder_position, wins, losses, comparisons")
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
              ladder_position: ranking?.ladder_position ?? null,
              rank_wins: ranking?.wins ?? 0,
              rank_losses: ranking?.losses ?? 0,
              rank_comparisons: ranking?.comparisons ?? 0,
            };
          })
          .filter((show) => show.hasWatchedWholeFirstSeason)
          .sort(sortByLadder)
          .map((show, index) => ({
            ...show,
            ladder_position: show.ladder_position ?? index + 1,
          }));

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
    async function openNotificationMatchup() {
      const notificationId = searchParams.get("notification");
      if (!notificationId || !notifications.length) return;

      const notification = notifications.find((item) => String(item.id) === String(notificationId));
      if (!notification?.rankd_matchups?.pair_key) return;

      const pairKey = notification.rankd_matchups.pair_key;
      const showIds = pairKey.split(":");

      let pair = showIds
        .map((id) => eligibleShows.find((show) => String(show.show_id) === String(id)))
        .filter(Boolean);

      if (pair.length !== 2) {
        const { data: missingShows, error: missingShowsError } = await supabase
          .from("shows")
          .select("id, tvdb_id, name, poster_url")
          .in("id", showIds);

        if (missingShowsError) {
          console.error("RANKD NOTIFICATION SHOW LOAD FAILED:", missingShowsError);
          return;
        }

        pair = showIds
          .map((id) => {
            const existing = eligibleShows.find((show) => String(show.show_id) === String(id));
            if (existing) return existing;

            const fetched = (missingShows || []).find((show) => String(show.id) === String(id));
            if (!fetched) return null;

            return {
              show_id: fetched.id,
              tvdb_id: fetched.tvdb_id,
              show_name: fetched.name || "Unknown title",
              poster_url: fetched.poster_url || null,
              ladder_position: null,
              rank_wins: 0,
              rank_losses: 0,
              rank_comparisons: 0,
            };
          })
          .filter(Boolean);
      }

      if (pair.length !== 2) return;

      setRankFocus(null);
      setCurrentPair(pair);
      setLastPairKey(pairKey);
      setShowComments(true);
      setPendingCommentId(notification.comment_id || null);

      supabase
        .from("rankd_notifications")
        .update({ is_read: true })
        .eq("id", notification.id)
        .then(() => loadNotifications(userId));

      setSearchParams({}, { replace: true });
    }

    openNotificationMatchup();
  }, [searchParams, notifications, eligibleShows, userId, setSearchParams]);

  useEffect(() => {
    async function openLinkedMatchup() {
      const pairKey = searchParams.get("matchup");
      const commentId = searchParams.get("comment");

      if (!pairKey || !eligibleShows.length) return;

      const showIds = pairKey.split(":");

      let pair = showIds
        .map((id) => eligibleShows.find((show) => String(show.show_id) === String(id)))
        .filter(Boolean);

      if (pair.length !== 2) {
        const { data: missingShows, error: missingShowsError } = await supabase
          .from("shows")
          .select("id, tvdb_id, name, poster_url")
          .in("id", showIds);

        if (missingShowsError) {
          console.error("RANKD LINKED SHOW LOAD FAILED:", missingShowsError);
          return;
        }

        pair = showIds
          .map((id) => {
            const existing = eligibleShows.find((show) => String(show.show_id) === String(id));
            if (existing) return existing;

            const fetched = (missingShows || []).find((show) => String(show.id) === String(id));
            if (!fetched) return null;

            return {
              show_id: fetched.id,
              tvdb_id: fetched.tvdb_id,
              show_name: fetched.name || "Unknown title",
              poster_url: fetched.poster_url || null,
              ladder_position: null,
              rank_wins: 0,
              rank_losses: 0,
              rank_comparisons: 0,
            };
          })
          .filter(Boolean);
      }

      if (pair.length !== 2) return;

      setRankFocus(null);
      setCurrentPair(pair);
      setLastPairKey(pairKey);
      setShowComments(true);
      setPendingCommentId(commentId || null);

      setSearchParams({}, { replace: true });
    }

    openLinkedMatchup();
  }, [searchParams, eligibleShows, setSearchParams]);

  useEffect(() => {
    if (!pendingCommentId || !comments.length) return;

    scrollToComment(pendingCommentId);
    setPendingCommentId(null);
  }, [pendingCommentId, comments]);

function startFocusedRanking(show) {
  window.scrollTo({
    top: 0,
    behavior: "smooth",
  });

  const sorted = [...eligibleShows].sort(sortByLadder);

  const newFocus = {
    showId: show.show_id,
    showName: show.show_name,
    roundsDone: 0,
    testedIds: [],
    lowerBound: 0,
    upperBound: sorted.length - 1,
    lastOpponentId: null,
  };

  const nextPair = getFocusedPair(eligibleShows, show.show_id, newFocus);

  if (nextPair.length !== 2) return;

  setRankFocus(newFocus);
  setCurrentPair(nextPair);
  setLastPairKey(makePairKey(nextPair[0].show_id, nextPair[1].show_id));
  setShowComments(false);
  setCommentText("");
  setReplyTo(null);
}

  async function handleChoice(winnerShowId) {
    if (saving || currentPair.length !== 2) return;

    const [firstShow, secondShow] = currentPair;
    const winner =
      String(firstShow.show_id) === String(winnerShowId) ? firstShow : secondShow;
    const loser =
      String(firstShow.show_id) === String(winnerShowId) ? secondShow : firstShow;

    try {
      setSaving(true);
      setError("");

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) throw userError;
      if (!user) throw new Error("You must be logged in to use Rank'd.");

      const ladderReadyShows = [...eligibleShows]
        .sort(sortByLadder)
        .map((show, index) => ({
          ...show,
          ladder_position: show.ladder_position ?? index + 1,
        }));

      const updatedLadder = applyLadderWin(
        ladderReadyShows,
        winner.show_id,
        loser.show_id
      ).map((show) => {
        if (String(show.show_id) === String(winner.show_id)) {
          return {
            ...show,
            rank_wins: (show.rank_wins || 0) + 1,
            rank_comparisons: (show.rank_comparisons || 0) + 1,
          };
        }

        if (String(show.show_id) === String(loser.show_id)) {
          return {
            ...show,
            rank_losses: (show.rank_losses || 0) + 1,
            rank_comparisons: (show.rank_comparisons || 0) + 1,
          };
        }

        return show;
      });

      let nextRankFocus = rankFocus;

      if (rankFocus) {
        const focusWon = String(winner.show_id) === String(rankFocus.showId);
        const opponent = focusWon ? loser : winner;
        const nextRoundsDone = (rankFocus.roundsDone || 0) + 1;

        const sortedAfterVote = [...updatedLadder].sort(sortByLadder);
const opponentIndex = sortedAfterVote.findIndex(
  (show) => String(show.show_id) === String(opponent.show_id)
);

nextRankFocus = {
  ...rankFocus,
  roundsDone: nextRoundsDone,
  testedIds: [
    ...new Set([...(rankFocus.testedIds || []), String(opponent.show_id)]),
  ],
  lastOpponentId: String(opponent.show_id),

  // If focus won, it belongs above that opponent.
  // If focus lost, it belongs below that opponent.
  lowerBound: focusWon
    ? rankFocus.lowerBound ?? 0
    : Math.max(rankFocus.lowerBound ?? 0, opponentIndex + 1),

  upperBound: focusWon
    ? Math.min(rankFocus.upperBound ?? sortedAfterVote.length - 1, opponentIndex - 1)
    : rankFocus.upperBound ?? sortedAfterVote.length - 1,
};

        if ((nextRankFocus.upperBound - nextRankFocus.lowerBound) <= 1) {
  nextRankFocus = null;
  setRankFocus(null);
} else {
  const nextFocusedPair = getFocusedPair(
    updatedLadder,
    nextRankFocus.showId,
    nextRankFocus
  );

  if (nextFocusedPair.length !== 2) {
    nextRankFocus = null;
    setRankFocus(null);
  } else {
    setRankFocus(nextRankFocus);
  }
}
      }

      const nextPair = nextRankFocus
  ? getFocusedPair(updatedLadder, nextRankFocus.showId, nextRankFocus)
  : getFairPair(updatedLadder, matchupMap, currentPairKey);

      setEligibleShows(updatedLadder);
      setCurrentPair(nextPair);
      setLastPairKey(
        nextPair.length === 2
          ? makePairKey(nextPair[0].show_id, nextPair[1].show_id)
          : ""
      );

      setCommentText("");
      setReplyTo(null);
      setShowComments(false);

      const now = new Date().toISOString();

      const rankingPayload = updatedLadder.map((show) => ({
        user_id: user.id,
        show_id: show.show_id,
        ladder_position: show.ladder_position,
        wins: show.rank_wins || 0,
        losses: show.rank_losses || 0,
        comparisons: show.rank_comparisons || 0,
        updated_at: now,
      }));

      const { error: rankingSaveError } = await supabase
        .from("user_show_rankings")
        .upsert(rankingPayload, {
          onConflict: "user_id,show_id",
        });

      if (rankingSaveError) throw rankingSaveError;

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

      const { showAId, showBId, pairKey } = getOrderedPair(
        currentPair[0].show_id,
        currentPair[1].show_id
      );

      const { error: commentError } = await supabase.rpc(
        "rankd_add_matchup_comment",
        {
          p_show_a_id: showAId,
          p_show_b_id: showBId,
          p_body: body,
          p_parent_comment_id: replyTo?.id || null,
        }
      );

      if (commentError) throw commentError;

      const { data: freshMatchup, error: matchupReloadError } = await supabase
        .from("rankd_matchups")
        .select("*")
        .eq("pair_key", pairKey)
        .maybeSingle();

      if (matchupReloadError) throw matchupReloadError;
      if (!freshMatchup?.id) throw new Error("Comment saved, but matchup could not be reloaded.");

      const updatedMatchupMap = new Map(matchupMap);
      updatedMatchupMap.set(freshMatchup.pair_key, freshMatchup);
      setMatchupMap(updatedMatchupMap);
      setMatchupStats(freshMatchup);

      const { data: freshComments, error: freshCommentsError } = await supabase
        .from("rankd_matchup_comments")
        .select("id, matchup_id, user_id, parent_comment_id, body, created_at")
        .eq("matchup_id", freshMatchup.id)
        .order("created_at", { ascending: true });

      if (freshCommentsError) throw freshCommentsError;

      setComments(await hydrateComments(freshComments || []));
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

  const leftWinPercent = getWinPercent(matchupStats, currentPair[0].show_id);
  const rightWinPercent = getWinPercent(matchupStats, currentPair[1].show_id);
  const leftWins = getWinCount(matchupStats, currentPair[0].show_id);
  const rightWins = getWinCount(matchupStats, currentPair[1].show_id);

  return (
    <div className="page rankd-page">
      <div className="page-shell">
        <div className="rankd-matchup-number">
          {rankFocus ? (
            <>
              Finding place for {rankFocus.showName} — round{" "}
{(rankFocus.roundsDone || 0) + 1}
            </>
          ) : (
            <>
              Matchup #
              {Math.floor(
                leaderboard.reduce(
                  (total, show) => total + (show.rank_comparisons || 0),
                  0
                ) / 2
              ) + 1}
            </>
          )}
        </div>

        {error ? (
          <div className="section-card rankd-error-card">
            <strong>Something went wrong</strong>
            <span>{error}</span>
          </div>
        ) : null}

        <div className="rankd-main-grid">
          <div id="rankd-top" className="section-card rankd-battle-shell" ref={battleRef}>
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
                <p>Your personal ladder from Rank'd decisions.</p>
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

                  <button
                    type="button"
                    className="rankd-rank-button"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      startFocusedRanking(show);
                    }}
                  >
                    Rank
                  </button>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
