import { useEffect, useMemo, useRef, useState } from "react";
import {
  Link,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { supabase } from "../lib/supabase";
import "./Rankd.css";
import LoginModal from "../components/LoginModal";

const DEFAULT_LADDER_POSITION = 999999;
const SWIPE_THRESHOLD = 70;
const MAX_COMMENT_DEPTH = 10;
const [showLoginModal, setShowLoginModal] = useState(false);

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

function makePairKey(firstId, secondId) {
  return [firstId, secondId].map(String).sort().join(":");
}

function getOrderedPair(firstId, secondId) {
  const [showAId, showBId] = [firstId, secondId].map(String).sort();
  return { showAId, showBId, pairKey: `${showAId}:${showBId}` };
}

function getFairPair(items, matchupMap, previousPairKey = "") {
  if (items.length < 2) return [];

  function pickPair(allowPreviousPair = false) {
    let bestPair = null;
    let bestTimesMatched = Infinity;
    let bestLastMatchedAt = null;
    let tieCount = 0;

    for (let i = 0; i < items.length; i += 1) {
      for (let j = i + 1; j < items.length; j += 1) {
        const first = items[i];
        const second = items[j];
        const pairKey = makePairKey(first.show_id, second.show_id);

        if (!allowPreviousPair && pairKey === previousPairKey) continue;

        const stats = matchupMap.get(pairKey);
        const timesMatched = stats?.times_matched ?? 0;
        const lastMatchedAt = stats?.updated_at || stats?.created_at || "";

        const isBetter =
          timesMatched < bestTimesMatched ||
          (timesMatched === bestTimesMatched &&
            (!bestLastMatchedAt ||
              !lastMatchedAt ||
              lastMatchedAt < bestLastMatchedAt));

        const isTie =
          timesMatched === bestTimesMatched &&
          (lastMatchedAt || "") === (bestLastMatchedAt || "");

        if (isBetter) {
          bestPair = { first, second, pairKey };
          bestTimesMatched = timesMatched;
          bestLastMatchedAt = lastMatchedAt;
          tieCount = 1;
        } else if (isTie) {
          tieCount += 1;
          if (Math.random() < 1 / tieCount) bestPair = { first, second, pairKey };
        }
      }
    }

    return bestPair;
  }

  const chosen = pickPair(false) || pickPair(true);
  if (!chosen) return [];

  return Math.random() > 0.5
    ? [chosen.first, chosen.second]
    : [chosen.second, chosen.first];
}

function slugify(value) {
  return (
    String(value || "show")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 70) || "matchup"
  );
}

