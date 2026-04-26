import { useState } from "react";
import { supabase } from "../lib/supabase";

export default function ReviewVotes({
  tableName,
  idColumn,
  itemId,
  currentUserId,
  upCount = 0,
  downCount = 0,
  myVote = null,
  onChanged,
}) {
  const [saving, setSaving] = useState(false);

  async function vote(value) {
    if (!currentUserId || !itemId || saving) return;
    setSaving(true);

    try {
      if (myVote === value) {
        const { error } = await supabase
          .from(tableName)
          .delete()
          .eq(idColumn, itemId)
          .eq("user_id", currentUserId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from(tableName).upsert(
          {
            [idColumn]: itemId,
            user_id: currentUserId,
            vote: value,
          },
          { onConflict: `${idColumn},user_id` }
        );
        if (error) throw error;
      }

      await onChanged?.();
    } catch (err) {
      console.error("Failed saving vote:", err);
      alert(err.message || "Failed saving vote");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="msd-vote-actions" aria-label="Vote actions">
      <button
        type="button"
        className={`msd-vote-btn ${myVote === 1 ? "is-active" : ""}`}
        onClick={() => vote(1)}
        disabled={!currentUserId || saving}
        title={currentUserId ? "Agree" : "Log in to vote"}
      >
        👍 {upCount}
      </button>
      <button
        type="button"
        className={`msd-vote-btn ${myVote === -1 ? "is-active" : ""}`}
        onClick={() => vote(-1)}
        disabled={!currentUserId || saving}
        title={currentUserId ? "Disagree" : "Log in to vote"}
      >
        👎 {downCount}
      </button>
    </div>
  );
}
