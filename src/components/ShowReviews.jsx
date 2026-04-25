function ReviewItem({ review, currentUserId, onReply, savingReplyId, depth = 0 }) {
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyBody, setReplyBody] = useState("");
  const profile = review.profile || {};
  const displayName = getDisplayName(profile, review.user_id);
  const avatarUrl = profile.avatar_url || "";
  const isSaving = savingReplyId === review.id;
  const canReply = currentUserId && String(review.user_id) !== String(currentUserId);

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
