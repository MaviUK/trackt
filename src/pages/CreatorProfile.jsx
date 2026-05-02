import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import "./CreatorProfile.css";

function getName(profile) {
  return (
    profile?.display_name ||
    profile?.full_name ||
    profile?.username ||
    "Creator"
  );
}

function getInitial(profile) {
  return getName(profile).slice(0, 1).toUpperCase();
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
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
      <div className="creator-video creator-video-youtube">
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
      <div className="creator-video creator-video-tiktok">
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
      className="creator-video-link"
    >
      Watch video
    </a>
  );
}

export default function CreatorProfile() {
  const { username } = useParams();

  const [currentUser, setCurrentUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [followLoading, setFollowLoading] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followersCount, setFollowersCount] = useState(0);
  const [reviews, setReviews] = useState([]);
  const [posts, setPosts] = useState([]);
  const [error, setError] = useState("");

  const isOwnProfile = useMemo(() => {
    if (!currentUser?.id || !profile?.id) return false;
    return String(currentUser.id) === String(profile.id);
  }, [currentUser?.id, profile?.id]);

  async function loadCreatorProfile() {
    setLoading(true);
    setError("");

    try {
      const { data: authData } = await supabase.auth.getUser();
      const user = authData?.user || null;
      setCurrentUser(user);

      const cleanUsername = decodeURIComponent(username || "").replace(/^@/, "");

      const { data: profileRow, error: profileError } = await supabase
        .from("profiles")
        .select(`
          id,
          username,
          full_name,
          display_name,
          avatar_url,
          cover_url,
          bio,
          creator_tagline,
          creator_niche,
          creator_bio
        `)
        .eq("username", cleanUsername)
        .maybeSingle();

      if (profileError) throw profileError;
      if (!profileRow) {
        setProfile(null);
        setError("Creator profile not found.");
        return;
      }

      setProfile(profileRow);

      const [{ count: followerCount }, { data: followingRow }] = await Promise.all([
        supabase
          .from("user_follows")
          .select("follower_id", { count: "exact", head: true })
          .eq("following_id", profileRow.id),
        user?.id
          ? supabase
              .from("user_follows")
              .select("follower_id")
              .eq("follower_id", user.id)
              .eq("following_id", profileRow.id)
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ]);

      setFollowersCount(followerCount || 0);
      setIsFollowing(Boolean(followingRow));

      const { data: postRows, error: postsError } = await supabase
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
          created_at,
          updated_at
        `)
        .eq("user_id", profileRow.id)
        .eq("visibility", "public")
        .order("created_at", { ascending: false })
        .limit(40);

      if (postsError) throw postsError;
      setPosts(postRows || []);

      const { data: reviewRows, error: reviewsError } = await supabase
        .from("show_reviews")
        .select(`
          id,
          show_id,
          body,
          created_at,
          shows:show_id (
            id,
            name,
            first_aired,
            tmdb_id,
            poster_url,
            backdrop_url
          )
        `)
        .eq("user_id", profileRow.id)
        .is("parent_id", null)
        .order("created_at", { ascending: false })
        .limit(20);

      if (reviewsError) throw reviewsError;
      setReviews(reviewRows || []);
    } catch (err) {
      console.error("Failed loading creator profile:", err);
      setError(err.message || "Failed loading creator profile.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCreatorProfile();
  }, [username]);

  async function toggleFollow() {
    if (!currentUser?.id || !profile?.id || isOwnProfile || followLoading) return;

    setFollowLoading(true);
    setError("");

    try {
      if (isFollowing) {
        const { error: deleteError } = await supabase
          .from("user_follows")
          .delete()
          .eq("follower_id", currentUser.id)
          .eq("following_id", profile.id);

        if (deleteError) throw deleteError;
        setIsFollowing(false);
        setFollowersCount((count) => Math.max(0, count - 1));
      } else {
        const { error: insertError } = await supabase.from("user_follows").insert({
          follower_id: currentUser.id,
          following_id: profile.id,
        });

        if (insertError) throw insertError;
        setIsFollowing(true);
        setFollowersCount((count) => count + 1);
      }
    } catch (err) {
      console.error("Failed updating follow:", err);
      setError(err.message || "Could not update follow.");
    } finally {
      setFollowLoading(false);
    }
  }

  if (loading) {
    return (
      <main className="creator-page">
        <p className="creator-muted">Loading creator...</p>
      </main>
    );
  }

  if (error && !profile) {
    return (
      <main className="creator-page">
        <p className="creator-error">{error}</p>
      </main>
    );
  }

  const displayName = getName(profile);
  const handle = profile?.username ? `@${profile.username}` : "";
  const avatarUrl = profile?.avatar_url || "";
  const coverUrl = profile?.cover_url || "";
  const tagline =
    profile?.creator_tagline ||
    profile?.creator_niche ||
    profile?.bio ||
    "Follow my TV reviews, posts and recommendations.";
  const creatorBio = profile?.creator_bio || profile?.bio || "";

  return (
    <main className="creator-page">
      <section className="creator-hero">
        <div
          className="creator-cover"
          style={coverUrl ? { backgroundImage: `url(${coverUrl})` } : undefined}
        />

        <div className="creator-hero-content">
          {avatarUrl ? (
            <img src={avatarUrl} alt={displayName} className="creator-avatar" />
          ) : (
            <div className="creator-avatar creator-avatar-fallback">{getInitial(profile)}</div>
          )}

          <h1>{displayName}</h1>
          {handle ? <p className="creator-handle">{handle}</p> : null}
          <p className="creator-tagline">{tagline}</p>
          {profile?.creator_niche ? (
            <p className="creator-niche-pill">{profile.creator_niche}</p>
          ) : null}

          <div className="creator-actions">
            {isOwnProfile ? (
              <Link to="/profile/edit" className="creator-btn creator-btn-secondary">
                Edit profile
              </Link>
            ) : (
              <button
                type="button"
                className={`creator-btn ${isFollowing ? "creator-btn-secondary" : "creator-btn-primary"}`}
                onClick={toggleFollow}
                disabled={followLoading}
              >
                {followLoading ? "Saving..." : isFollowing ? "Following" : "Follow"}
              </button>
            )}

            <button type="button" className="creator-btn creator-btn-locked" disabled>
              Subscribe soon
            </button>
          </div>
        </div>
      </section>

      {error ? <p className="creator-error">{error}</p> : null}

      <section className="creator-stats-card">
        <div>
          <strong>{followersCount}</strong>
          <span>Followers</span>
        </div>
        <div>
          <strong>{posts.length}</strong>
          <span>Posts</span>
        </div>
        <div>
          <strong>{reviews.length}</strong>
          <span>Reviews</span>
        </div>
      </section>

      {creatorBio ? (
        <section className="creator-card">
          <div className="creator-section-head">
            <h2>About</h2>
          </div>
          <p className="creator-copy">{creatorBio}</p>
        </section>
      ) : null}

      <section className="creator-card">
        <div className="creator-section-head">
          <h2>Creator feed</h2>
          {isOwnProfile ? (
            <Link to="/profile/edit" className="creator-small-link">
              Create post
            </Link>
          ) : null}
        </div>

        {posts.length ? (
          <div className="creator-post-list">
            {posts.map((post) => (
              <article key={post.id} className="creator-post-card">
                <div className="creator-post-meta">
                  <span>{formatPostType(post.post_type)}</span>
                  <span>{formatDate(post.created_at)}</span>
                </div>

                {post.title ? <h3>{post.title}</h3> : null}
                <p>{post.body}</p>

                <VideoEmbed post={post} />
              </article>
            ))}
          </div>
        ) : (
          <p className="creator-muted">
            {isOwnProfile
              ? "You have not posted yet. Tap Create post to share your first update."
              : "This creator has not posted yet."}
          </p>
        )}
      </section>

      <section className="creator-card">
        <div className="creator-section-head">
          <h2>Latest reviews</h2>
        </div>

        {reviews.length ? (
          <div className="creator-feed-list">
            {reviews.map((review) => (
              <article key={review.id} className="creator-review-card">
                <Link to={showHref(review.shows)} className="creator-review-show">
                  {review.shows?.poster_url ? (
                    <img src={review.shows.poster_url} alt="" />
                  ) : (
                    <div className="creator-review-poster">?</div>
                  )}
                  <div>
                    <strong>{review.shows?.name || "Show review"}</strong>
                    <span>{formatDate(review.created_at)}</span>
                  </div>
                </Link>
                <p>{review.body}</p>
              </article>
            ))}
          </div>
        ) : (
          <p className="creator-muted">No public reviews yet.</p>
        )}
      </section>
    </main>
  );
}
