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


function commentAuthorName(profile) {
  return profile?.display_name || profile?.full_name || profile?.username || "Viewer";
}

function commentInitial(profile) {
  return commentAuthorName(profile).slice(0, 1).toUpperCase();
}

function buildCommentTree(commentRows) {
  const byId = new Map();
  const topLevel = [];

  (commentRows || []).forEach((comment) => {
    byId.set(String(comment.id), { ...comment, replies: [] });
  });

  byId.forEach((comment) => {
    if (comment.parent_comment_id && byId.has(String(comment.parent_comment_id))) {
      byId.get(String(comment.parent_comment_id)).replies.push(comment);
    } else {
      topLevel.push(comment);
    }
  });

  return topLevel;
}

function CommentCard({
  comment,
  currentUser,
  openReplyId,
  setOpenReplyId,
  replyValue,
  onReplyChange,
  onSubmitReply,
  submittingCommentKey,
  isReply = false,
}) {
  const author = comment.profile;
  const isReplyOpen = openReplyId === comment.id;
  const submitKey = `reply:${comment.id}`;

  return (
    <div className={`creator-comment ${isReply ? "creator-comment-reply" : ""}`}>
      {author?.avatar_url ? (
        <img src={author.avatar_url} alt="" className="creator-comment-avatar" />
      ) : (
        <div className="creator-comment-avatar creator-comment-avatar-fallback">
          {commentInitial(author)}
        </div>
      )}

      <div className="creator-comment-main">
        <div className="creator-comment-bubble">
          <div className="creator-comment-byline">
            <strong>{commentAuthorName(author)}</strong>
            <span>{formatDate(comment.created_at)}</span>
          </div>
          <p>{comment.body}</p>
        </div>

        {currentUser?.id ? (
          <button
            type="button"
            className="creator-reply-toggle"
            onClick={() => setOpenReplyId(isReplyOpen ? null : comment.id)}
          >
            Reply
          </button>
        ) : null}

        {isReplyOpen ? (
          <div className="creator-reply-form">
            <textarea
              value={replyValue}
              onChange={(event) => onReplyChange(event.target.value)}
              placeholder="Write a reply..."
              rows={2}
            />
            <div className="creator-reply-actions">
              <button
                type="button"
                className="creator-reply-cancel"
                onClick={() => setOpenReplyId(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onSubmitReply}
                disabled={!replyValue.trim() || Boolean(submittingCommentKey)}
              >
                {submittingCommentKey === submitKey ? "Replying..." : "Reply"}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
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
  const [commentsByPostId, setCommentsByPostId] = useState({});
  const [commentForms, setCommentForms] = useState({});
  const [replyForms, setReplyForms] = useState({});
  const [openReplyId, setOpenReplyId] = useState(null);
  const [submittingCommentKey, setSubmittingCommentKey] = useState("");
  const [error, setError] = useState("");

  const isOwnProfile = useMemo(() => {
    if (!currentUser?.id || !profile?.id) return false;
    return String(currentUser.id) === String(profile.id);
  }, [currentUser?.id, profile?.id]);

  async function loadPostComments(postIds) {
    if (!postIds.length) {
      setCommentsByPostId({});
      return;
    }

    try {
      const { data: commentRows, error: commentsError } = await supabase
        .from("creator_post_comments")
        .select("id, post_id, parent_comment_id, user_id, body, created_at")
        .in("post_id", postIds)
        .order("created_at", { ascending: true });

      if (commentsError) throw commentsError;

      const profileIds = Array.from(
        new Set((commentRows || []).map((comment) => comment.user_id).filter(Boolean))
      );

      let profileMap = new Map();

      if (profileIds.length) {
        const { data: profileRows, error: profilesError } = await supabase
          .from("profiles")
          .select("id, username, full_name, display_name, avatar_url")
          .in("id", profileIds);

        if (profilesError) throw profilesError;

        profileMap = new Map(
          (profileRows || []).map((profileRow) => [String(profileRow.id), profileRow])
        );
      }

      const groupedFlat = {};

      (commentRows || []).forEach((comment) => {
        const postId = String(comment.post_id);
        if (!groupedFlat[postId]) groupedFlat[postId] = [];
        groupedFlat[postId].push({
          ...comment,
          profile: profileMap.get(String(comment.user_id)) || null,
        });
      });

      const groupedTree = {};
      postIds.forEach((postId) => {
        const key = String(postId);
        groupedTree[key] = buildCommentTree(groupedFlat[key] || []);
      });

      setCommentsByPostId(groupedTree);
    } catch (err) {
      console.error("Failed loading creator post comments:", err);
      setCommentsByPostId({});
    }
  }

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
      const publicPosts = postRows || [];
      setPosts(publicPosts);
      await loadPostComments(publicPosts.map((post) => post.id));

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

  function updateCommentForm(postId, value) {
    setCommentForms((prev) => ({
      ...prev,
      [postId]: value,
    }));
  }

  function updateReplyForm(commentId, value) {
    setReplyForms((prev) => ({
      ...prev,
      [commentId]: value,
    }));
  }

  async function submitPostComment(postId, parentCommentId = null) {
    if (!currentUser?.id) {
      setError("Log in to comment on creator posts.");
      return;
    }

    const key = parentCommentId ? `reply:${parentCommentId}` : `comment:${postId}`;
    const body = parentCommentId ? replyForms[parentCommentId] : commentForms[postId];
    const cleanBody = (body || "").trim();

    if (!cleanBody || submittingCommentKey) return;

    setSubmittingCommentKey(key);
    setError("");

    try {
      const { error: insertError } = await supabase
        .from("creator_post_comments")
        .insert({
          post_id: postId,
          parent_comment_id: parentCommentId,
          user_id: currentUser.id,
          body: cleanBody,
        });

      if (insertError) throw insertError;

      if (parentCommentId) {
        setReplyForms((prev) => ({ ...prev, [parentCommentId]: "" }));
        setOpenReplyId(null);
      } else {
        setCommentForms((prev) => ({ ...prev, [postId]: "" }));
      }

      await loadPostComments(posts.map((post) => post.id));
    } catch (err) {
      console.error("Failed saving creator post comment:", err);
      setError(err.message || "Could not save comment.");
    } finally {
      setSubmittingCommentKey("");
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
            {posts.map((post) => {
              const postComments = commentsByPostId[String(post.id)] || [];
              const commentValue = commentForms[post.id] || "";
              const commentSubmitKey = `comment:${post.id}`;

              return (
                <article key={post.id} className="creator-post-card">
                  <div className="creator-post-meta">
                    <span>{formatPostType(post.post_type)}</span>
                    <span>{formatDate(post.created_at)}</span>
                  </div>

                  {post.title ? <h3>{post.title}</h3> : null}

                  <VideoEmbed post={post} />

                  {post.body ? <p className="creator-post-body">{post.body}</p> : null}

                  <section className="creator-post-comments">
                    <div className="creator-comments-head">
                      <strong>Comments</strong>
                      <span>{postComments.length}</span>
                    </div>

                    {currentUser?.id ? (
                      <div className="creator-comment-form">
                        <textarea
                          value={commentValue}
                          onChange={(event) => updateCommentForm(post.id, event.target.value)}
                          placeholder="Add a comment..."
                          rows={2}
                        />
                        <button
                          type="button"
                          onClick={() => submitPostComment(post.id)}
                          disabled={!commentValue.trim() || Boolean(submittingCommentKey)}
                        >
                          {submittingCommentKey === commentSubmitKey ? "Posting..." : "Post"}
                        </button>
                      </div>
                    ) : (
                      <p className="creator-comment-login">Log in to comment and reply.</p>
                    )}

                    {postComments.length ? (
                      <div className="creator-comments-list">
                        {postComments.map((comment) => (
                          <div key={comment.id} className="creator-comment-thread">
                            <CommentCard
                              comment={comment}
                              currentUser={currentUser}
                              openReplyId={openReplyId}
                              setOpenReplyId={setOpenReplyId}
                              replyValue={replyForms[comment.id] || ""}
                              onReplyChange={(value) => updateReplyForm(comment.id, value)}
                              onSubmitReply={() => submitPostComment(post.id, comment.id)}
                              submittingCommentKey={submittingCommentKey}
                            />

                            {comment.replies?.length ? (
                              <div className="creator-replies-list">
                                {comment.replies.map((reply) => (
                                  <CommentCard
                                    key={reply.id}
                                    comment={reply}
                                    currentUser={currentUser}
                                    openReplyId={openReplyId}
                                    setOpenReplyId={setOpenReplyId}
                                    replyValue={replyForms[reply.id] || ""}
                                    onReplyChange={(value) => updateReplyForm(reply.id, value)}
                                    onSubmitReply={() => submitPostComment(post.id, reply.id)}
                                    submittingCommentKey={submittingCommentKey}
                                    isReply
                                  />
                                ))}
                              </div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="creator-muted creator-no-comments">No comments yet.</p>
                    )}
                  </section>
                </article>
              );
            })}
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
