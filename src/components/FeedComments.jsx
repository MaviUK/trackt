import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { getProfileDisplayName } from "../lib/profileLinks";
import "./FeedComments.css";

function formatCommentDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function isMissingTableError(error) {
  const message = String(error?.message || "").toLowerCase();
  const details = String(error?.details || "").toLowerCase();
  const code = String(error?.code || "").toUpperCase();

  return (
    code === "PGRST205" ||
    code === "42P01" ||
    message.includes("feed_comments") ||
    details.includes("feed_comments") ||
    message.includes("schema cache") ||
    details.includes("schema cache")
  );
}

function commenterInitial(profile, userId) {
  const name = getProfileDisplayName(profile, "User") || String(userId || "U");
  return name.slice(0, 1).toUpperCase();
}

export default function FeedComments({ targetType, targetId, currentUserId }) {
  const targetKey = useMemo(
    () => `${String(targetType || "item")}:${String(targetId || "")}`,
    [targetType, targetId]
  );

  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [comments, setComments] = useState([]);
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function loadComments() {
    if (!targetId) return;
    setLoading(true);
    setError("");

    try {
      const { data, error: commentsError } = await supabase
        .from("feed_comments")
        .select("id, target_key, target_type, target_id, user_id, body, created_at, updated_at")
        .eq("target_key", targetKey)
        .order("created_at", { ascending: true })
        .limit(50);

      if (commentsError) {
        if (isMissingTableError(commentsError)) {
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
          profiles: profileMap.get(String(row.user_id)) || { id: row.user_id },
        }))
      );
    } catch (err) {
      console.error("Failed loading feed comments:", err);
      setError("Could not load comments.");
      setComments([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadComments();
  }, [targetKey]);

  async function handleSubmit(event) {
    event.preventDefault();
    const body = draft.trim();
    if (!body || submitting) return;

    let userId = currentUserId;
    if (!userId) {
      const { data: authData } = await supabase.auth.getUser();
      userId = authData?.user?.id || null;
    }

    if (!userId) {
      setError("Log in to comment.");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const { data, error: insertError } = await supabase
        .from("feed_comments")
        .insert({
          target_key: targetKey,
          target_type: targetType,
          target_id: String(targetId),
          user_id: userId,
          body,
        })
        .select("id, target_key, target_type, target_id, user_id, body, created_at, updated_at")
        .single();

      if (insertError) {
        if (isMissingTableError(insertError)) {
          setError("Comments table has not been created yet.");
          return;
        }
        throw insertError;
      }

      let profile = { id: userId };
      const { data: profileRow } = await supabase
        .from("profiles")
        .select("id, username, full_name, display_name, avatar_url")
        .eq("id", userId)
        .maybeSingle();

      if (profileRow) profile = profileRow;

      setComments((current) => [...current, { ...data, profiles: profile }]);
      setDraft("");
      setIsOpen(true);
    } catch (err) {
      console.error("Failed posting feed comment:", err);
      setError("Could not post comment.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="feed-comments">
      <button
        type="button"
        className="feed-comments-toggle"
        onClick={() => setIsOpen((value) => !value)}
      >
        <span>{comments.length ? `${comments.length} comment${comments.length === 1 ? "" : "s"}` : "Comment"}</span>
        <em>{isOpen ? "Hide" : "Open"}</em>
      </button>

      {isOpen ? (
        <div className="feed-comments-panel">
          {loading ? <p className="feed-comments-muted">Loading comments...</p> : null}
          {error ? <p className="feed-comments-error">{error}</p> : null}

          {!loading && comments.length ? (
            <div className="feed-comments-list">
              {comments.map((comment) => {
                const profile = comment.profiles;
                const displayName = getProfileDisplayName(profile, "User");

                return (
                  <article key={comment.id} className="feed-comment">
                    {profile?.avatar_url ? (
                      <img src={profile.avatar_url} alt="" className="feed-comment-avatar" />
                    ) : (
                      <div className="feed-comment-avatar feed-comment-avatar-fallback">
                        {commenterInitial(profile, comment.user_id)}
                      </div>
                    )}
                    <div>
                      <div className="feed-comment-meta">
                        <strong>{displayName}</strong>
                        <span>{formatCommentDate(comment.created_at)}</span>
                      </div>
                      <p>{comment.body}</p>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : null}

          {!loading && !comments.length ? (
            <p className="feed-comments-muted">No comments yet. Be the first.</p>
          ) : null}

          <form className="feed-comment-form" onSubmit={handleSubmit}>
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Write a comment..."
              rows={2}
            />
            <button type="submit" disabled={!draft.trim() || submitting}>
              {submitting ? "Posting..." : "Post"}
            </button>
          </form>
        </div>
      ) : null}
    </section>
  );
}
