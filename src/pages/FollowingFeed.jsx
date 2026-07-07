import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { getProfileDisplayName, getProfileHref } from "../lib/profileLinks";
import "./FollowingFeed.css";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "post", label: "Posts" },
  { key: "list", label: "Lists" },
  { key: "review", label: "Reviews" },
  { key: "chatboard", label: "Chatboards" },
];

const FEED_TIMEOUT_MS = 9000;

function withTimeout(promise, fallback, label = "request") {
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => {
      console.warn(`Following feed ${label} timed out.`);
      resolve(fallback);
    }, FEED_TIMEOUT_MS);
  });

  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function formatRating(value) {
  const rating = Number(value);
  if (Number.isNaN(rating)) return "";
  return `${Math.round(rating)}%`;
}

function isMissingTableError(error, tableName) {
  const message = String(error?.message || "").toLowerCase();
  const details = String(error?.details || "").toLowerCase();
  const code = String(error?.code || "").toUpperCase();
  const table = String(tableName || "").toLowerCase();

  return (
    code === "PGRST205" ||
    code === "42P01" ||
    message.includes(table) ||
    details.includes(table) ||
    message.includes("schema cache") ||
    details.includes("schema cache")
  );
}

function getRatingKey(userId, showId) {
  return `${String(userId || "")}:${String(showId || "")}`;
}

function getCreatorName(profile) {
  return getProfileDisplayName(profile, "Someone");
}

function creatorHref(profile, fallbackUserId = null) {
  return getProfileHref(profile, fallbackUserId);
}

function showHref(show) {
  if (!show) return "#";
  if (show.tmdb_id) return `/show/tmdb/${show.tmdb_id}`;
  return `/show/${show.id || show.show_id}`;
}

function formatPostType(value) {
  const labels = {
    post: "Post",
    hot_take: "Hot take",
    recommendation: "Recommendation",
    tonights_pick: "Tonight's pick",
    watchlist_advice: "Watchlist advice",
  };
  return labels[value] || "Post";
}

function isYouTubeEmbed(url) {
  return Boolean(url && url.includes("youtube.com/embed/"));
}

function isTikTokEmbed(url) {
  return Boolean(url && url.includes("tiktok.com/embed"));
}

function VideoEmbed({ post }) {
  const embedUrl = post?.video_embed_url;
  const originalUrl = post?.video_url || embedUrl;

  if (!embedUrl && !originalUrl) return null;

  if (isYouTubeEmbed(embedUrl)) {
    return (
      <div className="following-video following-video-youtube">
        <iframe
          src={embedUrl}
          title={post?.title || "YouTube video"}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
      </div>
    );
  }

  if (isTikTokEmbed(embedUrl)) {
    return (
      <div className="following-video following-video-tiktok">
        <iframe
          src={embedUrl}
          title={post?.title || "TikTok video"}
          allow="encrypted-media; fullscreen; picture-in-picture"
          allowFullScreen
        />
      </div>
    );
  }

  return (
    <a href={originalUrl} target="_blank" rel="noreferrer" className="following-video-link">
      Watch video
    </a>
  );
}

function CreatorLine({ profile, userId, action, createdAt }) {
  const creator = profile || { id: userId };
  const creatorName = getCreatorName(creator);
  const avatarUrl = creator?.avatar_url || "";
  const profileHref = creatorHref(creator, userId);

  return (
    <Link to={profileHref} className="following-creator-line">
      {avatarUrl ? (
        <img src={avatarUrl} alt="" className="following-avatar" />
      ) : (
        <div className="following-avatar following-avatar-fallback">
          {creatorName.slice(0, 1).toUpperCase()}
        </div>
      )}
      <div>
        <strong>{creatorName}</strong>
        <span>{action} · {formatDate(createdAt)}</span>
      </div>
    </Link>
  );
}

