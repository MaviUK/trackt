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

  const [monetization, setMonetization] = useState(null);
  const [subscription, setSubscription] = useState(null);
  const [subscriptionLoading, setSubscriptionLoading] = useState(false);

  const [reviews, setReviews] = useState([]);
  const [posts, setPosts] = useState([]);
  const [lists, setLists] = useState([]);
  const [error, setError] = useState("");

  const isOwnProfile = useMemo(() => {
    if (!currentUser?.id || !profile?.id) return false;
    return String(currentUser.id) === String(profile.id);
  }, [currentUser?.id, profile?.id]);

  const isSubscribed = useMemo(() => {
    if (!subscription) return false;

    const validStatus = ["active", "trialing"].includes(subscription.status);
    const validPeriod =
      !subscription.current_period_end ||
      new Date(subscription.current_period_end) > new Date();

    return validStatus && validPeriod;
  }, [subscription]);

  const canSubscribe = useMemo(() => {
    return Boolean(
      !isOwnProfile &&
        monetization?.subscriptions_enabled &&
        monetization?.stripe_onboarding_complete
    );
  }, [isOwnProfile, monetization]);

  async function loadCreatorLists(profileRow, user) {
    const canViewPrivateLists = Boolean(user?.id && user.id === profileRow.id);

    try {
      let listQuery = supabase
        .from("creator_lists")
        .select("id, user_id, title, description, list_type, visibility, created_at, updated_at")
        .eq("user_id", profileRow.id)
        .order("created_at", { ascending: false })
        .limit(12);

      if (!canViewPrivateLists) {
        listQuery = listQuery.eq("visibility", "public");
      }

      const { data: listRows, error: listError } = await listQuery;

      if (listError) {
        console.warn("Creator lists fetch error:", listError);
        setLists([]);
        return;
      }

      const rows = listRows || [];
      if (!rows.length) {
        setLists([]);
        return;
      }

      const listIds = rows.map((list) => list.id);
      const { data: itemRows, error: itemsError } = await supabase
        .from("creator_list_items")
        .select("id, list_id, rank, show_id, show_name, show_year, poster_url, tmdb_id, note")
        .in("list_id", listIds)
        .order("rank", { ascending: true });

      if (itemsError) {
        console.warn("Creator list items fetch error:", itemsError);
        setLists(rows.map((list) => ({ ...list, items: [] })));
        return;
      }

      const itemsByListId = new Map();
      (itemRows || []).forEach((item) => {
        const key = String(item.list_id);
        const currentItems = itemsByListId.get(key) || [];
        currentItems.push(item);
        itemsByListId.set(key, currentItems);
      });

      setLists(
        rows.map((list) => ({
          ...list,
          items: itemsByListId.get(String(list.id)) || [],
        }))
      );
    } catch (err) {
      console.warn("Failed loading creator lists:", err);
      setLists([]);
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

      const [
        { count: followerCount },
        { data: followingRow },
        { data: monetizationRow, error: monetizationError },
        { data: subscriptionRow, error: subscriptionError },
      ] = await Promise.all([
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

        supabase
          .from("creator_monetization")
          .select("*")
          .eq("user_id", profileRow.id)
          .maybeSingle(),

        user?.id && user.id !== profileRow.id
          ? supabase
              .from("creator_subscriptions")
              .select("*")
              .eq("creator_id", profileRow.id)
              .eq("subscriber_id", user.id)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);

      if (monetizationError) {
        console.error("Monetization fetch error:", monetizationError);
      }

      if (subscriptionError) {
        console.error("Subscription fetch error:", subscriptionError);
      }

      setFollowersCount(followerCount || 0);
      setIsFollowing(Boolean(followingRow));
      setMonetization(monetizationRow || null);
      setSubscription(subscriptionRow || null);

      await loadCreatorLists(profileRow, user);

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
          image_url,
          created_at,
          updated_at
        `)
        .eq("user_id", profileRow.id)
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
      setSubscriptionLoading(false);
    }
  }

  useEffect(() => {
    loadCreatorProfile();
  }, [username]);

  async function handleSubscribe() {
    if (!currentUser?.id) {
      setError("Please sign in to subscribe.");
      return;
    }

    if (!profile?.id || !canSubscribe) return;

    console.log("Subscribe clicked", {
      creatorId: profile.id,
      subscriberId: currentUser.id,
    });

    setError("Stripe checkout is the next step.");
  }

  async function handleDeletePost(postId) {
    if (!currentUser?.id || !profile?.id || !isOwnProfile) return;

    const confirmed = window.confirm("Delete this post?");
    if (!confirmed) return;

    setError("");

    try {
      const { error: deleteError } = await supabase
        .from("creator_posts")
        .delete()
        .eq("id", postId)
        .eq("user_id", currentUser.id);

      if (deleteError) throw deleteError;

      setPosts((currentPosts) =>
        currentPosts.filter((post) => post.id !== postId)
      );
    } catch (err) {
      console.error("Failed deleting creator post:", err);
      setError(err.message || "Could not delete post.");
    }
  }

  async function handleDeleteList(listId) {
    if (!currentUser?.id || !profile?.id || !isOwnProfile) return;

    const confirmed = window.confirm("Delete this list?");
    if (!confirmed) return;

    setError("");

    try {
      const { error: deleteError } = await supabase
        .from("creator_lists")
        .delete()
        .eq("id", listId)
        .eq("user_id", currentUser.id);

      if (deleteError) throw deleteError;

      setLists((currentLists) => currentLists.filter((list) => list.id !== listId));
    } catch (err) {
      console.error("Failed deleting creator list:", err);
      setError(err.message || "Could not delete list.");
    }
  }

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
        const { error: insertError } = await supabase
          .from("user_follows")
          .insert({
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
            <div className="creator-avatar creator-avatar-fallback">
              {getInitial(profile)}
            </div>
          )}

          <h1>{displayName}</h1>
          {handle ? <p className="creator-handle">{handle}</p> : null}
          <p className="creator-tagline">{tagline}</p>

          {profile?.creator_niche ? (
            <p className="creator-niche-pill">{profile.creator_niche}</p>
          ) : null}

          <div className="creator-actions">
            {isOwnProfile ? (
              <>
                <Link to="/profile/edit" className="creator-btn creator-btn-secondary">
                  Edit profile
                </Link>
                <Link to="/creator/lists/new" className="creator-btn creator-btn-primary">
                  Create list
                </Link>
              </>
            ) : (
              <button
                type="button"
                className={`creator-btn ${
                  isFollowing ? "creator-btn-secondary" : "creator-btn-primary"
                }`}
                onClick={toggleFollow}
                disabled={followLoading}
              >
                {followLoading ? "Saving..." : isFollowing ? "Following" : "Follow"}
              </button>
            )}

            {!isOwnProfile ? (
              isSubscribed ? (
                <button
                  type="button"
                  className="creator-btn creator-btn-secondary"
                  disabled
                >
                  Subscribed
                </button>
              ) : canSubscribe ? (
                <button
                  type="button"
                  className="creator-btn creator-btn-primary"
                  onClick={handleSubscribe}
                  disabled={subscriptionLoading}
                >
                  Subscribe £
                  {(monetization.monthly_price_pence / 100).toFixed(2)}/month
                </button>
              ) : (
                <button
                  type="button"
                  className="creator-btn creator-btn-locked"
                  disabled
                >
                  Subscribe soon
                </button>
              )
            ) : null}
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
          <strong>{lists.length}</strong>
          <span>Lists</span>
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
          <h2>Creator lists</h2>
          {isOwnProfile ? (
            <Link to="/creator/lists/new" className="creator-small-link">
              Create list
            </Link>
          ) : null}
        </div>

        {lists.length ? (
          <div className="creator-list-grid">
            {lists.map((list) => {
              const visibleItems = (list.items || []).slice(0, 6);
              const hiddenCount = Math.max(0, (list.items || []).length - visibleItems.length);

              return (
                <article key={list.id} className="creator-list-card">
                  <div className="creator-list-head">
                    <div>
                      <h3>{list.title}</h3>
                      <p>
                        {list.items?.length || 0} show{(list.items?.length || 0) === 1 ? "" : "s"}
                        {list.visibility === "private" ? " • Private draft" : ""}
                      </p>
                    </div>
                    <span>{formatDate(list.created_at)}</span>
                  </div>

                  {list.description ? (
                    <p className="creator-list-description">{list.description}</p>
                  ) : null}

                  {visibleItems.length ? (
                    <div className="creator-list-items">
                      {visibleItems.map((item) => (
                        <Link key={item.id} to={showHref(item)} className="creator-list-item">
                          <span className="creator-rank">#{item.rank}</span>
                          {item.poster_url ? (
                            <img src={item.poster_url} alt="" />
                          ) : (
                            <span className="creator-mini-poster">?</span>
                          )}
                          <span>
                            <strong>{item.show_name}</strong>
                            {item.show_year ? <small>{item.show_year}</small> : null}
                            {item.note ? <em>{item.note}</em> : null}
                          </span>
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <p className="creator-muted">No shows added yet.</p>
                  )}

                  {hiddenCount ? (
                    <p className="creator-list-more">+{hiddenCount} more</p>
                  ) : null}

                  {isOwnProfile ? (
                    <button
                      type="button"
                      className="creator-delete-post-btn"
                      onClick={() => handleDeleteList(list.id)}
                    >
                      Delete list
                    </button>
                  ) : null}
                </article>
              );
            })}
          </div>
        ) : (
          <p className="creator-muted">
            {isOwnProfile
              ? "You have not created any lists yet. Tap Create list to make your first one."
              : "This creator has not shared any lists yet."}
          </p>
        )}
      </section>

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
                  {post.visibility === "subscribers" ? (
                    <span>Subscribers only</span>
                  ) : null}
                </div>

                <VideoEmbed post={post} />

                {!post.video_embed_url && post.image_url ? (
                  <img src={post.image_url} alt="" className="creator-post-image" />
                ) : null}

                {post.title ? <h3>{post.title}</h3> : null}
                {post.body ? <p>{post.body}</p> : null}

                {isOwnProfile ? (
                  <button
                    type="button"
                    className="creator-delete-post-btn"
                    onClick={() => handleDeletePost(post.id)}
                  >
                    Delete post
                  </button>
                ) : null}
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
