import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { getProfileDisplayName, getProfileHref } from "../lib/profileLinks";
import "./FeedComments.css";

function formatCommentDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function isMissingTableError(error, tableName) {
  const message = String(error?.message || "").toLowerCase();
  const details = String(error?.details || "").toLowerCase();
  const code = String(error?.code || "").toUpperCase();
  const table = String(tableName || "").toLowerCase();

  return (
    code === "PGRST205" ||
    code === "42P01" ||
    message.includes(table) ||
    details.includes(table) ||
    message.includes("schema cache") ||
    details.includes("schema cache")
  );
}

export default function ItemComments({ tableName, itemColumn, itemId, currentUserId, label = "Comment" }) {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [comments, setComments] = useState([]);
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function loadComments() {
    if (!tableName || !itemColumn || !itemId) return;
    setLoading(true);
    setError("");

    try {
      const { data, error: commentsError } = await supabase
        .from(tableName)
        .select(`id, ${itemColumn}, user_id, body, created_at, updated_at`)
        .eq(itemColumn, itemId)
        .order("created_at", { ascending: true })
        .limit(50);

      if (commentsError) {
        if (isMissingTableError(commentsError, tableName)) {
          setComments([]);
          return;
        }
        throw commentsError;
      }

      const rows = data || [];
      const userIds = Array.from(new Set(rows.map((row) => row.user_id).filter(Boolean)));
      let profileMap = new Map();

      if (userIds.length) {
        const { data: profiles, error: profilesError } = await supabase
          .from("profiles")
          .select("id, username, full_name, display_name, avatar_url")
          .in("id", userIds);

        if (!profilesError) {
          profileMap = new Map((profiles || []).map((profile) => [String(profile.id), profile]));
        }
      }

      setComments(
        rows.map((row) => ({
          ...row,
          profile: profileMap.get(String(row.user_id)) || { id: row.user_id },
        }))
      );
    } catch (err) {
      console.error("Failed loading comments:", err);
      setError("Could not load comments.");
      setComments([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadComments();
  }, [tableName, itemColumn, itemId]);

  async function handleSubmit(event) {
    event.preventDefault();
    const body = draft.trim();
    if (!body || submitting || !currentUserId || !tableName || !itemColumn || !itemId) return;

    setSubmitting(true);
    setError("");

    try {
      const { error: insertError } = await supabase.from(tableName).insert({
        [itemColumn]: itemId,
        user_id: currentUserId,
        body,
      });

      if (insertError) {
        if (isMissingTableError(insertError, tableName)) {
          setError("Comments table has not been created yet.");
          return;
        }
        throw insertError;
      }

      setDraft("");
      setIsOpen(true);
      await loadComments();
    } catch (err) {
      console.error("Failed posting comment:", err);
      setError("Could not post comment.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="feed-comments item-comments-inline">
      <button type="button" className="feed-comments-toggle" onClick={() => setIsOpen((value) => !value)}>
        <span>{comments.length ? `${comments.length} comment${comments.length === 1 ? "" : "s"}` : label}</span>
        <em>{isOpen ? "Hide" : "Open"}</em>
      </button>

      {isOpen ? (
        <div className="feed-comments-panel">
          {loading ? <p className="feed-comments-muted">Loading comments...</p> : null}
          {error ? <p className="feed-comments-error">{error}</p> : null}

          {comments.length ? (
            <div className="feed-comments-list">
              {comments.map((comment) => {
                const profile = comment.profile || {};
                const displayName = getProfileDisplayName(profile, "User");
                const profileHref = getProfileHref(profile, comment.user_id);

                return (
                  <article key={comment.id} className="feed-comment">
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
                        <span>{formatCommentDate(comment.created_at)}</span>
                      </div>
                      <p>{comment.body}</p>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : !loading ? (
            <p className="feed-comments-muted">No comments yet.</p>
          ) : null}

          <form className="feed-comment-form" onSubmit={handleSubmit}>
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Write a comment..."
              rows={2}
              maxLength={1000}
            />
            <button type="submit" disabled={!draft.trim() || submitting || !currentUserId}>
              {submitting ? "Posting..." : "Post"}
            </button>
          </form>
        </div>
      ) : null}
    </section>
  );
}
