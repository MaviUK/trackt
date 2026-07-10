export async function shareActivity({ title, text, url }) {
  const absoluteUrl = url?.startsWith("http")
    ? url
    : `${window.location.origin}${url || window.location.pathname}`;

  const payload = {
    title: title || "BURGRS",
    text: text || "Check this out on BURGRS.",
    url: absoluteUrl,
  };

  if (navigator.share) {
    try {
      await navigator.share(payload);
      return { ok: true, copied: false };
    } catch (error) {
      const isCancel = String(error?.name || "").toLowerCase().includes("abort");
      if (isCancel) return { ok: false, cancelled: true };
    }
  }

  try {
    await navigator.clipboard?.writeText(`${payload.text}\n${absoluteUrl}`);
    return { ok: true, copied: true };
  } catch {
    return { ok: false, copied: false };
  }
}

export function getCreatorSharePath(profile, fallbackUserId = null, extra = "") {
  const slug = profile?.username || profile?.id || fallbackUserId;
  if (!slug) return "/";
  return `/u/${encodeURIComponent(slug)}${extra || ""}`;
}

export function getShowReviewSharePath(show, reviewId = null) {
  const base = show?.tmdb_id ? `/show/tmdb/${show.tmdb_id}` : `/show/${show?.id || show?.show_id || ""}`;
  if (!reviewId) return base;
  return `${base}?review=${encodeURIComponent(reviewId)}`;
}

export function makeReviewSharePayload({ review, show, profile }) {
  const creatorName =
    profile?.display_name ||
    profile?.full_name ||
    profile?.username ||
    "Someone";
  const showName = show?.name || show?.show_name || "a show";
  const body = String(review?.body || "").trim();
  const shortBody = body.length > 120 ? `${body.slice(0, 117)}...` : body;

  return {
    title: `${creatorName}'s review of ${showName} on BURGRS`,
    text: shortBody
      ? `${creatorName} reviewed ${showName}: "${shortBody}"`
      : `${creatorName} reviewed ${showName} on BURGRS.`,
    url: getShowReviewSharePath(show, review?.id),
  };
}

export function makeListSharePayload({ list, profile, fallbackUserId = null }) {
  const creatorName =
    profile?.display_name ||
    profile?.full_name ||
    profile?.username ||
    "Someone";
  const title = list?.title || "TV list";
  const itemCount = list?.items?.length || 0;
  const extra = list?.id ? `?list=${encodeURIComponent(list.id)}` : "";

  return {
    title: `${creatorName}'s ${title} on BURGRS`,
    text: `${creatorName} shared ${title}${itemCount ? ` with ${itemCount} show${itemCount === 1 ? "" : "s"}` : ""} on BURGRS.`,
    url: getCreatorSharePath(profile, fallbackUserId || list?.user_id, extra),
  };
}
