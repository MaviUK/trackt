from pathlib import Path
import re

path = Path("src/pages/Rankd.jsx")
text = path.read_text()

pattern = re.compile(
    r'''    const previousPairKey = currentPairKey;\n'''
    r'''    const nextPair = chooseFastPair\(\n'''
    r'''      updatedLadder,\n'''
    r'''      previousPairKey,\n'''
    r'''      recentShowIdsRef\.current,\n'''
    r'''      \[previousPairKey, \.\.\.recentPairKeysRef\.current\]\n'''
    r'''    \);'''
)

replacement = '''    const previousPairKey = currentPairKey;
    let nextFocus = rankFocus;
    let nextPair = [];

    if (rankFocus?.showId) {
      const focusWon = String(winner.show_id) === String(rankFocus.showId);
      const opponent = focusWon ? loser : winner;

      nextFocus = {
        ...rankFocus,
        testedIds: [
          ...new Set([
            ...(rankFocus.testedIds || []),
            String(opponent.show_id),
          ]),
        ],
        beatenIds: focusWon
          ? [
              ...new Set([
                ...(rankFocus.beatenIds || []),
                String(opponent.show_id),
              ]),
            ]
          : rankFocus.beatenIds || [],
        lostToIds: !focusWon
          ? [
              ...new Set([
                ...(rankFocus.lostToIds || []),
                String(opponent.show_id),
              ]),
            ]
          : rankFocus.lostToIds || [],
      };

      if (isFocusSettled(updatedLadder, nextFocus)) {
        nextFocus = null;
        setRankFocus(null);
        setNotice(
          `${rankFocus.showName || "This show"} is now in its confirmed position.`
        );
      } else {
        nextPair = getFocusedPair(updatedLadder, nextFocus.showId, nextFocus);
        if (nextPair.length === 2) {
          setRankFocus(nextFocus);
        } else {
          nextFocus = null;
          setRankFocus(null);
          setNotice(
            `${rankFocus.showName || "This show"} has no more untested opponents.`
          );
        }
      }
    }

    if (!nextFocus) {
      nextPair = chooseFastPair(
        updatedLadder,
        previousPairKey,
        recentShowIdsRef.current,
        [previousPairKey, ...recentPairKeysRef.current]
      );
    }'''

text, count = pattern.subn(replacement, text, count=1)
if count != 1:
    raise SystemExit("normal next pair block not found")

path.write_text(text)
