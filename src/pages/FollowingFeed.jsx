import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import "./FollowingFeed.css";

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

function getCreatorName(profile) {
  return (
    profile?.display_name ||
    profile?.full_name ||
    profile?.username ||
    "Someone"
  );
}

function creatorHref(profile) {
  return profile?.username ? `/u/${profile.username}` : "/";
}

function showHref(show) {
  if (!show) return "#";
  if (show.tmdb_id) return `/show/tmdb/${show.tmdb_id}`;
  return `/show/${show.id}`;
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
    <a
      href={originalUrl}
      target="_blank"
      rel="noreferrer"
      className="following-video-link"
    >
      Watch video
    </a>
  );
}

export default function FollowingFeed() {
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [posts, setPosts] = useState([]);
  const [error, setError] = useState("");

  const feedItems = useMemo(() => {
    return [
      ...posts.map((post) => ({
        type: "post",
        created_at: post.created_at,
        data: post,
      })),
      ...reviews.map((review) => ({
        type: "review",
        created_at: review.created_at,
        data: review,
      })),
    ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }, [posts, reviews]);

  async function loadFeed() {
    setLoading(true);
    setError("");

    try {
      const { data: authData } = await supabase.auth.getUser();
      const user = authData?.user || null;
      setCurrentUser(user);

      if (!user?.id) {
        setReviews([]);
        setPosts([]);
        return;
      }

      const { data: follows, error: followsError } = await supabase
        .from("user_follows")
        .select("following_id")
        .eq("follower_id", user.id);

      if (followsError) throw followsError;

      const followingIds = (follows || [])
        .map((row) => row.following_id)
        .filter(Boolean);

      if (!followingIds.length) {
        setReviews([]);
        setPosts([]);
        return;
      }

      const [
        { data: postRows, error: postsError },
        { data: reviewRows, error: reviewsError },
      ] = await Promise.all([
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

        supabase
          .from("show_reviews")
          .select(`
            id,
            user_id,
            show_id,
            body,
            created_at
          `)
          .in("user_id", followingIds)
          .is("parent_id", null)
          .order("created_at", { ascending: false })
          .limit(40),
      ]);

      if (postsError) throw postsError;
      if (reviewsError) throw reviewsError;

      const allUserIds = Array.from(
        new Set([
          ...(postRows || []).map((post) => post.user_id),
          ...(reviewRows || []).map((review) => review.user_id),
        ].filter(Boolean))
      );

      let profileMap = new Map();

      if (allUserIds.length) {
        const { data: profiles, error: profilesError } = await supabase
          .from("profiles")
          .select("id, username, full_name, display_name, avatar_url")
          .in("id", allUserIds);

        if (profilesError) throw profilesError;

        profileMap = new Map(
          (profiles || []).map((profile) => [String(profile.id), profile])
        );
      }

      const showIds = Array.from(
        new Set((reviewRows || []).map((review) => review.show_id).filter(Boolean))
      );

      let showMap = new Map();

      if (showIds.length) {
        const { data: shows, error: showsError } = await supabase
          .from("shows")
          .select("id, name, tmdb_id, first_aired, poster_url, backdrop_url")
          .in("id", showIds);

        if (showsError) throw showsError;

        showMap = new Map(
          (shows || []).map((show) => [String(show.id), show])
        );
      }

      const postsWithProfiles = (postRows || []).map((post) => ({
        ...post,
        profiles: profileMap.get(String(post.user_id)) || null,
      }));

      const reviewsWithProfilesAndShows = (reviewRows || []).map((review) => ({
        ...review,
        profiles: profileMap.get(String(review.user_id)) || null,
        shows: showMap.get(String(review.show_id)) || null,
      }));

      setPosts(postsWithProfiles);
      setReviews(reviewsWithProfilesAndShows);
    } catch (err) {
      console.error("Failed loading following feed:", err);
      setError(err.message || "Failed loading feed.");
      setReviews([]);
      setPosts([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadFeed();
  }, []);

  return (
    <main className="following-page">
      <header className="following-header">
        <h1>Following</h1>
        <p>Posts, reviews and activity from the creators you follow.</p>
      </header>

      {error ? <p className="following-error">{error}</p> : null}

      {loading ? (
        <p className="following-muted">Loading feed...</p>
      ) : feedItems.length ? (
        <section className="following-feed-list">
          {feedItems.map((item) => {
            if (item.type === "post") {
              const post = item.data;
              const creator = post.profiles;
              const creatorName = getCreatorName(creator);
              const avatarUrl = creator?.avatar_url || "";

              return (
                <article key={`post-${post.id}`} className="following-card">
                  <Link
                    to={creatorHref(creator)}
                    className="following-creator-line"
                  >
                    {avatarUrl ? (
                      <img
                        src={avatarUrl}
                        alt=""
                        className="following-avatar"
                      />
                    ) : (
                      <div className="following-avatar following-avatar-fallback">
                        {creatorName.slice(0, 1).toUpperCase()}
                      </div>
                    )}

                    <div>
                      <strong>{creatorName}</strong>
                      <span>
                        posted {formatPostType(post.post_type).toLowerCase()} ·{" "}
                        {formatDate(post.created_at)}
                      </span>
                    </div>
                  </Link>

                  <VideoEmbed post={post} />

                  {!post.video_embed_url && post.image_url ? (
                    <img
                      src={post.image_url}
                      alt=""
                      className="following-post-image"
                    />
                  ) : null}

                  {post.title ? (
                    <h2 className="following-post-title">{post.title}</h2>
                  ) : null}

                  {post.body ? (
                    <p className="following-review-text">{post.body}</p>
                  ) : null}

                  <Link
                    to={creatorHref(creator)}
                    className="following-view-profile"
                  >
                    View creator page
                  </Link>
                </article>
              );
            }

            const review = item.data;
            const creator = review.profiles;
            const show = review.shows;
            const creatorName = getCreatorName(creator);
            const avatarUrl = creator?.avatar_url || "";

            return (
              <article key={`review-${review.id}`} className="following-card">
                <Link
                  to={creatorHref(creator)}
                  className="following-creator-line"
                >
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="" className="following-avatar" />
                  ) : (
                    <div className="following-avatar following-avatar-fallback">
                      {creatorName.slice(0, 1).toUpperCase()}
                    </div>
                  )}

                  <div>
                    <strong>{creatorName}</strong>
                    <span>
                      reviewed {show?.name || "a show"} ·{" "}
                      {formatDate(review.created_at)}
                    </span>
                  </div>
                </Link>

                <Link to={showHref(show)} className="following-show-card">
                  {show?.poster_url ? (
                    <img src={show.poster_url} alt="" />
                  ) : (
                    <div className="following-poster-fallback">?</div>
                  )}

                  <div>
                    <strong>{show?.name || "Untitled show"}</strong>
                    {show?.first_aired ? (
                      <span>{String(show.first_aired).slice(0, 4)}</span>
                    ) : null}
                  </div>
                </Link>

                <p className="following-review-text">{review.body}</p>
              </article>
            );
          })}
        </section>
      ) : (
        <section className="following-empty">
          <h2>No creator activity yet</h2>
          <p>
            Follow creators to build your free feed. Their posts and reviews
            will appear here.
          </p>
          <Link to="/search" className="following-empty-btn">
            Find shows and reviewers
          </Link>
        </section>
      )}
    </main>
  );
}
