export function formatDate(dateStr) {
  if (!dateStr) return "";

  const date = new Date(dateStr);

  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
