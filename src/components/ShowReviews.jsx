import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import ReviewThread from "./ReviewThread";

const config = {
  reviewTable: "show_reviews",
  voteTable: "show_review_votes",
  voteIdColumn: "review_id",
  itemColumn: "show_id",
  ratingTable: "burgr_ratings",
  sectionClass: "msd-reviews-section",
  headingClass: "msd-section-title",
  placeholder: "Write your review...",
  rows: 5,
};

export default function ShowReviews({ showId, currentUserId }) {
  const [canInteract, setCanInteract] = useState(false);
  const [checkingAccess, setCheckingAccess] = useState(Boolean(currentUserId && showId));

  useEffect(() => {
    let cancelled = false;

    async function checkAccess() {
      if (!currentUserId || !showId) {
        setCanInteract(false);
        setCheckingAccess(false);
        return;
      }

      setCheckingAccess(true);

      try {
        const { data, error } = await supabase
          .from("user_shows_new")
          .select("show_id")
          .eq("user_id", currentUserId)
          .eq("show_id", showId)
          .maybeSingle();

        if (error) throw error;
        if (!cancelled) setCanInteract(Boolean(data?.show_id));
      } catch (error) {
        console.warn("Failed checking review access:", error);
        if (!cancelled) setCanInteract(false);
      } finally {
        if (!cancelled) setCheckingAccess(false);
      }
    }

    checkAccess();

    return () => {
      cancelled = true;
    };
  }, [currentUserId, showId]);

  const interactionUserId = !checkingAccess && canInteract ? currentUserId : null;

  return (
    <ReviewThread
      config={config}
      itemId={showId}
      currentUserId={interactionUserId}
      heading="Reviews"
    />
  );
}
