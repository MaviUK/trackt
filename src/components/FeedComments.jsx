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

function commenterInitial(profile, userId) {
  const name = getProfileDisplayName(profile, "User") || String(userId || "U");
  return name.slice(0, 1).toUpperCase();
}

function configForTarget(targetType) {
  if (targetType === "post") {
    return {
      mode: "table",
      tableName: "post_comments",
      itemColumn: "post_id",
      buttonLabel: "Comments",
      placeholder: "Comment on this post...",
      missingMessage: "Post comments table has not been created yet.",
    };
  }

  if (targetType === "list") {
    return {
      mode: "table",
      tableName: "creator_list_comments",
      itemColumn: "list_key",
      buttonLabel: "Comments",
      placeholder: "Comment on this list...",
      missingMessage: "List comments table has not been created yet.",
    };
  }

  if (targetType === "review") {
    return {
      mode: "reply",
      tableName: "show_reviews",
      itemColumn: "show_id",
      parentColumn: "parent_id",
      buttonLabel: "Replies",
      placeholder: "Reply to this review...",
      missingMessage: "Review replies are not available yet.",
    };
  }

  if (targetType === "chatboard") {
    return {
      mode: "reply",
      tableName: "show_chat_messages",
      itemColumn: "show_id",
      parentColumn: "parent_id",
      buttonLabel: "Replies",
      placeholder: "Reply on the chatboard...",
      missingMessage: "Chatboard replies are not available yet.",
    };
  }

  return {
    mode: "table",
    tableName: "post_comments",
    itemColumn: "post_id",
    buttonLabel: "Comments",
    placeholder: "Write a comment...",
    missingMessage: "Comments table has not been created yet.",
  };
}

function getToggleLabel(config, count) {
  if (!count) return config.buttonLabel;
  if (config.mode === "reply") return `${count} repl${count === 1 ? "y" : "ies"}`;
  return `${count} comment${count === 1 ? "" : "s"}`;
}

export default function FeedComments({
  targetType,
  targetId,
  currentUserId,
  inline = false,
  hideToggle = false,
  isOpen: controlledOpen,
  onOpenChange,
}) {
  const config = useMemo(() => configForTarget(targetType), [targetType]);
  const [internalOpen, setInternalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [comments, setComments] = useState([]);
  const [parentItem, setParentItem] = useState(null);
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const isControlled = typeof controlledOpen === "boolean";
  const isOpen = isControlled ? controlledOpen : internalOpen;

  function setOpen(nextValue) {
    const value = typeof nextValue === "function" ? nextValue(isOpen) : nextValue;
    if (!isControlled) setInternalOpen(value);
    onOpenChange?.(value);
  }

  async function attachProfiles(rows) {
    const userIds = Array.from(new Set((rows || []).map((row) => row.user_id).filter(Boolean)));
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

    return (rows || []).map((row) => ({
      ...row,
      profiles: profileMap.get(String(row.user_id)) || { id: row.user_id },
    }));
  }

  async function loadTableComments() {
    const { data, error: commentsError } = await supabase
      .from(config.tableName)
      .select(`id, ${config.itemColumn}, user_id, body, created_at, updated_at`)
      .eq(config.itemColumn, String(targetId))
      .order("created_at", { ascending: true })
      .limit(50);

    if (commentsError) throw commentsError;
    setComments(await attachProfiles(data || []));
  }

  async function loadReplyComments() {
    const { data: parentRows, error: parentError } = await supabase
      .from(config.tableName)
      .select(`id, ${config.itemColumn}, user_id, body, created_at, updated_at`)
      .eq("id", targetId)
      .limit(1);

    if (parentError) throw parentError;
    const parent = parentRows?.[0] || null;
    setParentItem(parent);

    if (!parent) {
      setComments([]);
      return;
    }

    const { data, error: commentsError } = await supabase
      .from(config.tableName)
      .select(`id, ${config.itemColumn}, user_id, ${config.parentColumn}, body, created_at, updated_at`)
      .eq(config.parentColumn, targetId)
      .order("created_at", { ascending: true })
      .limit(50);

    if (commentsError) throw commentsError;
    setComments(await attachProfiles(data || []));
  }

  async function loadComments() {
    if (!targetId) return;
    setLoading(true);
    setError("");

    try {
      if (config.mode === "reply") await loadReplyComments();
      else await loadTableComments();
    } catch (err) {
      console.error("Failed loading comments:", err);
      if (isMissingTableError(err, config.tableName)) {
        setComments([]);
        return;
      }
      setError("Could not load comments.");
      setComments([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setComments([]);
    setDraft("");
    loadComments();
  }, [targetType, targetId]);

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
      let payload;

      if (config.mode === "reply") {
        const parent = parentItem;
        if (!parent?.[config.itemColumn]) throw new Error("Could not find the original item to reply to.");
        payload = {
          [config.itemColumn]: parent[config.itemColumn],
          [config.parentColumn]: targetId,
          user_id: userId,
          body,
        };
      } else {
        payload = {
          [config.itemColumn]: String(targetId),
          user_id: userId,
          body,
        };
      }

      const { error: insertError } = await supabase.from(config.tableName).insert(payload);

      if (insertError) {
        if (isMissingTableError(insertError, config.tableName)) {
          setError(config.missingMessage);
          return;
        }
        throw insertError;
      }

      setDraft("");
      setOpen(true);
      await loadComments();
    } catch (err) {
      console.error("Failed posting comment:", err);
      setError("Could not post comment.");
    } finally {
      setSubmitting(false);
    }
  }

  const toggle = hideToggle ? null : (
    <button
      type="button"
      className={inline ? "feed-comments-inline-toggle" : "feed-comments-toggle"}
      onClick={() => setOpen((value) => !value)}
      aria-expanded={isOpen}
    >
      <span>{getToggleLabel(config, comments.length)}</span>
      <em>{isOpen ? "⌃" : "⌄"}</em>
    </button>
  );

  const panel = isOpen ? (
    <div className={inline ? "feed-comments-panel feed-comments-inline-panel" : "feed-comments-panel"}>
      {loading ? <p className="feed-comments-muted">Loading...</p> : null}
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
        <p className="feed-comments-muted">No {config.mode === "reply" ? "replies" : "comments"} yet.</p>
      ) : null}

      <form className="feed-comment-form" onSubmit={handleSubmit}>
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={config.placeholder}
          rows={2}
          maxLength={1000}
        />
        <button type="submit" disabled={!draft.trim() || submitting}>
          {submitting ? "Posting..." : config.mode === "reply" ? "Post reply" : "Post"}
        </button>
      </form>
    </div>
  ) : null;

  if (inline) {
    return (
      <>
        {toggle}
        {panel}
      </>
    );
  }

  return (
    <section className="feed-comments">
      {toggle}
      {panel}
    </section>
  );
}
