import ReviewThread from "./ReviewThread";

const config = {
  reviewTable: "episode_reviews",
  voteTable: "episode_review_votes",
  voteIdColumn: "review_id",
  itemColumn: "episode_id",
  ratingTable: "episode_ratings",
  sectionClass: "msd-episode-reviews-section",
  headingClass: "msd-episode-reviews-title",
  placeholder: "Write your episode review...",
  rows: 4,
};

export default function EpisodeReviews({ episodeId, currentUserId, episodeTitle }) {
  return (
    <ReviewThread
      config={config}
      itemId={episodeId}
      currentUserId={currentUserId}
      heading={`Episode reviews${episodeTitle ? `: ${episodeTitle}` : ""}`}
    />
  );
}