async function fetchCreatorLists(followingIds) {
  if (!followingIds.length) return [];

  try {
    const result = await withTimeout(
      supabase
        .from("creator_lists")
        .select("id, user_id, title, description, list_type, visibility, created_at, updated_at")
        .in("user_id", followingIds)
        .eq("visibility", "public")
        .order("created_at", { ascending: false })
        .limit(40),
      { data: [], error: null },
      "creator lists"
    );

    if (result.error) {
      if (isMissingTableError(result.error, "creator_lists")) return [];
      console.warn("Following creator lists fetch error:", result.error);
      return [];
    }

    return result.data || [];
  } catch (error) {
    console.warn("Following creator lists failed:", error);
    return [];
  }
}

async function fetchReviewRatings(reviewRows) {
  const reviews = reviewRows || [];
  const ratingUserIds = Array.from(new Set(reviews.map((review) => review.user_id).filter(Boolean)));
  const ratingShowIds = Array.from(new Set(reviews.map((review) => review.show_id).filter(Boolean)));

  if (!ratingUserIds.length || !ratingShowIds.length) return new Map();

  try {
    const result = await withTimeout(
      supabase
        .from("burgr_ratings")
        .select("user_id, show_id, rating")
        .in("user_id", ratingUserIds)
        .in("show_id", ratingShowIds),
      { data: [], error: null },
      "review ratings"
    );

    if (result.error) {
      if (isMissingTableError(result.error, "burgr_ratings")) return new Map();
      console.warn("Following review ratings fetch error:", result.error);
      return new Map();
    }

    return new Map((result.data || []).map((row) => [getRatingKey(row.user_id, row.show_id), row.rating]));
  } catch (error) {
    console.warn("Following review ratings failed:", error);
    return new Map();
  }
}

