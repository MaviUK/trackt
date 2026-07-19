from pathlib import Path
import re

path = Path("src/pages/Rankd.jsx")
text = path.read_text()

replacement = '''  function startFocusedRanking(show) {
    if (!isLoggedIn) {
      setShowLoginModal(true);
      return;
    }

    const focus = {
      showId: show.show_id,
      showName: show.show_name,
      testedIds: [],
      beatenIds: [],
      lostToIds: [],
    };

    const pair = getFocusedPair(eligibleShows, show.show_id, focus);
    if (pair.length !== 2) {
      setNotice("No untested shows are available for this title.");
      return;
    }

    setRankFocus(focus);
    setCurrentPair(pair);
    setNotice(
      `Ranking ${show.show_name}. Keep choosing until its position is confirmed.`
    );
    window.scrollTo({ top: 0, behavior: "smooth" });
  }'''

text, count = re.subn(
    r"  function startFocusedRanking\(show\) \{.*?\n  \}",
    replacement,
    text,
    count=1,
    flags=re.S,
)
if count != 1:
    raise SystemExit("startFocusedRanking function not found")

path.write_text(text)
