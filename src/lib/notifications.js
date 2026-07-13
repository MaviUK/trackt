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

function isSoftDeleted(notification) {
  return Boolean(notification?.meta?.deleted_at);
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
  if (String(recipientUserId) === String(actorUserId)) {
    return { ok: true, skipped: true };
  }

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
      console.warn(
        "Notifications table is not available yet. Run supabase/notifications.sql.",
        error
      );
      return { ok: false, missingTable: true };
    }

    console.error("Failed creating notification:", error);
    return { ok: false, error };
  }

  return { ok: true };
}

export async function getUnreadNotificationCount(userId) {
  if (!userId) return 0;

  const { data, error } = await supabase
    .from("notifications")
    .select("id, meta")
    .eq("recipient_user_id", userId)
    .is("read_at", null)
    .limit(1000);

  if (error) {
    if (isNotificationsMissing(error)) return 0;
    console.error("Failed loading notification count:", error);
    return 0;
  }

  return (data || []).filter((notification) => !isSoftDeleted(notification)).length;
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
    if (isNotificationsMissing(error)) {
      return { ok: false, missingTable: true };
    }
    return { ok: false, error };
  }

  return { ok: true };
}

export async function deleteNotifications(notificationIds) {
  const ids = Array.from(new Set((notificationIds || []).filter(Boolean)));
  if (!ids.length) return { ok: true, deletedIds: [] };

  const { data: existingRows, error: loadError } = await supabase
    .from("notifications")
    .select("id, meta")
    .in("id", ids);

  if (loadError) {
    if (isNotificationsMissing(loadError)) {
      return { ok: false, missingTable: true };
    }
    return { ok: false, error: loadError };
  }

  const rows = existingRows || [];
  if (!rows.length) return { ok: true, deletedIds: ids };

  const { data: hardDeletedRows, error: hardDeleteError } = await supabase
    .from("notifications")
    .delete()
    .in("id", ids)
    .select("id");

  if (hardDeleteError && isNotificationsMissing(hardDeleteError)) {
    return { ok: false, missingTable: true };
  }

  const hardDeletedIds = new Set(
    (hardDeletedRows || []).map((row) => String(row.id))
  );
  const remainingRows = rows.filter(
    (row) => !hardDeletedIds.has(String(row.id))
  );

  if (remainingRows.length) {
    const deletedAt = new Date().toISOString();
    const softDeleteResults = await Promise.all(
      remainingRows.map(async (row) => {
        const nextMeta = {
          ...(row.meta && typeof row.meta === "object" ? row.meta : {}),
          deleted_at: deletedAt,
        };

        const { data, error } = await supabase
          .from("notifications")
          .update({ meta: nextMeta })
          .eq("id", row.id)
          .select("id")
          .maybeSingle();

        return { id: row.id, data, error };
      })
    );

    const failedResult = softDeleteResults.find(
      (result) => result.error || !result.data?.id
    );

    if (failedResult) {
      return {
        ok: false,
        error:
          failedResult.error ||
          new Error("The notification could not be permanently hidden."),
      };
    }
  }

  return { ok: true, deletedIds: ids };
}
