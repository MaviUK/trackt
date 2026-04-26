import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

function formatDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getDisplayName(profile, fallbackUserId) {
  return (
    profile?.username ||
    profile?.full_name ||
    (fallbackUserId ? `User ${String(fallbackUserId).slice(0, 6)}` : "User")
  );
}

function formatEpisodeRating(value) {
  const rating = Number(value);
  if (Number.isNaN(rating)) return "";
  return `${Math.round(rating)}%`;
}

function buildReviewTree(rows) {
  const byId = new Map();

  (rows || []).forEach((row) => {
    byId.set(String(row.id), { ...row, replies: [] });
  });

  const roots = [];

  byId.forEach((row) => {
    const parentId = row.parent_id ? String(row.parent_id) : "";

    if (parentId && byId.has(parentId)) {
      byId.get(parentId).replies.push(row);
    } else {
      roots.push(row);
    }
  });

  return roots;
}

function EpisodeReviewItem({
  review,
  currentUserId,
  onReply,
  savingReplyId,
  depth = 0,
}) {
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyBody, setReplyBody] = useState("");

  const profile = review.profile || {};
  const displayName = getDisplayName(profile, review.user_id);
  const avatarUrl = profile.avatar_url || "";
  const isSaving = savingReplyId === review.id;
  const ratingLabel = formatEpisodeRating(review.episode_rating);

  const canReply =
    currentUserId && String(review.user_id) !== String(currentUserId);

  async function submitReply(event) {
    event.preventDefault();

    const trimmed = replyBody.trim();
    if (!trimmed || !canReply) return;

    const ok = await onReply(review.id, trimmed);

    if (ok) {
      setReplyBody("");
      setReplyOpen(false);
    }
  }

  return (
    <article className={`msd-review-item ${depth > 0 ? "is-reply" : ""}`}>
      <div className="msd-review-body-wrap">
        <div className="msd-review-card">
          <div className="msd-review-head">
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="msd-review-avatar" />
            ) : (
              <div className="msd-review-avatar msd-review-avatar-fallback">
                {displayName.slice(0, 1).toUpperCase()}
              </div>
            )}

            <div className="msd-review-user-line">
              <strong className="msd-review-username">{displayName}</strong>

              {ratingLabel ? (
                <span className="msd-review-rating">{ratingLabel}</span>
              ) : null}
            </div>

            <span className="msd-review-date">
              {formatDateTime(review.created_at)}
            </span>
          </div>

          <p className="msd-review-text">{review.body}</p>
        </div>

        <div className="msd-review-actions">
          {canReply ? (
            <button
              type="button"
              className="msd-review-action"
              onClick={() => setReplyOpen((prev) => !prev)}
            >
              Reply
            </button>
          ) : null}
        </div>

        {replyOpen && canReply ? (
          <form className="msd-review-reply-form" onSubmit={submitReply}>
            <textarea
              value={replyBody}
              onChange={(event) => setReplyBody(event.target.value)}
              placeholder={`Reply to ${displayName}...`}
              rows={3}
              maxLength={1000}
            />

            <div className="msd-review-form-actions">
              <button
                type="button"
                className="msd-btn msd-btn-secondary"
                onClick={() => {
                  setReplyBody("");
                  setReplyOpen(false);
                }}
              >
                Cancel
              </button>

              <button
                type="submit"
                className="msd-btn msd-btn-primary"
                disabled={isSaving || !replyBody.trim()}
              >
                {isSaving ? "Saving..." : "Post reply"}
              </button>
            </div>
          </form>
        ) : null}

        {review.replies?.length > 0 ? (
          <div className="msd-review-replies">
            {review.replies.map((reply) => (
              <EpisodeReviewItem
                key={reply.id}
                review={reply}
                currentUserId={currentUserId}
                onReply={onReply}
                savingReplyId={savingReplyId}
                depth={depth + 1}
              />
            ))}
          </div>
        ) : null}
      </div>
    </article>
  );
}

