export function cleanText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function looksLikeOverview(text) {
  const value = cleanText(text);
  if (!value) return false;
  if (value.length > 120) return true;
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length > 16) return true;
  if (/[.!?]/.test(value) && words.length > 8) return true;
  return false;
}

export function looksLikeTitle(text) {
  const value = cleanText(text);
  if (!value) return false;
  if (looksLikeOverview(value)) return false;
  if (value.length > 80) return false;
  return true;
}

export function pickTitle(...candidates) {
  for (const candidate of candidates) {
    const value = cleanText(candidate);
    if (looksLikeTitle(value)) return value;
  }
  return cleanText(candidates[0]) || 'Unknown title';
}

export function pickOverview(...candidates) {
  for (const candidate of candidates) {
    const value = cleanText(candidate);
    if (value) return value;
  }
  return '';
}
