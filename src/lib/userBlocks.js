import { supabase } from "./supabase";

export async function loadBlockedUserIds(currentUserId) {
  if (!currentUserId) return new Set();

  const { data, error } = await supabase
    .from("user_blocks")
    .select("blocker_id, blocked_id")
    .or(`blocker_id.eq.${currentUserId},blocked_id.eq.${currentUserId}`);

  if (error) throw error;

  return new Set(
    (data || [])
      .map((row) =>
        String(row.blocker_id) === String(currentUserId)
          ? row.blocked_id
          : row.blocker_id
      )
      .filter(Boolean)
      .map(String)
  );
}

export function getRootOwnerId(rows, itemId) {
  const byId = new Map(
    (rows || []).map((row) => [String(row.id), row])
  );

  let current = byId.get(String(itemId));
  const visited = new Set();

  while (current?.parent_id && !visited.has(String(current.id))) {
    visited.add(String(current.id));
    const parent = byId.get(String(current.parent_id));
    if (!parent) break;
    current = parent;
  }

  return current?.user_id || null;
}

export async function usersAreBlocked(currentUserId, otherUserIds) {
  if (!currentUserId) return false;

  const uniqueIds = Array.from(
    new Set(
      (otherUserIds || [])
        .filter(Boolean)
        .map(String)
        .filter((id) => id !== String(currentUserId))
    )
  );

  for (const otherUserId of uniqueIds) {
    const { data, error } = await supabase.rpc("users_are_blocked", {
      p_user_a: currentUserId,
      p_user_b: otherUserId,
    });

    if (error) throw error;
    if (data === true) return true;
  }

  return false;
}