function makeShareSlug(firstName, secondName) {
  const base = `${slugify(firstName)}-vs-${slugify(secondName)}`;
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${base}-${suffix}`;
}

function normalizeShowRow(show, fallbackPosition = null) {
  return {
    show_id: show.id || show.show_id,
    tvdb_id: show.tvdb_id,
    show_name: show.name || show.show_name || "Unknown title",
    poster_url: show.poster_url || null,
    totalMainEpisodes: 1,
    watchedMainCount: 1,
    ladder_position: fallbackPosition,
    rank_wins: 0,
    rank_losses: 0,
    rank_comparisons: 0,
  };
}

async function getOptionalUser() {
  const { data, error } = await supabase.auth.getUser();

  const message = String(error?.message || "").toLowerCase();
  const isMissingSession =
    message.includes("auth session missing") ||
    message.includes("session missing");

  if (error && !isMissingSession) {
    throw error;
  }

  return data?.user || null;
}

async function addSharedShowsAsCompleted(userId, showIds) {
  const uniqueShowIds = Array.from(
    new Set((showIds || []).filter(Boolean).map(String))
  );

  if (!userId || uniqueShowIds.length < 2) return;

  const now = new Date().toISOString();

  const { error: userShowsError } = await supabase.from("user_shows_new").upsert(
    uniqueShowIds.map((showId) => ({
      user_id: userId,
      show_id: showId,
      watch_status: "completed",
      updated_at: now,
    })),
    { onConflict: "user_id,show_id" }
  );

  if (userShowsError) throw userShowsError;

  const { data: episodes, error: episodesError } = await supabase
    .from("episodes")
    .select("id")
    .in("show_id", uniqueShowIds);

  if (episodesError) throw episodesError;

  const watchedPayload = (episodes || []).map((episode) => ({
    user_id: userId,
    episode_id: episode.id,
    watched_at: now,
  }));

  if (!watchedPayload.length) return;

  const { error: watchedError } = await supabase
    .from("watched_episodes")
    .upsert(watchedPayload, { onConflict: "user_id,episode_id" });

  if (watchedError) throw watchedError;
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
    const commentId = String(comment.id);
    const parentId = comment.parent_comment_id
      ? String(comment.parent_comment_id)
      : null;

    if (!parentId || parentId === commentId || !byId.has(parentId)) {
      roots.push(comment);
      return;
    }

    const parent = byId.get(parentId);

    if (!parent.replies.some((reply) => String(reply.id) === commentId)) {
      parent.replies.push(comment);
    }
  });

  return roots;
}

function RankCard({ show, onChoose, onTouchStart, onTouchEnd, disabledLabel }) {
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
          <img
            src={show.poster_url}
            alt={show.show_name}
            className="rankd-poster-image"
          />
        ) : (
          <div className="rankd-poster-placeholder">{show.show_name}</div>
        )}
      </div>

      <strong className="rankd-card-title">{show.show_name}</strong>
      {disabledLabel ? <span className="rankd-muted">{disabledLabel}</span> : null}
    </button>
  );
}

function CommentItem({
  comment,
  currentUserId,
  onReply,
  depth = 0,
  visitedIds = new Set(),
}) {
  const author = comment.profile?.username || comment.profile?.full_name || "Rank'd user";
  const commentId = String(comment.id);

  if (depth > MAX_COMMENT_DEPTH || visitedIds.has(commentId)) return null;

  const nextVisitedIds = new Set(visitedIds);
  nextVisitedIds.add(commentId);

  const safeReplies = (comment.replies || []).filter(
    (reply) => String(reply.id) !== commentId && !nextVisitedIds.has(String(reply.id))
  );

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

      {safeReplies.length ? (
        <div className="rankd-comment-replies">
          {safeReplies.map((reply) => (
            <CommentItem
              key={reply.id}
              comment={reply}
              currentUserId={currentUserId}
              onReply={onReply}
              depth={depth + 1}
              visitedIds={nextVisitedIds}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function Rankd() {
  const { slug: sharedSlug } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
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
  const [shareStatus, setShareStatus] = useState("");
  const [sharedMatchupTitle, setSharedMatchupTitle] = useState("");

  const touchStartX = useRef(null);
  const battleRef = useRef(null);

  const isSharedPage = Boolean(sharedSlug);
  const isLoggedIn = Boolean(userId);

  const currentPairKey =
    currentPair.length === 2
      ? makePairKey(currentPair[0].show_id, currentPair[1].show_id)
      : "";

  const commentTree = useMemo(() => buildCommentTree(comments), [comments]);

  const leaderboard = useMemo(() => {
    return [...eligibleShows].sort(sortByLadder);
  }, [eligibleShows]);

  function loginRedirectPath() {
    return `${location.pathname}${location.search || ""}`;
  }

  function goToLogin() {
  setShowLoginModal(true);
}

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
        setShareStatus("");
        setSharedMatchupTitle("");

        const user = await getOptionalUser();

        setUserId(user?.id || null);

        let sharedMatchup = null;
        let sharedShowIds = [];

        if (sharedSlug) {
          const { data: sharedData, error: sharedError } = await supabase
            .from("rankd_matchups")
            .select(`
              *,
              show_a:show_a_id(id, tvdb_id, name, poster_url),
              show_b:show_b_id(id, tvdb_id, name, poster_url)
            `)
            .eq("share_slug", sharedSlug)
            .eq("is_shareable", true)
            .maybeSingle();

          if (sharedError) throw sharedError;
          if (!sharedData?.id) {
            throw new Error("This shared Rank'd matchup could not be found.");
          }

          sharedMatchup = sharedData;
          sharedShowIds = [sharedData.show_a_id, sharedData.show_b_id];

          setSharedMatchupTitle(
            `${sharedData.show_a?.name || "Show A"} vs ${
              sharedData.show_b?.name || "Show B"
            }`
          );

          if (user?.id) {
            await addSharedShowsAsCompleted(user.id, sharedShowIds);
          }
        }

        if (!user?.id && !sharedMatchup) {
          setEligibleShows([]);
          setCurrentPair([]);
          return;
        }

        const normalizedShowsMap = new Map();

        if (user?.id) {
          const { data: userShows, error: userShowsError } = await supabase
            .from("user_shows_new")
            .select(`
              show_id,
              watch_status,
              shows!inner(id, tvdb_id, name, poster_url)
            `)
            .eq("user_id", user.id);

          if (userShowsError) throw userShowsError;

          (userShows || [])
            .filter((row) => {
              const status = String(row.watch_status || "").toLowerCase();
              return status === "completed" || status === "watching";
            })
            .forEach((row) => {
              normalizedShowsMap.set(String(row.show_id), {
                show_id: row.show_id,
                tvdb_id: row.shows?.tvdb_id,
                show_name: row.shows?.name || "Unknown title",
                poster_url: row.shows?.poster_url || null,
              });
            });
        }

        if (sharedMatchup?.show_a) {
          normalizedShowsMap.set(
            String(sharedMatchup.show_a.id),
            normalizeShowRow(sharedMatchup.show_a)
          );
        }

        if (sharedMatchup?.show_b) {
          normalizedShowsMap.set(
            String(sharedMatchup.show_b.id),
            normalizeShowRow(sharedMatchup.show_b)
          );
        }

        const normalizedShows = Array.from(normalizedShowsMap.values());
        const showIds = normalizedShows.map((show) => show.show_id).filter(Boolean);

        if (showIds.length < 2) {
          setEligibleShows([]);
          setCurrentPair([]);
          return;
        }

        let rankingMap = new Map();

        if (user?.id) {
          const { data: rankingData, error: rankingError } = await supabase
            .from("user_show_rankings")
            .select("show_id, ladder_position, wins, losses, comparisons")
            .eq("user_id", user.id);

          if (rankingError) throw rankingError;

          rankingMap = new Map(
            (rankingData || []).map((row) => [String(row.show_id), row])
          );
        }

        const withProgress = normalizedShows
          .map((show) => {
            const ranking = rankingMap.get(String(show.show_id));

            return {
              ...show,
              totalMainEpisodes: 1,
              watchedMainCount: 1,
              ladder_position: ranking?.ladder_position ?? null,
              rank_wins: ranking?.wins ?? 0,
              rank_losses: ranking?.losses ?? 0,
              rank_comparisons: ranking?.comparisons ?? 0,
            };
          })
          .sort(sortByLadder)
          .map((show, index) => ({
            ...show,
            ladder_position: show.ladder_position ?? index + 1,
          }));

        setMatchupMap(new Map());
        setEligibleShows(withProgress);

        let firstPair = getFairPair(withProgress, new Map());

        if (sharedMatchup) {
          const sharedPair = sharedShowIds
            .map((id) =>
              withProgress.find((show) => String(show.show_id) === String(id))
            )
            .filter(Boolean);

          if (sharedPair.length === 2) {
            firstPair = sharedPair;
            setShowComments(true);
          }
        }

        setCurrentPair(firstPair);
        setLastPairKey(
          firstPair.length === 2
            ? makePairKey(firstPair[0].show_id, firstPair[1].show_id)
            : ""
        );

        if (user?.id) {
          await loadNotifications(user.id);
        } else {
          setNotifications([]);
        }
      } catch (loadError) {
        console.error("RANKD LOAD FAILED:", loadError);
        setError(loadError.message || "Failed to load Rank'd.");
      } finally {
        setLoading(false);
      }
    }

    loadRankd();
  }, [sharedSlug]);

  useEffect(() => {
    loadCurrentMatchup(currentPair).catch((matchupError) => {
      console.error("RANKD MATCHUP LOAD FAILED:", matchupError);
      setError(matchupError.message || "Failed to load this matchup.");
    });
  }, [currentPairKey]);

  useEffect(() => {
    async function openNotificationMatchup() {
      const notificationId = searchParams.get("notification");
      if (!notificationId || !notifications.length) return;

      const notification = notifications.find(
        (item) => String(item.id) === String(notificationId)
      );

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
            const existing = eligibleShows.find(
              (show) => String(show.show_id) === String(id)
            );

            if (existing) return existing;

            const fetched = (missingShows || []).find(
              (show) => String(show.id) === String(id)
            );

            if (!fetched) return null;

            return normalizeShowRow(fetched);
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
            const existing = eligibleShows.find(
              (show) => String(show.show_id) === String(id)
            );

            if (existing) return existing;

            const fetched = (missingShows || []).find(
              (show) => String(show.id) === String(id)
            );

            if (!fetched) return null;

            return normalizeShowRow(fetched);
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
    if (!isLoggedIn) {
      goToLogin();
      return;
    }

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

      const user = await getOptionalUser();

      if (!user?.id) {
        goToLogin();
        return;
      }

      if (isSharedPage) {
        await addSharedShowsAsCompleted(user.id, [winner.show_id, loser.show_id]);
      }

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
      let nextPair = [];

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
          lowerBound: focusWon
            ? rankFocus.lowerBound ?? 0
            : Math.max(rankFocus.lowerBound ?? 0, opponentIndex + 1),
          upperBound: focusWon
            ? Math.min(
                rankFocus.upperBound ?? sortedAfterVote.length - 1,
                opponentIndex - 1
              )
            : rankFocus.upperBound ?? sortedAfterVote.length - 1,
        };

        if (nextRankFocus.upperBound < nextRankFocus.lowerBound) {
          nextRankFocus = null;
          setRankFocus(null);
        } else {
          nextPair = getFocusedPair(updatedLadder, nextRankFocus.showId, nextRankFocus);

          if (nextPair.length !== 2) {
            nextRankFocus = null;
            setRankFocus(null);
          } else {
            setRankFocus(nextRankFocus);
          }
        }
      }

      if (!nextRankFocus) {
        nextPair = isSharedPage
          ? currentPair
          : getFairPair(updatedLadder, matchupMap, currentPairKey);
      }

      setEligibleShows(updatedLadder);
      setCurrentPair(nextPair);
      setLastPairKey(
        nextPair.length === 2
          ? makePairKey(nextPair[0].show_id, nextPair[1].show_id)
          : ""
      );

      setCommentText("");
      setReplyTo(null);

      if (!isSharedPage) {
        setShowComments(false);
      }

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
        setMatchupStats(nextMatchupRow);
      }

      setMatchupMap(updatedMatchupMap);
    } catch (saveChoiceError) {
      console.error("RANKD SAVE FAILED:", saveChoiceError);
      setError(saveChoiceError.message || "Failed to save your Rank'd vote.");
    } finally {
      setSaving(false);
    }
  }

  async function handleShareMatchup() {
    if (currentPair.length !== 2 || saving) return;

    try {
      setSaving(true);
      setShareStatus("");
      setError("");

      const user = await getOptionalUser();

      if (!user?.id) {
        goToLogin();
        return;
      }

      const { showAId, showBId, pairKey } = getOrderedPair(
        currentPair[0].show_id,
        currentPair[1].show_id
      );

      const { data: existing, error: existingError } = await supabase
        .from("rankd_matchups")
        .select("id, share_slug")
        .eq("pair_key", pairKey)
        .maybeSingle();

      if (existingError) throw existingError;

      let slug = existing?.share_slug;

      if (!existing?.id) {
        slug = makeShareSlug(currentPair[0].show_name, currentPair[1].show_name);

        const { error: insertError } = await supabase.from("rankd_matchups").insert({
          show_a_id: showAId,
          show_b_id: showBId,
          pair_key: pairKey,
          share_slug: slug,
          is_shareable: true,
          created_by: user.id,
        });

        if (insertError) throw insertError;
      } else if (!slug) {
        slug = makeShareSlug(currentPair[0].show_name, currentPair[1].show_name);

        const { error: updateError } = await supabase
          .from("rankd_matchups")
          .update({
            share_slug: slug,
            is_shareable: true,
            created_by: user.id,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id);

        if (updateError) throw updateError;
      } else {
        const { error: enableError } = await supabase
          .from("rankd_matchups")
          .update({ is_shareable: true })
          .eq("id", existing.id);

        if (enableError) throw enableError;
      }

      const shareUrl = `${window.location.origin}/rankd/share/${slug}`;

      try {
        await navigator.clipboard.writeText(shareUrl);
        setShareStatus("Share link copied.");
      } catch {
        setShareStatus(shareUrl);
      }
    } catch (shareError) {
      console.error("RANKD SHARE FAILED:", shareError);
      setError(shareError.message || "Failed to create share link.");
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

      const user = await getOptionalUser();

      if (!user?.id) {
        goToLogin();
        return;
      }

      if (isSharedPage) {
        await addSharedShowsAsCompleted(user.id, [
          currentPair[0].show_id,
          currentPair[1].show_id,
        ]);
      }

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
      if (!freshMatchup?.id) {
        throw new Error("Comment saved, but matchup could not be reloaded.");
      }

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

          

          {error ? (
            <div className="section-card rankd-error-card">
              <strong>Something went wrong</strong>
              <span>{error}</span>
            </div>
          ) : null}

          <div className="section-card rankd-empty-card">
            <p>You need at least 2 completed or watching shows before Rank'd can start.</p>
            <p>Watchlist shows are excluded automatically.</p>
            <Link to="/my-shows" className="top-tab active">
              Go to My Shows
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (currentPair.length < 2) {
    return (
      <div className="page rankd-page">
        <div className="page-shell">
          <div className="page-header">
            <h1>Rank'd</h1>
            <p>Preparing your first matchup...</p>
          </div>

          {error ? (
            <div className="section-card rankd-error-card">
              <strong>Something went wrong</strong>
              <span>{error}</span>
            </div>
          ) : null}
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
 {!isSharedPage ? (
  <div className="rankd-matchup-number">
    {rankFocus ? (
      <>
        Finding place for {rankFocus.showName} — round{" "}
        {(rankFocus.roundsDone || 0) + 1}
      </>
    ) : (
      <>
        Matchup #{" "}
        {Math.floor(
          leaderboard.reduce(
            (total, show) => total + (show.rank_comparisons || 0),
            0
          ) / 2
        ) + 1}
      </>
    )}
  </div>
) : null}

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
                disabledLabel={!isLoggedIn && isSharedPage ? "Sign in to vote" : ""}
              />

              <div className="rankd-battle-vs">VS</div>

              <RankCard
                show={currentPair[1]}
                onChoose={() => handleChoice(currentPair[1].show_id)}
                onTouchStart={buildTouchStartHandler()}
                onTouchEnd={buildTouchEndHandler(currentPair[1].show_id, "right")}
                disabledLabel={!isLoggedIn && isSharedPage ? "Sign in to vote" : ""}
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

                <button
                  type="button"
                  className="rankd-outline-button"
                  onClick={handleShareMatchup}
                  disabled={saving}
                >
                  {isLoggedIn ? "Share matchup" : "Sign in to share"}
                </button>
              </div>

              {shareStatus ? <p className="rankd-muted">{shareStatus}</p> : null}

              <textarea
                value={commentText}
                onChange={(event) => setCommentText(event.target.value)}
                placeholder={
                  isLoggedIn
                    ? "Write a brief comment about this matchup..."
                    : "Sign in to comment on this matchup..."
                }
                rows={3}
              />

              <button type="submit" disabled={saving || !commentText.trim()}>
                {!isLoggedIn ? "Sign in to comment" : replyTo ? "Post reply" : "Post comment"}
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
                        if (!isLoggedIn) {
                          goToLogin();
                          return;
                        }

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
                <h2>{isLoggedIn ? "Your Top Shows" : "This Matchup"}</h2>
                <p>
                  {isLoggedIn
                    ? "Your personal ladder from Rank'd decisions."
                    : "Sign in to add these shows and build your personal ladder."}
                </p>
              </div>
              <div>{leaderboard.length} shows</div>
            </div>

            <div className="rankd-leaderboard-list">
              {leaderboard.map((show, index) => (
                <Link
                  key={show.show_id}
                  to={isLoggedIn ? `/my-shows/${show.tvdb_id}` : "#"}
                  className="rankd-leaderboard-row"
                  onClick={(event) => {
                    if (!isLoggedIn) event.preventDefault();
                  }}
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
                    {isLoggedIn ? "Rank" : "Sign in"}
                  </button>
                </Link>
              ))}

              {showLoginModal ? (
  <LoginModal
    onClose={() => {
      setShowLoginModal(false);
      window.location.reload();
    }}
  />
) : null}
              
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
