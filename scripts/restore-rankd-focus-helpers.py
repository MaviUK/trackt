from pathlib import Path

path = Path("src/pages/Rankd.jsx")
text = path.read_text()

if "function isFocusSettled(" not in text:
    marker = "function moveShowToRank(shows, showId, targetRank) {"
    helpers = '''function isFocusSettled(items, focus) {
  if (!focus) return false;
  const sorted = [...items].sort(sortByLadder);
  const index = sorted.findIndex(
    (show) => String(show.show_id) === String(focus.showId)
  );
  if (index === -1) return false;

  const above = sorted[index - 1];
  const below = sorted[index + 1];
  const lostToAbove =
    !above || (focus.lostToIds || []).includes(String(above.show_id));
  const beatBelow =
    !below || (focus.beatenIds || []).includes(String(below.show_id));

  return lostToAbove && beatBelow;
}

function getFocusedPair(items, focusShowId, focus = null) {
  const sorted = [...items].sort(sortByLadder);
  const focusIndex = sorted.findIndex(
    (show) => String(show.show_id) === String(focusShowId)
  );
  if (focusIndex === -1) return [];

  const focusShow = sorted[focusIndex];
  const testedIds = new Set((focus?.testedIds || []).map(String));
  const offsets = [-1, 1, -2, 2, -4, 4, -3, 3, -6, 6, -5, 5, -8, 8, -10, 10];

  let opponent = null;
  for (const offset of offsets) {
    const candidate = sorted[focusIndex + offset];
    if (
      candidate &&
      String(candidate.show_id) !== String(focusShowId) &&
      !testedIds.has(String(candidate.show_id))
    ) {
      opponent = candidate;
      break;
    }
  }

  if (!opponent) {
    opponent = sorted.find(
      (show) =>
        String(show.show_id) !== String(focusShowId) &&
        !testedIds.has(String(show.show_id))
    );
  }

  if (!opponent) return [];
  return Math.random() > 0.5
    ? [focusShow, opponent]
    : [opponent, focusShow];
}

'''
    if marker not in text:
        raise SystemExit("moveShowToRank marker not found")
    text = text.replace(marker, helpers + marker, 1)

state_marker = "  const [currentPair, setCurrentPair] = useState([]);"
if "const [rankFocus, setRankFocus]" not in text:
    if state_marker not in text:
        raise SystemExit("currentPair state marker not found")
    text = text.replace(
        state_marker,
        state_marker + "\n  const [rankFocus, setRankFocus] = useState(null);",
        1,
    )

path.write_text(text)
