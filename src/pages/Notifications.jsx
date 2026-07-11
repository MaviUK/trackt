import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import {
  markNotificationsRead,
  shouldIgnoreNotificationError,
} from "../lib/notifications";
import "./Notifications.css";

const NOTIFICATIONS_CHANGED_EVENT = "burgrs:notifications-changed";

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

function getProfileName(profile) {
  return (
    profile?.display_name ||
    profile?.full_name ||
    profile?.username ||
    "Someone"
  );
}

function getNotificationTitle(item) {
  const actorName = getProfileName(item.actor_profile);
  const showName = item.show?.name || item.show_name || "this show";

  if (item.type === "review_reply") {
    return `${actorName} replied to ${showName} review`;
  }

  if (item.type === "chat_reply") {
    return `${actorName} replied in ${showName} chatboard`;
  }

  if (item.type === "follow") {
    return `${actorName} started following you`;
  }

  return item.title;
}

function buildShowRoute(show, item) {
  const params = new URLSearchParams({
    notificationType: item.type,
    notificationTarget: item.entity_id,
  });

  if (item.type === "review_reply") params.set("tab", "reviews");
  if (item.type === "chat_reply") params.set("chat", "1");

  if (show?.tmdb_id) {
    return `/my-shows/tmdb/${show.tmdb_id}?${params.toString()}`;
  }

  if (show?.tvdb_id) {
    return `/my-shows/${show.tvdb_id}?${params.toString()}`;
  }

  return item.url || "/notifications";
}

async function fetchRowsByIds(table, ids, columns) {
  if (!ids.length) return [];

  const { data, error } = await supabase
    .from(table)
    .select(columns)
    .in("id", ids);

  if (error) throw error;
  return data || [];
}

