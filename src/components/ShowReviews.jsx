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

function ReviewItem({ review, currentUserId, onReply, savingReplyId, depth = 0 }) {
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyBody, setReplyBody] = useState("");
  const profile = review.profile || {};
  const displayName = getDisplayName(profile, review.user_id);
  const avatarUrl = profile.avatar_url || "";
  const isSaving = savingReplyId === review.id;

  async function submitReply(event) {
    event.preventDefault();
    const trimmed = replyBody.trim();
    if (!trimmed) return;
    const ok = await onReply(review.id, trimmed);
    if (ok) {
      setReplyBody("");
      setReplyOpen(false);
    }
  }

  return (
    <article className={`msd-review-item ${depth > 0 ? "is-reply" : ""}`}>
      <div className="msd-review-avatar-wrap">
        {avatarUrl ? (
          <img src={avatarUrl} alt="" className="msd-review-avatar" />
        ) : (
          <div className="msd-review-avatar msd-review-avatar-fallback">
            {displayName.slice(0, 1).toUpperCase()}
          </div>
        )}
      </div>

      <div className="msd-review-body-wrap">
        <div className="msd-review-card">
          <div className="msd-review-head">
            <strong>{displayName}</strong>
            <span>{formatDateTime(review.created_at)}</span>
          </div>
          <p className="msd-review-text">{review.body}</p>
        </div>

        <div className="msd-review-actions">
          {currentUserId ? (
            <button
              type="button"
              className="msd-review-action"
              onClick={() => setReplyOpen((prev) => !prev)}
            >
              Reply
            </button>
          ) : null}
        </div>

        {replyOpen ? (
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
              <ReviewItem
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

export default function ShowReviews({ showId, currentUserId }) {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [savingReplyId, setSavingReplyId] = useState(null);
  const [error, setError] = useState("");

  async function loadReviews() {
    if (!showId) return;
    setLoading(true);
    setError("");

    try {
      const { data: reviewRows, error: reviewError } = await supabase
        .from("show_reviews")
        .select("id, show_id, user_id, parent_id, body, created_at, updated_at")
        .eq("show_id", showId)
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

      setReviews(
        (reviewRows || []).map((row) => ({
          ...row,
          profile: profileMap.get(String(row.user_id)) || null,
        }))
      );
    } catch (err) {
      console.error("Failed loading reviews:", err);
      setError(err.message || "Failed loading reviews");
      setReviews([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadReviews();
  }, [showId]);

  const reviewTree = useMemo(() => buildReviewTree(reviews), [reviews]);

  async function handleSubmitReview(event) {
    event.preventDefault();
    const trimmed = body.trim();
    if (!currentUserId || !showId || !trimmed || saving) return;

    setSaving(true);
    setError("");

    try {
      const { error: insertError } = await supabase.from("show_reviews").insert({
        show_id: showId,
        user_id: currentUserId,
        parent_id: null,
        body: trimmed,
      });

      if (insertError) throw insertError;
      setBody("");
      await loadReviews();
    } catch (err) {
      console.error("Failed posting review:", err);
      setError(err.message || "Failed posting review");
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmitReply(parentId, replyBody) {
    const trimmed = replyBody.trim();
    if (!currentUserId || !showId || !parentId || !trimmed) return false;

    setSavingReplyId(parentId);
    setError("");

    try {
      const { error: insertError } = await supabase.from("show_reviews").insert({
        show_id: showId,
        user_id: currentUserId,
        parent_id: parentId,
        body: trimmed,
      });

      if (insertError) throw insertError;
      await loadReviews();
      return true;
    } catch (err) {
      console.error("Failed posting reply:", err);
      setError(err.message || "Failed posting reply");
      return false;
    } finally {
      setSavingReplyId(null);
    }
  }

  return (
    <section className="msd-reviews-section">
      <div className="msd-reviews-header">
        <div>
          <h2 className="msd-section-title">Reviews</h2>
          <p className="msd-muted">
            Write a review, reply to reviews, and keep the conversation going.
          </p>
        </div>
        <span className="msd-review-count">{reviews.length} posts</span>
      </div>

      {currentUserId ? (
        <form className="msd-review-form" onSubmit={handleSubmitReview}>
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Write your review..."
            rows={5}
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
        <div className="msd-review-login-note">Log in to write a review.</div>
      )}

      {error ? <div className="msd-review-error">{error}</div> : null}

      {loading ? (
        <p className="msd-muted">Loading reviews...</p>
      ) : reviewTree.length > 0 ? (
        <div className="msd-review-list">
          {reviewTree.map((review) => (
            <ReviewItem
              key={review.id}
              review={review}
              currentUserId={currentUserId}
              onReply={handleSubmitReply}
              savingReplyId={savingReplyId}
            />
          ))}
        </div>
      ) : (
        <p className="msd-muted">No reviews yet. Be the first to write one.</p>
      )}
    </section>
  );
}