export default function EpisodeReviews({ episodeId, currentUserId, episodeTitle }) {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [savingReplyId, setSavingReplyId] = useState(null);
  const [error, setError] = useState("");

  async function loadReviews() {
    if (!episodeId) return;

    setLoading(true);
    setError("");

    try {
      const { data: reviewRows, error: reviewError } = await supabase
        .from("episode_reviews")
        .select("id, episode_id, user_id, parent_id, body, created_at, updated_at")
        .eq("episode_id", episodeId)
        .order("created_at", { ascending: true });

      if (reviewError) throw reviewError;

      const userIds = Array.from(
        new Set((reviewRows || []).map((row) => row.user_id).filter(Boolean))
      );

      let profileMap = new Map();

      if (userIds.length) {
        const { data: profiles, error: profileError } = await supabase
          .from("profiles")
          .select("id, username, full_name, avatar_url")
          .in("id", userIds);

        if (profileError) throw profileError;

        profileMap = new Map(
          (profiles || []).map((profile) => [String(profile.id), profile])
        );
      }

      let ratingMap = new Map();

      if (userIds.length) {
        const { data: ratingRows, error: ratingError } = await supabase
          .from("episode_ratings")
          .select("user_id, episode_id, rating")
          .eq("episode_id", episodeId)
          .in("user_id", userIds);

        if (ratingError) throw ratingError;

        ratingMap = new Map(
          (ratingRows || []).map((rating) => [
            String(rating.user_id),
            rating.rating,
          ])
        );
      }

      setReviews(
        (reviewRows || []).map((row) => ({
          ...row,
          profile: profileMap.get(String(row.user_id)) || null,
          episode_rating: ratingMap.get(String(row.user_id)) ?? null,
        }))
      );
    } catch (err) {
      console.error("Failed loading episode reviews:", err);
      setError(err.message || "Failed loading episode reviews");
      setReviews([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setBody("");
    loadReviews();
  }, [episodeId]);

  const reviewTree = useMemo(() => buildReviewTree(reviews), [reviews]);

  async function handleSubmitReview(event) {
    event.preventDefault();

    const trimmed = body.trim();
    if (!currentUserId || !episodeId || !trimmed || saving) return;

    setSaving(true);
    setError("");

    try {
      const { error: insertError } = await supabase.from("episode_reviews").insert({
        episode_id: episodeId,
        user_id: currentUserId,
        parent_id: null,
        body: trimmed,
      });

      if (insertError) throw insertError;

      setBody("");
      await loadReviews();
    } catch (err) {
      console.error("Failed posting episode review:", err);
      setError(err.message || "Failed posting episode review");
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmitReply(parentId, replyBody) {
    const trimmed = replyBody.trim();
    if (!currentUserId || !episodeId || !parentId || !trimmed) return false;

    setSavingReplyId(parentId);
    setError("");

    try {
      const parentReview = reviews.find(
        (item) => String(item.id) === String(parentId)
      );

      if (parentReview?.user_id && String(parentReview.user_id) === String(currentUserId)) {
        setError("You cannot reply to your own post.");
        return false;
      }

      const { error: insertError } = await supabase.from("episode_reviews").insert({
        episode_id: episodeId,
        user_id: currentUserId,
        parent_id: parentId,
        body: trimmed,
      });

      if (insertError) throw insertError;

      await loadReviews();
      return true;
    } catch (err) {
      console.error("Failed posting episode reply:", err);
      setError(err.message || "Failed posting episode reply");
      return false;
    } finally {
      setSavingReplyId(null);
    }
  }

  return (
    <section className="msd-episode-reviews-section">
      <h3 className="msd-episode-reviews-title">
        Episode chat{episodeTitle ? `: ${episodeTitle}` : ""}
      </h3>

      {currentUserId ? (
        <form className="msd-review-form" onSubmit={handleSubmitReview}>
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Write your episode review or start the chat..."
            rows={4}
            maxLength={2000}
          />

          <div className="msd-review-form-actions">
            <span>{body.trim().length}/2000</span>

            <button
              type="submit"
              className="msd-btn msd-btn-primary"
              disabled={saving || !body.trim()}
            >
              {saving ? "Posting..." : "Post review"}
            </button>
          </div>
        </form>
      ) : (
        <div className="msd-review-login-note">Log in to chat about this episode.</div>
      )}

      {error ? <div className="msd-review-error">{error}</div> : null}

      {loading ? (
        <p className="msd-muted">Loading episode chat...</p>
      ) : reviewTree.length > 0 ? (
        <div className="msd-review-list">
          {reviewTree.map((review) => (
            <EpisodeReviewItem
              key={review.id}
              review={review}
              currentUserId={currentUserId}
              onReply={handleSubmitReply}
              savingReplyId={savingReplyId}
            />
          ))}
        </div>
      ) : (
        <p className="msd-muted">No episode reviews yet. Start the chat.</p>
      )}
    </section>
  );
}
