import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import ReviewVotes from "./ReviewVotes";

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

function getDisplayName(profile) {
  return profile?.full_name || profile?.username || "User";
}

function formatRating(value) {
  const rating = Number(value);
  if (Number.isNaN(rating)) return "";
  return `${Math.round(rating)}%`;
}

function buildTree(rows) {
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

function ReviewItem({
  review,
  config,
  currentUserId,
  onReply,
  onEdit,
  savingReplyId,
  savingEditId,
  onVoteChanged,
  depth = 0,
}) {
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyBody, setReplyBody] = useState("");
  const [editing, setEditing] = useState(false);
  const [editBody, setEditBody] = useState(review.body || "");

  const profile = review.profile || {};
  const displayName = getDisplayName(profile);
  const avatarUrl = profile.avatar_url || "";
  const username = profile.username || "";
  const profileUrl = username ? `/u/${encodeURIComponent(username)}` : "";
  const ratingLabel = formatRating(review.user_rating);

  const isOwnReview =
    currentUserId && String(review.user_id) === String(currentUserId);

  const canReply = currentUserId && !isOwnReview;
  const hasReplies = Array.isArray(review.replies) && review.replies.length > 0;
  const canEdit = isOwnReview;
  const editModeLabel = hasReplies ? "Add to this" : "Edit";

  const isSavingReply = savingReplyId === review.id;
  const isSavingEdit = savingEditId === review.id;

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

  async function submitEdit(event) {
    event.preventDefault();

    const trimmed = editBody.trim();
    if (!trimmed || !canEdit) return;

    const ok = await onEdit(review.id, trimmed, {
      appendOnly: hasReplies,
    });

    if (ok) {
      setEditBody(hasReplies ? "" : trimmed);
      setEditing(false);
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
              {profileUrl ? (
                <a href={profileUrl} className="msd-review-username">
                  {displayName}
                </a>
              ) : (
                <strong className="msd-review-username">{displayName}</strong>
              )}

              {username && displayName !== username ? (
                <span className="msd-review-handle">@{username}</span>
              ) : null}

              {ratingLabel ? (
                <span className="msd-review-rating">{ratingLabel}</span>
              ) : null}
            </div>

            <span className="msd-review-date">
              {formatDateTime(review.created_at)}
            </span>
          </div>

          {editing ? (
            <form className="msd-review-reply-form" onSubmit={submitEdit}>
              {hasReplies ? (
                <div className="msd-review-edit-note">
                  This has replies, so you can only add to it. The original text will stay unchanged.
                </div>
              ) : null}

              <textarea
                value={editBody}
                onChange={(event) => setEditBody(event.target.value)}
                rows={4}
                maxLength={2000}
                placeholder={hasReplies ? "Add an update..." : "Edit your review..."}
              />

              <div className="msd-review-form-actions">
                <span>{editBody.trim().length}/2000</span>

                <button
                  type="button"
                  className="msd-btn msd-btn-secondary"
                  onClick={() => {
                    setEditBody(hasReplies ? "" : review.body || "");
                    setEditing(false);
                  }}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="msd-btn msd-btn-primary"
                  disabled={isSavingEdit || !editBody.trim()}
                >
                  {isSavingEdit ? "Saving..." : hasReplies ? "Add update" : "Save"}
                </button>
              </div>
            </form>
          ) : (
            <p className="msd-review-text">{review.body}</p>
          )}
        </div>

               <div className="msd-review-actions">
          <ReviewVotes
            tableName={config.voteTable}
            idColumn={config.voteIdColumn}
            itemId={review.id}
            currentUserId={currentUserId}
            upCount={review.up_count || 0}
            downCount={review.down_count || 0}
            myVote={review.my_vote ?? null}
            onChanged={(nextVote, previousVote) =>
              onVoteChanged(review.id, nextVote, previousVote)
            }
          />

          {canEdit ? (
            <button
              type="button"
              className="msd-review-action"
              onClick={() => {
                setEditBody(hasReplies ? "" : review.body || "");
                setEditing((prev) => !prev);
              }}
            >
              {editModeLabel}
            </button>
          ) : null}

          {canReply ? (
            <button
              type="button"
              className="msd-review-action msd-review-reply-action"
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
                disabled={isSavingReply || !replyBody.trim()}
              >
                {isSavingReply ? "Saving..." : "Post reply"}
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
                config={config}
                currentUserId={currentUserId}
                onReply={onReply}
                onEdit={onEdit}
                savingReplyId={savingReplyId}
                savingEditId={savingEditId}
                onVoteChanged={onVoteChanged}
                depth={depth + 1}
              />
            ))}
          </div>
        ) : null}
      </div>
    </article>
  );
}

