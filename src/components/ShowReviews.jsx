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
  return (
    <ReviewThread
      config={config}
      itemId={showId}
      currentUserId={currentUserId}
      heading="Reviews"
    />
  );
}
