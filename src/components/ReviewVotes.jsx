import { useState } from "react";
import { supabase } from "../lib/supabase";

async function getAuthenticatedUserId() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) throw error;
  if (!user?.id) throw new Error("You must be logged in to vote.");

  return user.id;
}

async function ensureProfileExists(userId) {
  if (!userId) return;

  const { data: existingProfile, error: readError } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle();

  if (readError) {
    console.warn("Could not check profile before voting:", readError);
    return;
  }

  if (existingProfile?.id) return;

  const { error: insertError } = await supabase.from("profiles").insert({
    id: userId,
  });

  if (insertError) {
    console.warn("Could not create missing profile before voting:", insertError);
  }
}

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

    const previousVote = myVote;
    const nextVote = previousVote === value ? null : value;

    setSaving(true);

    try {
      const authedUserId = await getAuthenticatedUserId();
      await ensureProfileExists(authedUserId);

      if (nextVote === null) {
        const { error } = await supabase
          .from(tableName)
          .delete()
          .eq(idColumn, itemId)
          .eq("user_id", authedUserId);

        if (error) throw error;
      } else {
        const { error } = await supabase.from(tableName).upsert(
          {
            [idColumn]: itemId,
            user_id: authedUserId,
            vote: nextVote,
          },
          { onConflict: `${idColumn},user_id` }
        );

        if (error) throw error;
      }

      onChanged?.(nextVote, previousVote);
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