export default function ReviewThread({
  config,
  itemId,
  currentUserId,
  heading,
  subheading,
}) {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [savingReplyId, setSavingReplyId] = useState(null);
  const [savingEditId, setSavingEditId] = useState(null);
  const [error, setError] = useState("");

  async function loadReviews() {
    if (!itemId) return;

    setLoading(true);
    setError("");

    try {
      const { data: reviewRows, error: reviewError } = await supabase
        .from(config.reviewTable)
        .select(
          `id, ${config.itemColumn}, user_id, parent_id, body, created_at, updated_at`
        )
        .eq(config.itemColumn, itemId)
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

      if (userIds.length && config.ratingTable) {
        const { data: ratingRows, error: ratingError } = await supabase
          .from(config.ratingTable)
          .select(`user_id, ${config.itemColumn}, rating`)
          .eq(config.itemColumn, itemId)
          .in("user_id", userIds);

        if (ratingError) throw ratingError;

        ratingMap = new Map(
          (ratingRows || []).map((rating) => [
            String(rating.user_id),
            rating.rating,
          ])
        );
      }

      const reviewIds = (reviewRows || []).map((row) => row.id).filter(Boolean);
      let voteMap = new Map();
      let myVoteMap = new Map();

      if (reviewIds.length) {
        const { data: voteRows, error: voteError } = await supabase
          .from(config.voteTable)
          .select(`${config.voteIdColumn}, user_id, vote`)
          .in(config.voteIdColumn, reviewIds);

        if (voteError) throw voteError;

        (voteRows || []).forEach((voteRow) => {
          const key = String(voteRow[config.voteIdColumn]);
          const current = voteMap.get(key) || { up: 0, down: 0 };

          if (Number(voteRow.vote) === 1) current.up += 1;
          if (Number(voteRow.vote) === -1) current.down += 1;

          voteMap.set(key, current);

          if (
            currentUserId &&
            String(voteRow.user_id) === String(currentUserId)
          ) {
            myVoteMap.set(key, Number(voteRow.vote));
          }
        });
      }

      setReviews(
        (reviewRows || []).map((row) => ({
          ...row,
          profile: profileMap.get(String(row.user_id)) || null,
          user_rating: ratingMap.get(String(row.user_id)) ?? null,
          up_count: voteMap.get(String(row.id))?.up || 0,
          down_count: voteMap.get(String(row.id))?.down || 0,
          my_vote: myVoteMap.get(String(row.id)) ?? null,
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
    setBody("");
    loadReviews();
  }, [itemId, currentUserId]);

  const reviewTree = useMemo(() => buildTree(reviews), [reviews]);

  const hasPostedRootReview = useMemo(
    () =>
      reviews.some(
        (item) =>
          !item.parent_id && String(item.user_id) === String(currentUserId)
      ),
    [reviews, currentUserId]
  );

  async function handleSubmitReview(event) {
    event.preventDefault();

    const trimmed = body.trim();
    if (!currentUserId || !itemId || !trimmed || saving) return;

    setSaving(true);
    setError("");

    try {
      if (hasPostedRootReview) return;

      const { error: insertError } = await supabase
        .from(config.reviewTable)
        .insert({
          [config.itemColumn]: itemId,
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

    if (!currentUserId || !itemId || !parentId || !trimmed) return false;

    setSavingReplyId(parentId);
    setError("");

    try {
      const parentReview = reviews.find(
        (item) => String(item.id) === String(parentId)
      );

      if (
        parentReview?.user_id &&
        String(parentReview.user_id) === String(currentUserId)
      ) {
        setError("You cannot reply to your own post.");
        return false;
      }

      const { error: insertError } = await supabase
        .from(config.reviewTable)
        .insert({
          [config.itemColumn]: itemId,
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

  async function handleEditReview(reviewId, updatedBody, options = {}) {
    const trimmed = updatedBody.trim();

    if (!currentUserId || !reviewId || !trimmed) return false;

    const targetReview = reviews.find(
      (review) => String(review.id) === String(reviewId)
    );

    if (!targetReview || String(targetReview.user_id) !== String(currentUserId)) {
      setError("You can only edit your own review.");
      return false;
    }

    const hasReplies = reviews.some(
      (review) => String(review.parent_id || "") === String(reviewId)
    );
    const shouldAppend = Boolean(options.appendOnly || hasReplies);
    const nextBody = shouldAppend
      ? `${targetReview.body || ""}

${trimmed}`.trim()
      : trimmed;

    const previousReviews = reviews;
    const now = new Date().toISOString();

    setSavingEditId(reviewId);
    setError("");

    setReviews((prev) =>
      prev.map((review) =>
        String(review.id) === String(reviewId) &&
        String(review.user_id) === String(currentUserId)
          ? {
              ...review,
              body: nextBody,
              updated_at: now,
            }
          : review
      )
    );

    try {
      const { data, error: updateError } = await supabase
        .from(config.reviewTable)
        .update({
          body: nextBody,
          updated_at: now,
        })
        .eq("id", reviewId)
        .eq("user_id", currentUserId)
        .select("id, body, updated_at");

      if (updateError) throw updateError;

      if (!data || data.length === 0) {
        throw new Error(
          "Supabase did not update the review. Check the UPDATE policy for this review table."
        );
      }

      await loadReviews();
      return true;
    } catch (err) {
      console.error("Failed editing review:", err);
      setReviews(previousReviews);
      setError(err.message || "Failed editing review");
      return false;
    } finally {
      setSavingEditId(null);
    }
  }

function handleLocalVoteChanged(reviewId, nextVote, previousVote) {
  setReviews((prev) =>
    prev.map((review) => {
      if (String(review.id) !== String(reviewId)) return review;

      let up = Number(review.up_count || 0);
      let down = Number(review.down_count || 0);

      if (previousVote === 1) up -= 1;
      if (previousVote === -1) down -= 1;

      if (nextVote === 1) up += 1;
      if (nextVote === -1) down += 1;

      return {
        ...review,
        up_count: Math.max(0, up),
        down_count: Math.max(0, down),
        my_vote: nextVote,
      };
    })
  );
}
  
  return (
    <section className={config.sectionClass || "msd-reviews-section"}>
      <h2 className={config.headingClass || "msd-section-title"}>{heading}</h2>

      {subheading ? <p className="msd-muted">{subheading}</p> : null}

      {currentUserId && !hasPostedRootReview ? (
        <form className="msd-review-form" onSubmit={handleSubmitReview}>
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder={config.placeholder || "Write your review..."}
            rows={config.rows || 5}
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
      ) : !currentUserId ? (
        <div className="msd-review-login-note">Log in to write a review.</div>
      ) : null}

      {error ? <div className="msd-review-error">{error}</div> : null}

      {loading ? (
        <p className="msd-muted">Loading reviews...</p>
      ) : reviewTree.length > 0 ? (
        <div className="msd-review-list">
          {reviewTree.map((review) => (
            <ReviewItem
              key={review.id}
              review={review}
              config={config}
              currentUserId={currentUserId}
              onReply={handleSubmitReply}
              onEdit={handleEditReview}
              savingReplyId={savingReplyId}
              savingEditId={savingEditId}
              onVoteChanged={handleLocalVoteChanged}
            />
          ))}
        </div>
      ) : (
        <p className="msd-muted">No reviews yet. Be the first to write one.</p>
      )}
    </section>
  );
}
