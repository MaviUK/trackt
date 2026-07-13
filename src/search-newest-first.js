function getFirstAiredTimestamp(card) {
  const rows = Array.from(card.querySelectorAll('.search-result-meta-row'));
  const firstAiredRow = rows.find((row) => {
    const label = row.querySelector('.search-result-meta-label');
    return label?.textContent?.trim().toLowerCase() === 'first aired';
  });

  const value = firstAiredRow
    ?.querySelector('.search-result-meta-value')
    ?.textContent?.trim();

  if (!value) return Number.NEGATIVE_INFINITY;

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
}

function sortSearchResultsNewestFirst() {
  const list = document.querySelector('.search-results-list');
  if (!list) return;

  const cards = Array.from(list.children).filter((child) =>
    child.classList?.contains('search-result-banner-card')
  );

  if (cards.length