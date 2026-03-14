export function getShowStatus(show, episodes = []) {
  const now = new Date();

  const firstAired = show.first_aired ? new Date(show.first_aired) : null;

  if (firstAired && firstAired > now) {
    return "Upcoming";
  }

  const futureEpisode = episodes.find((ep) => {
    if (!ep.aired) return false;
    return new Date(ep.aired) > now;
  });

  if (futureEpisode) {
    return "Airing";
  }

  return "Ended";
}
