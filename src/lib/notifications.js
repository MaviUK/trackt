import { supabase } from "./supabase";

function isNotificationsMissing(error) {
  const message = String(error?.message || "").toLowerCase();
  const details = String(error?.details || "").toLowerCase();
  const code = String(error?.code || "").toUpperCase();

  return (
    code === "PGRST205" ||
    code === "42P01" ||
    message.includes("notifications") ||
    details.includes("notifications") ||
    message.includes("schema cache") ||
    details.includes("schema cache")
  );
}

export function shouldIgnoreNotificationError(error) {
  return isNotificationsMissing(error);
}

export async function createNotification({
  recipientUserId,
  actorUserId,
  type,
  title,
  body = "",
  url = "",
  entityTable = "",
  entityId = null,
  meta = {},
}) {
  if (!recipientUserId || !actorUserId || !type || !title) return { ok: false };
  if (String(recipientUserId) === String(actorUserId)) return { ok: true, skipped: true };

  const payload = {
    recipient_user_id: recipientUserId,
    actor_user_id: actorUserId,
    type,
    title,
    body,
    url,
    entity_table: entityTable || null,
    entity_id: entityId || null,
    meta,
  };

  const { error } = await supabase.from("notifications").insert(payload);

  if (error) {
    if (isNotificationsMissing(error)) {
      console.warn("Notifications table is not available yet. Run supabase/notifications.sql.", error);
      return { ok: false, missingTable: true };
    }

    console.error("Failed creating notification:", error);
    return { ok: false, error };
  }

  return { ok: true };
}

export async function getUnreadNotificationCount(userId) {
  if (!userId) return 0;

  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("recipient_user_id", userId)
    .is("read_at", null);

  if (error) {
    if (isNotificationsMissing(error)) return 0;
    console.error("Failed loading notification count:", error);
    return 0;
  }

  return count || 0;
}

export async function markNotificationsRead(notificationIds) {
  const ids = (notificationIds || []).filter(Boolean);
  if (!ids.length) return { ok: true };

  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .in("id", ids)
    .is("read_at", null);

  if (error) {
    if (isNotificationsMissing(error)) return { ok: false, missingTable: true };
    return { ok: false, error };
  }

  return { ok: true };
}

export async function deleteNotifications(notificationIds) {
  const ids = (notificationIds || []).filter(Boolean);
  if (!ids.length) return { ok: true };

  const { error } = await supabase
    .from("notifications")
    .delete()
    .in("id", ids);

  if (error) {
    if (isNotificationsMissing(error)) return { ok: false, missingTable: true };
    return { ok: false, error };
  }

  return { ok: true };
}