export default function FollowingFeed() {
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState("all");
  const [reviews, setReviews] = useState([]);
  const [posts, setPosts] = useState([]);
  const [lists, setLists] = useState([]);
  const [chatMessages, setChatMessages] = useState([]);
  const [error, setError] = useState("");

  const feedItems = useMemo(() => {
    return [
      ...posts.map((post) => ({ type: "post", created_at: post.created_at, data: post })),
      ...lists.map((list) => ({ type: "list", created_at: list.updated_at || list.created_at, data: list })),
      ...reviews.map((review) => ({ type: "review", created_at: review.created_at, data: review })),
      ...chatMessages.map((message) => ({ type: "chatboard", created_at: message.created_at, data: message })),
    ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }, [posts, lists, reviews, chatMessages]);

  const filteredFeedItems = useMemo(() => {
    if (activeFilter === "all") return feedItems;
    return feedItems.filter((item) => item.type === activeFilter);
  }, [activeFilter, feedItems]);

  async function loadFeed() {
    setLoading(true);
    setError("");

    try {
      const authResult = await withTimeout(
        supabase.auth.getUser(),
        { data: { user: null }, error: null },
        "auth"
      );
      const user = authResult?.data?.user || null;

      if (!user?.id) {
        setReviews([]);
        setPosts([]);
        setLists([]);
        setChatMessages([]);
        return;
      }

      const followsResult = await withTimeout(
        supabase
          .from("user_follows")
          .select("following_id")
          .eq("follower_id", user.id),
        { data: [], error: null },
        "follows"
      );

      if (followsResult.error) throw followsResult.error;

      const followingIds = (followsResult.data || [])
        .map((row) => row.following_id)
        .filter(Boolean);

      if (!followingIds.length) {
        setReviews([]);
        setPosts([]);
        setLists([]);
        setChatMessages([]);
        return;
      }

      const [postsResult, listRows, reviewsResult, chatResult] = await Promise.all([
        withTimeout(
          supabase
            .from("creator_posts")
            .select(`
              id,
              user_id,
              title,
              body,
              post_type,
              visibility,
              video_url,
              video_provider,
              video_embed_url,
              image_url,
              created_at,
              updated_at
            `)
            .in("user_id", followingIds)
            .eq("visibility", "public")
            .order("created_at", { ascending: false })
            .limit(40),
          { data: [], error: null },
          "creator posts"
        ),
        fetchCreatorLists(followingIds),
        withTimeout(
          supabase
            .from("show_reviews")
            .select("id, user_id, show_id, body, created_at")
            .in("user_id", followingIds)
            .is("parent_id", null)
            .order("created_at", { ascending: false })
            .limit(40),
          { data: [], error: null },
          "reviews"
        ),
        withTimeout(
          supabase
            .from("show_chat_messages")
            .select("id, show_id, user_id, parent_id, body, created_at, updated_at")
            .in("user_id", followingIds)
            .is("parent_id", null)
            .order("created_at", { ascending: false })
            .limit(40),
          { data: [], error: null },
          "chatboards"
        ),
      ]);

      if (postsResult.error) throw postsResult.error;
      if (reviewsResult.error) throw reviewsResult.error;
      if (chatResult.error) throw chatResult.error;

      const postRows = postsResult.data || [];
      const reviewRows = reviewsResult.data || [];
      const chatRows = chatResult.data || [];
      const allListRows = listRows || [];
      const ratingMap = await fetchReviewRatings(reviewRows);

      const allUserIds = Array.from(
        new Set([
          ...postRows.map((post) => post.user_id),
          ...allListRows.map((list) => list.user_id),
          ...reviewRows.map((review) => review.user_id),
          ...chatRows.map((message) => message.user_id),
        ].filter(Boolean))
      );

      let profileMap = new Map();

      if (allUserIds.length) {
        const profilesResult = await withTimeout(
          supabase
            .from("profiles")
            .select("id, username, full_name, display_name, avatar_url")
            .in("id", allUserIds),
          { data: [], error: null },
          "profiles"
        );

        if (profilesResult.error) throw profilesResult.error;
        profileMap = new Map((profilesResult.data || []).map((profile) => [String(profile.id), profile]));
      }

      const showIds = Array.from(
        new Set([
          ...reviewRows.map((review) => review.show_id),
          ...chatRows.map((message) => message.show_id),
        ].filter(Boolean))
      );

      let showMap = new Map();

      if (showIds.length) {
        const showsResult = await withTimeout(
          supabase
            .from("shows")
            .select("id, name, tmdb_id, first_aired, poster_url, backdrop_url")
            .in("id", showIds),
          { data: [], error: null },
          "shows"
        );

        if (showsResult.error) throw showsResult.error;
        showMap = new Map((showsResult.data || []).map((show) => [String(show.id), show]));
      }

      setPosts(
        postRows.map((post) => ({
          ...post,
          profiles: profileMap.get(String(post.user_id)) || { id: post.user_id },
        }))
      );

      setLists(
        allListRows.map((list) => ({
          ...list,
          profiles: profileMap.get(String(list.user_id)) || { id: list.user_id },
          items: list.items || [],
        }))
      );

      setReviews(
        reviewRows.map((review) => ({
          ...review,
          user_rating: ratingMap.get(getRatingKey(review.user_id, review.show_id)) ?? null,
          profiles: profileMap.get(String(review.user_id)) || { id: review.user_id },
          shows: showMap.get(String(review.show_id)) || null,
        }))
      );

      setChatMessages(
        chatRows.map((message) => ({
          ...message,
          profiles: profileMap.get(String(message.user_id)) || { id: message.user_id },
          shows: showMap.get(String(message.show_id)) || null,
        }))
      );
    } catch (err) {
      console.error("Failed loading following feed:", err);
      setError(err.message || "Failed loading feed.");
      setReviews([]);
      setPosts([]);
      setLists([]);
      setChatMessages([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadFeed();
  }, []);

  const activeFilterLabel = FILTERS.find((filter) => filter.key === activeFilter)?.label || "items";

  return (
    <main className="following-page">
      <div className="following-filter-row" aria-label="Filter following feed">
        {FILTERS.map((filter) => (
          <button
            key={filter.key}
            type="button"
            className={`following-filter-chip${activeFilter === filter.key ? " is-active" : ""}`}
            onClick={() => setActiveFilter(filter.key)}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {error ? <p className="following-error">{error}</p> : null}

      {loading ? (
        <p className="following-muted">Loading feed...</p>
      ) : filteredFeedItems.length ? (
        <section className="following-feed-list">
          {filteredFeedItems.map((item) => {
            if (item.type === "post") {
              const post = item.data;
              const profileHref = creatorHref(post.profiles, post.user_id);

              return (
                <article key={`post-${post.id}`} className="following-card">
                  <CreatorLine
                    profile={post.profiles}
                    userId={post.user_id}
                    action={`posted ${formatPostType(post.post_type).toLowerCase()}`}
                    createdAt={post.created_at}
                  />
                  <VideoEmbed post={post} />
                  {!post.video_embed_url && post.image_url ? (
                    <img src={post.image_url} alt="" className="following-post-image" />
                  ) : null}
                  {post.title ? <h2 className="following-post-title">{post.title}</h2> : null}
                  {post.body ? <p className="following-review-text">{post.body}</p> : null}
                  <Link to={profileHref} className="following-view-profile">
                    View creator page
                  </Link>
                </article>
              );
            }

            if (item.type === "list") {
              const list = item.data;
              const profileHref = creatorHref(list.profiles, list.user_id);
              const previewItems = (list.items || []).slice(0, 5);

              return (
                <article key={`list-${list.id}`} className="following-card">
                  <CreatorLine
                    profile={list.profiles}
                    userId={list.user_id}
                    action="created a list"
                    createdAt={list.updated_at || list.created_at}
                  />
                  <div className="following-list-card">
                    <span className="following-type-pill">List</span>
                    <h2>{list.title || "Untitled list"}</h2>
                    {list.description ? <p>{list.description}</p> : null}
                    {previewItems.length ? (
                      <div className="following-list-preview">
                        {previewItems.map((listItem) => (
                          <Link
                            key={listItem.id || `${list.id}-${listItem.show_id}`}
                            to={showHref(listItem)}
                            className="following-list-preview-item"
                          >
                            <span>#{listItem.rank}</span>
                            {listItem.poster_url ? <img src={listItem.poster_url} alt="" /> : <i>?</i>}
                          </Link>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <Link to={profileHref} className="following-view-profile">
                    View creator page
                  </Link>
                </article>
              );
            }

            if (item.type === "chatboard") {
              const message = item.data;
              const show = message.shows;

              return (
                <article key={`chatboard-${message.id}`} className="following-card">
                  <CreatorLine
                    profile={message.profiles}
                    userId={message.user_id}
                    action={`posted on ${show?.name || "a chatboard"}`}
                    createdAt={message.created_at}
                  />
                  <Link to={showHref(show)} className="following-show-card">
                    {show?.poster_url ? <img src={show.poster_url} alt="" /> : <div className="following-poster-fallback">?</div>}
                    <div>
                      <strong>{show?.name || "Show chatboard"}</strong>
                      {show?.first_aired ? <span>{String(show.first_aired).slice(0, 4)}</span> : null}
                    </div>
                  </Link>
                  <p className="following-review-text">{message.body}</p>
                </article>
              );
            }

            const review = item.data;
            const show = review.shows;
            const ratingLabel = formatRating(review.user_rating);

            return (
              <article key={`review-${review.id}`} className="following-card">
                <CreatorLine
                  profile={review.profiles}
                  userId={review.user_id}
                  action={`reviewed ${show?.name || "a show"}`}
                  createdAt={review.created_at}
                />
                <Link to={showHref(show)} className="following-show-card">
                  {show?.poster_url ? <img src={show.poster_url} alt="" /> : <div className="following-poster-fallback">?</div>}
                  <div>
                    <div className="following-show-title-row">
                      <strong>{show?.name || "Untitled show"}</strong>
                      {ratingLabel ? <span className="following-rating-pill">{ratingLabel}</span> : null}
                    </div>
                    {show?.first_aired ? <span>{String(show.first_aired).slice(0, 4)}</span> : null}
                  </div>
                </Link>
                <p className="following-review-text">{review.body}</p>
              </article>
            );
          })}
        </section>
      ) : feedItems.length ? (
        <section className="following-empty">
          <h2>No {activeFilterLabel.toLowerCase()} yet</h2>
          <p>The creators you follow have not shared this type of activity yet.</p>
        </section>
      ) : (
        <section className="following-empty">
          <h2>No creator activity yet</h2>
          <p>
            Follow creators to build your free feed. Their posts, lists, reviews
            and chatboards will appear here.
          </p>
          <Link to="/search" className="following-empty-btn">
            Find shows and reviewers
          </Link>
        </section>
      )}
    </main>
  );
}
