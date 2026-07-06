import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { markNotificationsRead, shouldIgnoreNotificationError } from "../lib/notifications";
import "./Notifications.css";

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function Notifications() {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const [tableMissing, setTableMissing] = useState(false);

  const unreadIds = useMemo(
    () => items.filter((item) => !item.read_at).map((item) => item.id),
    [items]
  );

  async function loadNotifications() {
    setLoading(true);
    setError("");
    setTableMissing(false);

    try {
      const { data: authData } = await supabase.auth.getUser();
      const user = authData?.user || null;
      if (!user?.id) {
        setItems([]);
        return;
      }

      const { data, error: loadError } = await supabase
        .from("notifications")
        .select("id, type, title, body, url, read_at, created_at")
        .eq("recipient_user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(60);

      if (loadError) throw loadError;
      setItems(data || []);
    } catch (err) {
      console.error("Failed loading notifications:", err);
      if (shouldIgnoreNotificationError(err)) {
        setTableMissing(true);
        setItems([]);
        return;
      }
      setError(err.message || "Failed loading notifications.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadNotifications();
  }, []);

  async function markAllRead() {
    if (!unreadIds.length) return;
    const result = await markNotificationsRead(unreadIds);
    if (result.ok) {
      const now = new Date().toISOString();
      setItems((current) =>
        current.map((item) => (item.read_at ? item : { ...item, read_at: now }))
      );
    }
  }

  return (
    <main className="notifications-page">
      <header className="notifications-header">
        <div>
          <h1>Notifications</h1>
          <p>Replies, follows, comments and other activity.</p>
        </div>
        {unreadIds.length ? (
          <button type="button" onClick={markAllRead} className="notifications-mark-read">
            Mark all read
          </button>
        ) : null}
      </header>

      {error ? <p className="notifications-error">{error}</p> : null}

      {tableMissing ? (
        <section className="notifications-empty">
          <h2>Notifications need setup</h2>
          <p>Run supabase/notifications.sql in Supabase SQL Editor.</p>
        </section>
      ) : loading ? (
        <p className="notifications-muted">Loading notifications...</p>
      ) : items.length ? (
        <section className="notifications-list">
          {items.map((item) => {
            const card = (
              <>
                <div className="notification-icon">!</div>
                <div className="notification-body">
                  <div className="notification-topline">
                    <strong>{item.title}</strong>
                    {!item.read_at ? <span className="notification-unread-dot" aria-label="Unread" /> : null}
                  </div>
                  {item.body ? <p>{item.body}</p> : null}
                  <small>{formatDate(item.created_at)}</small>
                </div>
              </>
            );

            return item.url ? (
              <Link key={item.id} to={item.url} className={`notification-card${item.read_at ? "" : " is-unread"}`}>
                {card}
              </Link>
            ) : (
              <article key={item.id} className={`notification-card${item.read_at ? "" : " is-unread"}`}>
                {card}
              </article>
            );
          })}
        </section>
      ) : (
        <section className="notifications-empty">
          <h2>No notifications yet</h2>
          <p>When people follow you or reply to you, they will appear here.</p>
        </section>
      )}
    </main>
  );
}
