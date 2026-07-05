export function getProfileDisplayName(profile, fallback = "User") {
  return (
    profile?.display_name ||
    profile?.full_name ||
    profile?.username ||
    fallback
  );
}

export function getProfileHref(profile, fallbackUserId = null) {
  const slug = profile?.username || profile?.id || fallbackUserId;
  return slug ? `/u/${encodeURIComponent(slug)}` : "#";
}
