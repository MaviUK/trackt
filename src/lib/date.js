export function formatDate(dateStr) {
  if (!dateStr) return "";

  const date = new Date(dateStr);

  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function getDaysUntil(dateStr) {
  if (!dateStr) return "";

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);

  const diff = Math.round((target - today) / (1000 * 60 * 60 * 24));

  if (diff === 0) return "TODAY";
  if (diff === 1) return "TOMORROW";
  if (diff > 1) return `IN ${diff} DAYS`;

  return "";
}
