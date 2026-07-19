from pathlib import Path
import re

path = Path("src/pages/Rankd.jsx")
text = path.read_text()

replacement = r'''function getFocusedPair(items, focusShowId, focus = null) {
  const sorted = [...items].sort(sortByLadder);
  const focusIndex = sorted.findIndex(
    (show) => String(show.show_id) === String(focusShowId)
  );
  if (focusIndex === -1) return [];

  const focusShow = sorted[focusIndex];
  const testedIds = new Set((focus?.testedIds || []).map(String));
  const beatenIds = new Set((focus?.beatenIds || []).map(String));
  const lostToIds = new Set((focus?.lostToIds || []).map(String));

  const isAvailable = (index) => {
    const show = sorted[index];
    return (
      show &&
      String(show.show_id) !== String(focusShowId) &&
      !testedIds.has(String(show.show_id))
    );
  };

  const makePair = (opponent) =>
    Math.random() > 0.5
      ? [focusShow, opponent]
      : [opponent, focusShow];

  const lostIndexes = sorted
    .map((show, index) => (lostToIds.has(String(show.show_id)) ? index : -1))
    .filter((index) => index >= 0 && index < focusIndex);

  const beatenIndexes = sorted
    .map((show, index) => (beatenIds.has(String(show.show_id)) ? index : -1))
    .filter((index) => index > focusIndex);

  const closestLossAbove = lostIndexes.length ? Math.max(...lostIndexes) : null;
  const closestWinBelow = beatenIndexes.length ? Math.min(...beatenIndexes) : null;

  // Once both sides of the final position are known, compare near the
  // middle of that bracket rather than moving one position at a time.
  if (closestLossAbove != null && closestWinBelow != null) {
    const middle = Math.floor((closestLossAbove + closestWinBelow) / 2);
    const bracketCandidates = [];

    for (let distance = 0; distance <= closestWinBelow - closestLossAbove; distance += 1) {
      bracketCandidates.push(middle - distance, middle + distance);
    }

    const bracketIndex = bracketCandidates.find(
      (index, candidateIndex, list) =>
        list.indexOf(index) === candidateIndex &&
        index > closestLossAbove &&
        index < closestWinBelow &&
        isAvailable(index)
    );

    if (bracketIndex != null) return makePair(sorted[bracketIndex]);
  }

  const baseJump = Math.min(20, Math.max(4, Math.floor(sorted.length / 5)));
  const jumpSizes = [...new Set([
    baseJump,
    Math.max(10, Math.ceil(baseJump / 2)),
    5,
    2,
    1,
  ])].filter((distance) => distance > 0);

  let directions = [-1, 1];

  // A win means the selected show may belong higher; a loss means it may
  // belong lower. Search broadly in that direction before narrowing down.
  if (beatenIds.size && !lostToIds.size) directions = [-1, 1];
  if (lostToIds.size && !beatenIds.size) directions = [1, -1];

  for (const distance of jumpSizes) {
    for (const direction of directions) {
      const candidateIndex = focusIndex + direction * distance;
      if (isAvailable(candidateIndex)) return makePair(sorted[candidateIndex]);
    }
  }

  // If the exact jump points have already been tested, choose the furthest
  // remaining untested title in the preferred direction, then work inward.
  for (const direction of directions) {
    const candidates = sorted
      .map((show, index) => ({ show, index, distance: Math.abs(index - focusIndex) }))
      .filter(({ index }) =>
        direction < 0 ? index < focusIndex && isAvailable(index) : index > focusIndex && isAvailable(index)
      )
      .sort((a, b) => b.distance - a.distance);

    if (candidates.length) return makePair(candidates[0].show);
  }

  return [];
}

function moveShowToRank'''

pattern = r'function getFocusedPair\(items, focusShowId, focus = null\) \{.*?\n\}\n\nfunction moveShowToRank'
text, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
if count != 1:
    raise SystemExit("getFocusedPair function was not found")

path.write_text(text)
