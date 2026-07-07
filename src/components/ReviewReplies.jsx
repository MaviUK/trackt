import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { getProfileDisplayName, getProfileHref } from "../lib/profileLinks";

function formatReplyDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function countDescendants(rows, parentId) {
  return (rows || []).reduce((total, row) => {
    if (String(row.parent_id || "") !== String(parentId)) return total;
    return total + 1 + countDescendants(rows, row.id);
  }, 0);
}

export default function ReviewReplies({ showId, reviewId, currentUserId }) {
  const [isOpen, setIsOpen] = useState(false);
  const [replies, setReplies] = useState([]);
  const [replyCount, setReplyCount] = useState(0);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function loadReplies() {
    if (!showId || !reviewId) return;
    setLoading(true);
    setError("");

    try {
      const { data: rows, error: rowsError } = await supabase
        .from("show_reviews")
        .select("id, show_id, user_id, parent_id, body, created_at, updated_at")
        .eq("show_id", showId)
        .order("created_at", { ascending: true });

      if (rowsError) throw rowsError;

      const directReplies = (rows || []).filter(
        (row) => String(row.parent_id || "") === String(reviewId)
      );
      setReplyCount(countDescendants(rows || [], reviewId));

      const userIds = Array.from(new Set(directReplies.map((row) => row.user_id).filter(Boolean)));
      let profileMap = new Map();

      if (userIds.length) {
        const { data: profiles, error: profileError } = await supabase
          .from("profiles")
          .select("id, username, full_name, display_name, avatar_url")
          .in("id", userIds);

        if (profileError) throw profileError;
        profileMap = new Map((profiles || []).map((profile) => [String(profile.id), profile]));
      }

      setReplies(
        directReplies.map((reply) => ({
          ...reply,
          profile: profileMap.get(String(reply.user_id)) || { id: reply.user_id },
        }))
      );
    } catch (err) {
      console.error("Failed loading review replies:", err);
      setError("Could not load replies.");
      setReplies([]);
      setReplyCount(0);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadReplies();
  }, [showId, reviewId]);

  async function submitReply(event) {
    event.preventDefault();
    const body = draft.trim();
    if (!body || !currentUserId || !showId || !reviewId || saving) return;

    setSaving(true);
    setError("");

    try {
      const { error: insertError } = await supabase.from("show_reviews").insert({
        show_id: showId,
        user_id: currentUserId,
        parent_id: reviewId,
        body,
      });

      if (insertError) throw insertError;
      setDraft("");
      setIsOpen(true);
      await loadReplies();
    } catch (err) {
      console.error("Failed posting review reply:", err);
      setError("Could not post reply.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="feed-comments review-replies-inline">
      <button
        type="button"
        className="feed-comments-toggle"
        onClick={() => setIsOpen((value) => !value)}
      >
        <span>{replyCount ? `${replyCount} repl${replyCount === 1 ? "y" : "ies"}` : "Reply"}</span>
        <em>{isOpen ? "Hide" : "Open"}</em>
      </button>

      {isOpen ? (
        <div className="feed-comments-panel">
          {loading ? <p className="feed-comments-muted">Loading replies...</p> : null}
          {error ? <p className="feed-comments-error">{error}</p> : null}

          {replies.length ? (
            <div className="feed-comments-list">
              {replies.map((reply) => {
                const profile = reply.profile || {};
                const displayName = getProfileDisplayName(profile, "User");
                const profileHref = getProfileHref(profile, reply.user_id);

                return (
                  <article key={reply.id} className="feed-comment">
                    {profile.avatar_url ? (
                      <img src={profile.avatar_url} alt="" className="feed-comment-avatar" />
                    ) : (
                      <div className="feed-comment-avatar feed-comment-avatar-fallback">
                        {displayName.slice(0, 1).toUpperCase()}
                      </div>
                    )}
                    <div>
                      <div className="feed-comment-meta">
                        <Link to={profileHref}>{displayName}</Link>
                        <span>{formatReplyDate(reply.created_at)}</span>
                      </div>
                      <p>{reply.body}</p>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : !loading ? (
            <p className="feed-comments-muted">No replies yet.</p>
          ) : null}

          <form className="feed-comment-form" onSubmit={submitReply}>
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Reply to this review..."
              rows={2}
              maxLength={1000}
            />
            <button type="submit" disabled={!draft.trim() || saving || !currentUserId}>
              {saving ? "Posting..." : "Post reply"}
            </button>
          </form>
        </div>
      ) : null}
    </section>
  );
}
