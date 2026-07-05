import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import "./CreatorProfile.css";
import "./CreatorListCards.css";
import "./CreatorProfileStats.css";

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

function getShowYear(show) {
  return String(show?.first_aired || show?.show_year || "").slice(0, 4);
}

function getPosterItems(items, limit = 8) {
  return (items || [])
    .filter((item) => item?.poster_url)
    .slice(0, limit);
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

function CreatorListCard({
  listId,
  title,
  subtitle,
  badge,
  description,
  items = [],
  isExpanded,
  onToggle,
  canDelete = false,
  onDelete,
  className = "",
}) {
  const posterItems = getPosterItems(items);

  return (
    <article
      className={`creator-list-card creator-list-card-collapsed ${
        isExpanded ? "is-expanded" : ""
      } ${className}`.trim()}
    >
      <button
        type="button"
        className="creator-list-cover-button"
        onClick={() => onToggle(listId)}
        aria-expanded={isExpanded}
      >
        <div className="creator-list-cover-art" aria-hidden="true">
          {posterItems.length ? (
            <div className="creator-list-poster-collage">
              {posterItems.map((item, index) => (
                <img
                  key={`${listId}-poster-${item.show_id || item.id || index}`}
                  src={item.poster_url}
                  alt=""
                  loading="lazy"
                  className={`creator-list-collage-poster creator-list-collage-poster-${index + 1}`}
                />
              ))}
            </div>
          ) : (
            <div className="creator-list-poster-collage creator-list-poster-collage-empty">
              <span>TV</span>
            </div>
          )}
          <div className="creator-list-cover-shade" />
        </div>

        <div className="creator-list-cover-content">
          <div className="creator-list-cover-topline">
            <span>{badge}</span>
            <span>{isExpanded ? "Tap to close" : "Tap to expand"}</span>
          </div>

          <div>
            <h3>{title}</h3>
            <p>{subtitle}</p>
          </div>
        </div>
      </button>

      {isExpanded ? (
        <div className="creator-list-expanded-body">
          {description ? (
            <p className="creator-list-description">{description}</p>
          ) : null}

          {items.length ? (
            <div className="creator-list-items">
              {items.map((item) => (
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
        </div>
      ) : null}

      {canDelete ? (
        <button
          type="button"
          className="creator-delete-post-btn"
          onClick={() => onDelete(listId)}
        >
          Delete list
        </button>
      ) : null}
    </article>
  );
}

export default function CreatorProfile() {
  const { username } = useParams();

  const listsSectionRef = useRef(null);
  const postsSectionRef = useRef(null);
  const reviewsSectionRef = useRef(null);
  const followersSectionRef = useRef(null);

  const [currentUser, setCurrentUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  const [followLoading, setFollowLoading] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followersCount, setFollowersCount] = useState(0);
  const [followers, setFollowers] = useState([]);
  const [showFollowers, setShowFollowers] = useState(false);

  const [monetization, setMonetization] = useState(null);
  const [subscription, setSubscription] = useState(null);
  const [subscriptionLoading, setSubscriptionLoading] = useState(false);

  const [reviews, setReviews] = useState([]);
  const [posts, setPosts] = useState([]);
  const [lists, setLists] = useState([]);
  const [rankedTopShows, setRankedTopShows] = useState([]);
  const [expandedListIds, setExpandedListIds] = useState(() => new Set());
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

  function scrollToSection(ref) {
    window.requestAnimationFrame(() => {
      ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function handleStatClick(sectionName) {
    if (sectionName === "followers") {
      setShowFollowers((current) => !current);
      setTimeout(() => scrollToSection(followersSectionRef), 0);
      return;
    }

    if (sectionName === "lists") {
      scrollToSection(listsSectionRef);
      return;
    }

    if (sectionName === "posts") {
      scrollToSection(postsSectionRef);
      return;
    }

    if (sectionName === "reviews") {
      scrollToSection(reviewsSectionRef);
    }
  }

  function toggleListExpanded(listId) {
    setExpandedListIds((current) => {
      const next = new Set(current);
      if (next.has(listId)) {
        next.delete(listId);
      } else {
        next.add(listId);
      }
      return next;
    });
  }

  async function loadRankedTopShows(profileRow) {
    try {
      const { data: rankingRows, error: rankingError } = await supabase
        .from("user_show_rankings")
        .select("show_id, ladder_position, wins, losses, comparisons, updated_at")
        .eq("user_id", profileRow.id)
        .not("ladder_position", "is", null)
        .order("ladder_position", { ascending: true })
        .limit(10);

      if (rankingError) {
        console.warn("Creator automatic ranking list fetch error:", rankingError);
        setRankedTopShows([]);
        return;
      }

      const rows = rankingRows || [];
      const showIds = rows.map((row) => row.show_id).filter(Boolean);

      if (!showIds.length) {
        setRankedTopShows([]);
        return;
      }

      const { data: showRows, error: showsError } = await supabase
        .from("shows")
        .select("id, name, first_aired, poster_url, tmdb_id")
        .in("id", showIds);

      if (showsError) {
        console.warn("Creator automatic ranking list show fetch error:", showsError);
        setRankedTopShows([]);
        return;
      }

      const showMap = new Map(
        (showRows || []).map((show) => [String(show.id), show])
      );

      setRankedTopShows(
        rows
          .map((row, index) => {
            const show = showMap.get(String(row.show_id));
            if (!show) return null;

            return {
              id: `ranked-${row.show_id}`,
              show_id: row.show_id,
              rank: index + 1,
              show_name: show.name || "Untitled show",
              show_year: getShowYear(show),
              poster_url: show.poster_url || "",
              tmdb_id: show.tmdb_id || "",
              wins: Number(row.wins || 0),
              losses: Number(row.losses || 0),
              comparisons: Number(row.comparisons || 0),
              note: row.comparisons
                ? `${Number(row.comparisons || 0)} Rank'd comparison${Number(row.comparisons || 0) === 1 ? "" : "s"}`
                : "From Rank'd",
            };
          })
          .filter(Boolean)
      );
    } catch (err) {
      console.warn("Failed loading automatic creator ranking list:", err);
      setRankedTopShows([]);
    }
  }

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

  async function loadFollowers(profileRow) {
    try {
      const { data: followRows, error: followError } = await supabase
        .from("user_follows")
        .select("follower_id, created_at")
        .eq("following_id", profileRow.id)
        .order("created_at", { ascending: false })
        .limit(50);

      if (followError) throw followError;

      const followerIds = (followRows || [])
        .map((row) => row.follower_id)
        .filter(Boolean);

      if (!followerIds.length) {
        setFollowers([]);
        return;
      }

      const { data: profileRows, error: profileError } = await supabase
        .from("profiles")
        .select("id, username, full_name, display_name, avatar_url")
        .in("id", followerIds);

      if (profileError) throw profileError;

      const profileMap = new Map(
        (profileRows || []).map((row) => [String(row.id), row])
      );

      setFollowers(
        followerIds
          .map((id) => profileMap.get(String(id)))
          .filter(Boolean)
      );
    } catch (err) {
      console.warn("Failed loading followers:", err);
      setFollowers([]);
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

      await Promise.all([
        loadFollowers(profileRow),
        loadRankedTopShows(profileRow),
        loadCreatorLists(profileRow, user),
      ]);

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
    setExpandedListIds(new Set());
    setShowFollowers(false);
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
      setExpandedListIds((current) => {
        const next = new Set(current);
        next.delete(listId);
        return next;
      });
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

      await loadFollowers(profile);
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
  const listCount = lists.length + (rankedTopShows.length ? 1 : 0);

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

      <section className="creator-stats-card creator-stats-card-clickable">
        <button type="button" onClick={() => handleStatClick("followers")}>
          <strong>{followersCount}</strong>
          <span>Followers</span>
        </button>
        <button type="button" onClick={() => handleStatClick("posts")}>
          <strong>{posts.length}</strong>
          <span>Posts</span>
        </button>
        <button type="button" onClick={() => handleStatClick("lists")}>
          <strong>{listCount}</strong>
          <span>Lists</span>
        </button>
        <button type="button" onClick={() => handleStatClick("reviews")}>
          <strong>{reviews.length}</strong>
          <span>Reviews</span>
        </button>
      </section>

      <section
        ref={followersSectionRef}
        id="creator-followers"
        className={`creator-card creator-followers-card ${showFollowers ? "is-visible" : ""}`}
        hidden={!showFollowers}
      >
        <div className="creator-section-head">
          <h2>Followers</h2>
        </div>

        {followers.length ? (
          <div className="creator-followers-list">
            {followers.map((follower) => {
              const followerName = getName(follower);
              const followerInitial = getInitial(follower);

              return (
                <Link
                  key={follower.id}
                  to={follower.username ? `/u/${encodeURIComponent(follower.username)}` : "#"}
                  className="creator-follower-row"
                >
                  {follower.avatar_url ? (
                    <img src={follower.avatar_url} alt="" />
                  ) : (
                    <span>{followerInitial}</span>
                  )}
                  <div>
                    <strong>{followerName}</strong>
                    {follower.username ? <small>@{follower.username}</small> : null}
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <p className="creator-muted">No followers yet.</p>
        )}
      </section>

      {creatorBio ? (
        <section className="creator-card">
          <div className="creator-section-head">
            <h2>About</h2>
          </div>
          <p className="creator-copy">{creatorBio}</p>
        </section>
      ) : null}

      <section ref={listsSectionRef} id="creator-lists" className="creator-card">
        <div className="creator-section-head">
          <h2>Creator lists</h2>
          {isOwnProfile ? (
            <Link to="/creator/lists/new" className="creator-small-link">
              Create list
            </Link>
          ) : null}
        </div>

        {listCount ? (
          <div className="creator-list-grid">
            {rankedTopShows.length ? (
              <CreatorListCard
                listId="rankd-top-10"
                title="Top 10 shows of all time"
                subtitle={`${rankedTopShows.length} ranked shows • Auto-updates from Rank'd`}
                badge="Rank'd"
                description={`This list is generated from ${displayName}'s current Rank'd ladder and changes whenever their rankings change.`}
                items={rankedTopShows}
                isExpanded={expandedListIds.has("rankd-top-10")}
                onToggle={toggleListExpanded}
                className="creator-list-card-auto"
              />
            ) : null}

            {lists.map((list) => {
              const itemCount = list.items?.length || 0;
              const subtitle = `${itemCount} show${itemCount === 1 ? "" : "s"}${
                list.visibility === "private" ? " • Private draft" : ""
              }`;

              return (
                <CreatorListCard
                  key={list.id}
                  listId={list.id}
                  title={list.title}
                  subtitle={subtitle}
                  badge={formatDate(list.created_at)}
                  description={list.description}
                  items={list.items || []}
                  isExpanded={expandedListIds.has(list.id)}
                  onToggle={toggleListExpanded}
                  canDelete={isOwnProfile}
                  onDelete={handleDeleteList}
                />
              );
            })}
          </div>
        ) : (
          <p className="creator-muted">
            {isOwnProfile
              ? "You have not created any lists yet. Rank shows in Rank'd or tap Create list to make your first one."
              : "This creator has not shared any lists yet."}
          </p>
        )}
      </section>

      <section ref={postsSectionRef} id="creator-posts" className="creator-card">
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

      <section ref={reviewsSectionRef} id="creator-reviews" className="creator-card">
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