export default function Notifications() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const [tableMissing, setTableMissing] = useState(false);
  const [openingId, setOpeningId] = useState(null);

  const unreadIds = useMemo(
    () => items.filter((item) => !item.read_at).map((item) => item.id),
    [items]
  );

  function notifyBadgeChanged() {
    window.dispatchEvent(new CustomEvent(NOTIFICATIONS_CHANGED_EVENT));
  }

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
        .select(
          "id, recipient_user_id, actor_user_id, type, title, body, url, entity_table, entity_id, meta, read_at, created_at"
        )
        .eq("recipient_user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(60);

      if (loadError) throw loadError;

      const notificationRows = data || [];
      const actorIds = Array.from(
        new Set(notificationRows.map((item) => item.actor_user_id).filter(Boolean))
      );
      const reviewIds = notificationRows
        .filter((item) => item.type === "review_reply" && item.entity_id)
        .map((item) => item.entity_id);
      const chatIds = notificationRows
        .filter((item) => item.type === "chat_reply" && item.entity_id)
        .map((item) => item.entity_id);

      const [profileRows, reviewRows, chatRows] = await Promise.all([
        fetchRowsByIds(
          "profiles",
          actorIds,
          "id, username, full_name, display_name, avatar_url"
        ),
        fetchRowsByIds("show_reviews", reviewIds, "id, show_id"),
        fetchRowsByIds("show_chat_messages", chatIds, "id, show_id"),
      ]);

      const profileMap = new Map(
        profileRows.map((profile) => [String(profile.id), profile])
      );
      const targetShowMap = new Map();

      reviewRows.forEach((row) => {
        if (row?.id && row?.show_id) {
          targetShowMap.set(String(row.id), row.show_id);
        }
      });
      chatRows.forEach((row) => {
        if (row?.id && row?.show_id) {
          targetShowMap.set(String(row.id), row.show_id);
        }
      });

      const showIds = Array.from(
        new Set(
          notificationRows
            .map(
              (item) =>
                item?.meta?.show_id ||
                targetShowMap.get(String(item.entity_id || "")) ||
                null
            )
            .filter(Boolean)
        )
      );

      const showRows = await fetchRowsByIds(
        "shows",
        showIds,
        "id, name, tvdb_id, tmdb_id, poster_url"
      );
      const showMap = new Map(
        showRows.map((show) => [String(show.id), show])
      );

      const enrichedItems = notificationRows.map((item) => {
        const showId =
          item?.meta?.show_id ||
          targetShowMap.get(String(item.entity_id || "")) ||
          null;

        return {
          ...item,
          actor_profile:
            profileMap.get(String(item.actor_user_id || "")) || null,
          show: showId ? showMap.get(String(showId)) || null : null,
        };
      });

      setItems(enrichedItems);
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
        current.map((item) =>
          item.read_at ? item : { ...item, read_at: now }
        )
      );
      notifyBadgeChanged();
    }
  }

  async function resolveNotificationDestination(item) {
    if (
      !item?.entity_id ||
      !["review_reply", "chat_reply"].includes(item.type)
    ) {
      return item.url || "/notifications";
    }

    if (item.show) return buildShowRoute(item.show, item);

    const table =
      item.type === "chat_reply" ? "show_chat_messages" : "show_reviews";
    const { data: targetRow, error: targetError } = await supabase
      .from(table)
      .select("id, show_id")
      .eq("id", item.entity_id)
      .maybeSingle();

    if (targetError || !targetRow?.show_id) {
      if (targetError) {
        console.warn("Failed resolving notification target", targetError);
      }
      return item.url || "/notifications";
    }

    const { data: show, error: showError } = await supabase
      .from("shows")
      .select("id, name, tvdb_id, tmdb_id")
      .eq("id", targetRow.show_id)
      .maybeSingle();

    if (showError) {
      console.warn("Failed resolving notification show", showError);
      return item.url || "/notifications";
    }

    return buildShowRoute(show, item);
  }

  async function openNotification(item, event) {
    event.preventDefault();
    if (openingId) return;

    setOpeningId(item.id);
    setError("");

    try {
      if (!item.read_at) {
        const result = await markNotificationsRead([item.id]);
        if (result.ok) {
          const now = new Date().toISOString();
          setItems((current) =>
            current.map((currentItem) =>
              currentItem.id === item.id
                ? { ...currentItem, read_at: now }
                : currentItem
            )
          );
          notifyBadgeChanged();
        }
      }

      const destination = await resolveNotificationDestination(item);
      navigate(destination);
    } catch (err) {
      console.error("Failed opening notification:", err);
      setError(err.message || "Could not open this notification.");
    } finally {
      setOpeningId(null);
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
          <button
            type="button"
            onClick={markAllRead}
            className="notifications-mark-read"
          >
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
            const actorName = getProfileName(item.actor_profile);
            const avatarUrl = item.actor_profile?.avatar_url || "";
            const initial = actorName.slice(0, 1).toUpperCase();
            const card = (
              <>
                <div className="notification-icon" aria-hidden="true">
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt=""
                      className="notification-avatar"
                    />
                  ) : (
                    <span className="notification-avatar-fallback">
                      {initial}
                    </span>
                  )}
                </div>
                <div className="notification-body">
                  <div className="notification-topline">
                    <strong>{getNotificationTitle(item)}</strong>
                    {!item.read_at ? (
                      <span
                        className="notification-unread-dot"
                        aria-label="Unread"
                      />
                    ) : null}
                  </div>
                  {item.type !== "review_reply" && item.body ? (
                    <p>{item.body}</p>
                  ) : null}
                  <small>{formatDate(item.created_at)}</small>
                </div>
              </>
            );

            return (
              <a
                key={item.id}
                href={item.url || "/notifications"}
                onClick={(event) => openNotification(item, event)}
                className={`notification-card${
                  item.read_at ? "" : " is-unread"
                }${openingId === item.id ? " is-opening" : ""}`}
                aria-busy={openingId === item.id}
              >
                {card}
              </a>
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
