import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import ReviewThread from "./ReviewThread";

const REVIEW_SORT_STORAGE_KEY = "burgrs-show-review-sort";

const sortOptions = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "rating-high", label: "Highest rated" },
  { value: "rating-low", label: "Lowest rated" },
];

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

function getInitialSort() {
  try {
    const saved = window.localStorage.getItem(REVIEW_SORT_STORAGE_KEY);
    return sortOptions.some((option) => option.value === saved) ? saved : "newest";
  } catch {
    return "newest";
  }
}

function getReviewValues(reviewElement) {
  const ratingText = reviewElement.querySelector(".msd-review-rating")?.textContent || "";
  const dateText = reviewElement.querySelector(".msd-review-date")?.textContent || "";
  const rating = Number.parseFloat(ratingText.replace("%", ""));
  const date = Date.parse(dateText);

  return {
    rating: Number.isFinite(rating) ? rating : null,
    date: Number.isFinite(date) ? date : 0,
  };
}

function applyReviewSort(container, sortOrder) {
  const reviewList = container?.querySelector(".msd-review-list");
  if (!reviewList) return;

  const rootReviews = Array.from(reviewList.children).filter((element) =>
    element.classList.contains("msd-review-item")
  );

  const ranked = rootReviews
    .map((element, originalIndex) => ({
      element,
      originalIndex,
      ...getReviewValues(element),
    }))
    .sort((a, b) => {
      if (sortOrder === "oldest") return a.date - b.date || a.originalIndex - b.originalIndex;
      if (sortOrder === "rating-high") {
        if (a.rating === null && b.rating === null) return b.date - a.date;
        if (a.rating === null) return 1;
        if (b.rating === null) return -1;
        return b.rating - a.rating || b.date - a.date;
      }
      if (sortOrder === "rating-low") {
        if (a.rating === null && b.rating === null) return b.date - a.date;
        if (a.rating === null) return 1;
        if (b.rating === null) return -1;
        return a.rating - b.rating || b.date - a.date;
      }
      return b.date - a.date || a.originalIndex - b.originalIndex;
    });

  ranked.forEach(({ element }, index) => {
    element.style.order = String(index);
  });
}

export default function ShowReviews({ showId, currentUserId }) {
  const [canInteract, setCanInteract] = useState(false);
  const [checkingAccess, setCheckingAccess] = useState(Boolean(currentUserId && showId));
  const [sortOrder, setSortOrder] = useState(getInitialSort);
  const sectionRef = useRef(null);

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

  useEffect(() => {
    try {
      window.localStorage.setItem(REVIEW_SORT_STORAGE_KEY, sortOrder);
    } catch {
      // Sorting still works when storage is unavailable.
    }

    const container = sectionRef.current;
    if (!container) return undefined;

    const sortReviews = () => applyReviewSort(container, sortOrder);
    sortReviews();

    const observer = new MutationObserver(sortReviews);
    observer.observe(container, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, [sortOrder, showId]);

  const interactionUserId = !checkingAccess && canInteract ? currentUserId : null;

  return (
    <div ref={sectionRef}>
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          alignItems: "center",
          marginBottom: "12px",
        }}
      >
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            color: "#cbd5e1",
            fontSize: "0.9rem",
            fontWeight: 700,
          }}
        >
          Sort
          <select
            aria-label="Sort reviews"
            value={sortOrder}
            onChange={(event) => setSortOrder(event.target.value)}
            style={{
              minHeight: "40px",
              border: "1px solid #2b3954",
              borderRadius: "12px",
              background: "#182235",
              color: "#f8fafc",
              padding: "8px 34px 8px 12px",
              font: "inherit",
              fontWeight: 700,
            }}
          >
            {sortOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <ReviewThread
        config={config}
        itemId={showId}
        currentUserId={interactionUserId}
        heading="Reviews"
      />
    </div>
  );
}
