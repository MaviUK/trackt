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

function buildTree(rows) {
  const byId = new Map();
  (rows || []).forEach((row) => byId.set(String(row.id), { ...row, replies: [] }));
  const roots = [];
  byId.forEach((row) => {
    const parentId = row.parent_id ? String(row.parent_id) : "";
    if (parentId && byId.has(parentId)) byId.get(parentId).replies.push(row);
    else roots.push(row);
  });
  return roots;
}

function ChatItem({ message, currentUserId, onReply, savingReplyId, onVoteChanged, depth = 0 }) {
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyBody, setReplyBody] = useState("");
  const profile = message.profile || {};
  const displayName = getDisplayName(profile, message.user_id);
  const avatarUrl = profile.avatar_url || "";
  const isSaving = savingReplyId === message.id;
  const canReply = currentUserId && String(message.user_id) !== String(currentUserId);

  async function submitReply(event) {
    event.preventDefault();
    const trimmed = replyBody.trim();
    if (!trimmed || !canReply) return;
    const ok = await onReply(message.id, trimmed);
    if (ok) {
      setReplyBody("");
      setReplyOpen(false);
    }
  }

  return (
    <article className={`msd-review-item ${depth > 0 ? "is-reply" : ""}`}>
      <div className="msd-review-body-wrap">
        <div className="msd-review-card msd-chat-card">
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
            </div>
            <span className="msd-review-date">{formatDateTime(message.created_at)}</span>
          </div>
          <p className="msd-review-text">{message.body}</p>
        </div>

        <div className="msd-review-actions">
          <ReviewVotes
            tableName="show_chat_message_votes"
            idColumn="message_id"
            itemId={message.id}
            currentUserId={currentUserId}
            upCount={message.up_count || 0}
            downCount={message.down_count || 0}
            myVote={message.my_vote ?? null}
            onChanged={onVoteChanged}
          />
          {canReply ? (
            <button type="button" className="msd-review-action" onClick={() => setReplyOpen((prev) => !prev)}>
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
              <button type="button" className="msd-btn msd-btn-secondary" onClick={() => { setReplyBody(""); setReplyOpen(false); }}>
                Cancel
              </button>
              <button type="submit" className="msd-btn msd-btn-primary" disabled={isSaving || !replyBody.trim()}>
                {isSaving ? "Sending..." : "Post reply"}
              </button>
            </div>
          </form>
        ) : null}

        {message.replies?.length > 0 ? (
          <div className="msd-review-replies">
            {message.replies.map((reply) => (
              <ChatItem
                key={reply.id}
                message={reply}
                currentUserId={currentUserId}
                onReply={onReply}
                savingReplyId={savingReplyId}
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

export default function ShowChatBoard({ showId, currentUserId }) {
  const [messages, setMessages] = useState([]);
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingReplyId, setSavingReplyId] = useState(null);
  const [error, setError] = useState("");

  async function loadMessages() {
    if (!showId) return;
    setLoading(true);
    setError("");
    try {
      const { data: rows, error: rowsError } = await supabase
        .from("show_chat_messages")
        .select("id, show_id, user_id, parent_id, body, created_at, updated_at")
        .eq("show_id", showId)
        .order("created_at", { ascending: true });
      if (rowsError) throw rowsError;

      const userIds = Array.from(new Set((rows || []).map((row) => row.user_id).filter(Boolean)));
      let profileMap = new Map();
      if (userIds.length) {
        const { data: profiles, error: profileError } = await supabase
          .from("profiles")
          .select("id, username, full_name, avatar_url")
          .in("id", userIds);
        if (profileError) throw profileError;
        profileMap = new Map((profiles || []).map((profile) => [String(profile.id), profile]));
      }

      const messageIds = (rows || []).map((row) => row.id).filter(Boolean);
      let voteMap = new Map();
      let myVoteMap = new Map();
      if (messageIds.length) {
        const { data: voteRows, error: voteError } = await supabase
          .from("show_chat_message_votes")
          .select("message_id, user_id, vote")
          .in("message_id", messageIds);
        if (voteError) throw voteError;
        (voteRows || []).forEach((voteRow) => {
          const key = String(voteRow.message_id);
          const current = voteMap.get(key) || { up: 0, down: 0 };
          if (Number(voteRow.vote) === 1) current.up += 1;
          if (Number(voteRow.vote) === -1) current.down += 1;
          voteMap.set(key, current);
          if (currentUserId && String(voteRow.user_id) === String(currentUserId)) {
            myVoteMap.set(key, Number(voteRow.vote));
          }
        });
      }

      setMessages((rows || []).map((row) => ({
        ...row,
        profile: profileMap.get(String(row.user_id)) || null,
        up_count: voteMap.get(String(row.id))?.up || 0,
        down_count: voteMap.get(String(row.id))?.down || 0,
        my_vote: myVoteMap.get(String(row.id)) ?? null,
      })));
    } catch (err) {
      console.error("Failed loading chatboard:", err);
      setError(err.message || "Failed loading chatboard");
      setMessages([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMessages();
    if (!showId) return undefined;

    const channel = supabase
      .channel(`show-chat-${showId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "show_chat_messages", filter: `show_id=eq.${showId}` },
        () => loadMessages()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "show_chat_message_votes" },
        () => loadMessages()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [showId, currentUserId]);

  const messageTree = useMemo(() => buildTree(messages), [messages]);

  async function postMessage(parentId, text) {
    const trimmed = text.trim();
    if (!currentUserId || !showId || !trimmed) return false;
    if (parentId) setSavingReplyId(parentId);
    else setSaving(true);
    setError("");
    try {
      const { error: insertError } = await supabase.from("show_chat_messages").insert({
        show_id: showId,
        user_id: currentUserId,
        parent_id: parentId || null,
        body: trimmed,
      });
      if (insertError) throw insertError;
      await loadMessages();
      return true;
    } catch (err) {
      console.error("Failed posting chat message:", err);
      setError(err.message || "Failed posting chat message");
      return false;
    } finally {
      setSaving(false);
      setSavingReplyId(null);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const ok = await postMessage(null, body);
    if (ok) setBody("");
  }

  return (
    <section className="msd-reviews-section msd-chatboard-section">
      <h2 className="msd-section-title">Live Chatboard</h2>
      <p className="msd-muted">Chat about this show in real time. Replies and votes update live for everyone.</p>

      {currentUserId ? (
        <form className="msd-review-form msd-chat-compose-form" onSubmit={handleSubmit}>
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Write a live chat message..."
            rows={3}
            maxLength={1000}
          />
          <div className="msd-review-form-actions msd-chat-compose-actions">
            <span className="msd-chat-count">{body.trim().length}/1000</span>
            <button type="submit" className="msd-btn msd-btn-primary msd-chat-post-btn" disabled={saving || !body.trim()}>
              {saving ? "Sending..." : "Post chat"}
            </button>
          </div>
        </form>
      ) : (
        <div className="msd-review-login-note">Log in to use the live chatboard.</div>
      )}

      {error ? <div className="msd-review-error">{error}</div> : null}

      {loading ? (
        <p className="msd-muted">Loading chatboard...</p>
      ) : messageTree.length > 0 ? (
        <div className="msd-review-list">
          {messageTree.map((message) => (
            <ChatItem
              key={message.id}
              message={message}
              currentUserId={currentUserId}
              onReply={postMessage}
              savingReplyId={savingReplyId}
              onVoteChanged={loadMessages}
            />
          ))}
        </div>
      ) : (
        <p className="msd-muted">No chat messages yet. Start the conversation.</p>
      )}
    </section>
  );
}
