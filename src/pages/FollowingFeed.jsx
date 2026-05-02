import { useEffect, useState } from "react";
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
  return profile?.display_name || profile?.full_name || profile?.username || "Someone";
}

function creatorHref(profile) {
  return profile?.username ? `/u/${profile.username}` : "/";
}

function showHref(show) {
  if (!show) return "#";
  if (show.tmdb_id) return `/show/tmdb/${show.tmdb_id}`;
  return `/show/${show.id}`;
}

export default function FollowingFeed() {
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [error, setError] = useState("");

  async function loadFeed() {
    setLoading(true);
    setError("");

    try {
      const { data: authData } = await supabase.auth.getUser();
      const user = authData?.user || null;
      setCurrentUser(user);

      if (!user?.id) {
        setReviews([]);
        return;
      }

      const { data: follows, error: followsError } = await supabase
        .from("user_follows")
        .select("following_id")
        .eq("follower_id", user.id);

      if (followsError) throw followsError;

      const followingIds = (follows || []).map((row) => row.following_id).filter(Boolean);

      if (!followingIds.length) {
        setReviews([]);
        return;
      }

      const { data: reviewRows, error: reviewsError } = await supabase
        .from("show_reviews")
        .select(`
          id,
          user_id,
          show_id,
          body,
          created_at,
          profiles:user_id (
            id,
            username,
            full_name,
            display_name,
            avatar_url
          ),
          shows:show_id (
            id,
            name,
            tmdb_id,
            first_aired,
            poster_url,
            backdrop_url
          )
        `)
        .in("user_id", followingIds)
        .is("parent_id", null)
        .order("created_at", { ascending: false })
        .limit(40);

      if (reviewsError) throw reviewsError;
      setReviews(reviewRows || []);
    } catch (err) {
      console.error("Failed loading following feed:", err);
      setError(err.message || "Failed loading feed.");
      setReviews([]);
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
        <p>Reviews and activity from the creators you follow.</p>
      </header>

      {error ? <p className="following-error">{error}</p> : null}

      {loading ? (
        <p className="following-muted">Loading feed...</p>
      ) : reviews.length ? (
        <section className="following-feed-list">
          {reviews.map((review) => {
            const creator = review.profiles;
            const show = review.shows;
            const creatorName = getCreatorName(creator);
            const avatarUrl = creator?.avatar_url || "";

            return (
              <article key={review.id} className="following-card">
                <Link to={creatorHref(creator)} className="following-creator-line">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="" className="following-avatar" />
                  ) : (
                    <div className="following-avatar following-avatar-fallback">
                      {creatorName.slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <strong>{creatorName}</strong>
                    <span>reviewed {show?.name || "a show"} · {formatDate(review.created_at)}</span>
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
                    {show?.first_aired ? <span>{String(show.first_aired).slice(0, 4)}</span> : null}
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
          <p>Follow creators to build your free feed. Their reviews will appear here.</p>
          <Link to="/search" className="following-empty-btn">Find shows and reviewers</Link>
        </section>
      )}
    </main>
  );
}
