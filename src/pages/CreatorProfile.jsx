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

export default function CreatorProfile() {
  const { username } = useParams();

  const [currentUser, setCurrentUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [followLoading, setFollowLoading] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followersCount, setFollowersCount] = useState(0);
  const [reviews, setReviews] = useState([]);
  const [topShows, setTopShows] = useState([]);
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
        .select("id, username, full_name, display_name, avatar_url, cover_url, tagline, bio")
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

      const { data: rankedRows } = await supabase
        .from("rankd_user_show_ratings")
        .select(`
          show_id,
          rating,
          ladder_position,
          shows:show_id (
            id,
            name,
            tmdb_id,
            poster_url,
            backdrop_url
          )
        `)
        .eq("user_id", profileRow.id)
        .order("ladder_position", { ascending: true })
        .limit(5);

      setTopShows(rankedRows || []);
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
    return <main className="creator-page"><p className="creator-muted">Loading creator...</p></main>;
  }

  if (error && !profile) {
    return <main className="creator-page"><p className="creator-error">{error}</p></main>;
  }

  const displayName = getName(profile);
  const handle = profile?.username ? `@${profile.username}` : "";
  const avatarUrl = profile?.avatar_url || "";
  const coverUrl = profile?.cover_url || topShows?.[0]?.shows?.backdrop_url || topShows?.[0]?.shows?.poster_url || "";

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
          <p className="creator-tagline">
            {profile?.tagline || profile?.bio || "Follow my TV reviews, rankings and recommendations."}
          </p>

          <div className="creator-actions">
            {isOwnProfile ? (
              <Link to="/profile/edit" className="creator-btn creator-btn-secondary">Edit profile</Link>
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
          <strong>{reviews.length}</strong>
          <span>Reviews</span>
        </div>
        <div>
          <strong>{topShows.length}</strong>
          <span>Top shows</span>
        </div>
      </section>

      <section className="creator-card">
        <div className="creator-section-head">
          <h2>Why follow?</h2>
        </div>
        <p className="creator-copy">
          Follow for free to see {displayName}'s reviews and activity in your Following feed. Paid interaction will come next: private chats, recommendation requests and member-only polls.
        </p>
      </section>

      <section className="creator-card">
        <div className="creator-section-head">
          <h2>Start here</h2>
        </div>

        {topShows.length ? (
          <div className="creator-top-list">
            {topShows.map((item, index) => (
              <Link key={`${item.show_id}-${index}`} to={showHref(item.shows)} className="creator-top-show">
                <span className="creator-rank">#{index + 1}</span>
                {item.shows?.poster_url ? (
                  <img src={item.shows.poster_url} alt="" />
                ) : (
                  <div className="creator-mini-poster">?</div>
                )}
                <span>{item.shows?.name || "Untitled show"}</span>
              </Link>
            ))}
          </div>
        ) : (
          <p className="creator-muted">No ranked shows yet.</p>
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
