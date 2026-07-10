import { supabase } from "./lib/supabase";

let rankdLastShareUrl = "";
let rankdShareSheet = null;
let rankdCopiedTimer = null;
let rankdShareInFlight = false;

function isRankdShareUrl(value) {
  return typeof value === "string" && value.includes("/rankd/share/");
}

function makePairKey(firstId, secondId) {
  return [firstId, secondId].map(String).sort().join(":");
}

function getOrderedPair(firstId, secondId) {
  const [showAId, showBId] = [firstId, secondId].map(String).sort();
  return { showAId, showBId, pairKey: `${showAId}:${showBId}` };
}

function makeShareSlug(leftTitle, rightTitle) {
  const clean = (value) =>
    String(value || "show")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 50) || "show";

  return `${clean(leftTitle)}-vs-${clean(rightTitle)}-${Math.random().toString(36).slice(2, 8)}`;
}

function getRankdShareTitles() {
  const titles = Array.from(document.querySelectorAll(".rankd-page .rankd-card-title"))
    .map((element) => element.textContent?.trim())
    .filter(Boolean)
    .slice(0, 2);

  if (titles.length === 2) return titles;
  return ["this show", "that show"];
}

function getRankdShareCopy(url) {
  const [leftTitle, rightTitle] = getRankdShareTitles();
  const title = `${leftTitle} vs ${rightTitle} on BURGRS`;
  const text = `Which show wins: ${leftTitle} or ${rightTitle}? Vote on BURGRS.`;

  return { title, text, url };
}

function setRankdInlineShareStatus(message) {
  const form = document.querySelector(".rankd-page .rankd-comment-form");
  const actions = form?.querySelector(".rankd-comment-actions");
  if (!form || !actions) return;

  let status = form.querySelector(".rankd-share-helper-status");
  if (!status) {
    status = document.createElement("p");
    status.className = "rankd-muted rankd-share-helper-status";
    actions.insertAdjacentElement("afterend", status);
  }

  status.textContent = message || "";
  status.hidden = !message;
}

function getRankdShareButton(target) {
  const button = target?.closest?.("button");
  if (!button) return null;
  if (!document.querySelector(".rankd-page")?.contains(button)) return null;

  const label = button.textContent?.trim().toLowerCase() || "";
  return label.includes("share matchup") ? button : null;
}

async function findCurrentShowsByTitle(leftTitle, rightTitle) {
  const wanted = [leftTitle, rightTitle].filter(Boolean);
  if (wanted.length !== 2) throw new Error("Could not read this matchup.");

  const { data, error } = await supabase
    .from("shows")
    .select("id, name")
    .in("name", wanted);

  if (error) throw error;

  const rows = data || [];
  const left = rows.find((row) => row.name === leftTitle);
  const right = rows.find((row) => row.name === rightTitle);

  if (!left?.id || !right?.id) {
    throw new Error("Could not find both shows for this matchup.");
  }

  return { left, right };
}

async function createRankdShareUrl() {
  const [leftTitle, rightTitle] = getRankdShareTitles();
  const { left, right } = await findCurrentShowsByTitle(leftTitle, rightTitle);
  const { showAId, showBId, pairKey } = getOrderedPair(left.id, right.id);

  const { data: existing, error: existingError } = await supabase
    .from("rankd_matchups")
    .select("id, share_slug")
    .eq("pair_key", pairKey)
    .maybeSingle();

  if (existingError) throw existingError;

  const shareSlug = existing?.share_slug || makeShareSlug(leftTitle, rightTitle);

  if (existing?.id) {
    const { error: updateError } = await supabase
      .from("rankd_matchups")
      .update({ share_slug: shareSlug, is_shareable: true })
      .eq("id", existing.id);

    if (updateError) throw updateError;
  } else {
    const { error: insertError } = await supabase.from("rankd_matchups").insert({
      show_a_id: showAId,
      show_b_id: showBId,
      show_a_wins: 0,
      show_b_wins: 0,
      times_matched: 0,
      share_slug: shareSlug,
      is_shareable: true,
    });

    if (insertError) throw insertError;
  }

  return `${window.location.origin}/rankd/share/${shareSlug}`;
}

function openExternalShare(url) {
  window.open(url, "_blank", "noopener,noreferrer");
}

async function copyRankdShareLink(url, message = "Link copied") {
  try {
    await navigator.clipboard?.writeText(url);
    showRankdCopied(message);
  } catch {
    showRankdCopied("Copy failed");
  }
}

async function shareViaNativeOrCopy(title, text, url, platformName, fallbackUrl = "") {
  if (navigator.share) {
    try {
      await navigator.share({ title, text, url });
      closeRankdShareSheet();
      return;
    } catch (shareError) {
      const isCancel = String(shareError?.name || "").toLowerCase().includes("abort");
      if (isCancel) return;
    }
  }

  await copyRankdShareLink(url, `Link copied - paste it into ${platformName}`);
  if (fallbackUrl) {
    window.setTimeout(() => {
      openExternalShare(fallbackUrl);
    }, 450);
  }
}

async function shareToInstagram(title, text, url) {
  await shareViaNativeOrCopy(title, text, url, "Instagram", "https://www.instagram.com/");
}

async function shareToThreads(title, text, url) {
  await shareViaNativeOrCopy(title, text, url, "Threads", "https://www.threads.net/");
}

async function shareToMessenger(title, text, url) {
  await shareViaNativeOrCopy(title, text, url, "Messenger", "https://www.messenger.com/");
}

function showRankdCopied(message) {
  const copied = rankdShareSheet?.querySelector?.(".rankd-share-copied");
  if (!copied) return;

  copied.textContent = message;
  copied.hidden = false;

  window.clearTimeout(rankdCopiedTimer);
  rankdCopiedTimer = window.setTimeout(() => {
    copied.hidden = true;
  }, 2200);
}

function closeRankdShareSheet() {
  rankdShareSheet?.remove();
  rankdShareSheet = null;
}

function createShareButton(label, className, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `rankd-share-option ${className || ""}`.trim();
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}

function showRankdShareSheet(url) {
  if (!isRankdShareUrl(url)) return;

  rankdLastShareUrl = url;
  closeRankdShareSheet();

  const { title, text } = getRankdShareCopy(url);
  const encodedUrl = encodeURIComponent(url);
  const encodedText = encodeURIComponent(text);
  const encodedTitle = encodeURIComponent(title);
  const combinedText = encodeURIComponent(`${text}\n${url}`);

  const overlay = document.createElement("div");
  overlay.className = "rankd-share-sheet-overlay";

  const sheet = document.createElement("div");
  sheet.className = "rankd-share-sheet";
  sheet.setAttribute("role", "dialog");
  sheet.setAttribute("aria-modal", "true");
  sheet.setAttribute("aria-label", "Share Rank'd matchup");

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "rankd-share-close";
  closeButton.setAttribute("aria-label", "Close share options");
  closeButton.textContent = "×";

  const heading = document.createElement("h2");
  heading.textContent = "Share matchup";

  const intro = document.createElement("p");
  intro.textContent = text;

  const options = document.createElement("div");
  options.className = "rankd-share-options";

  const urlLabel = document.createElement("small");
  urlLabel.className = "rankd-share-url";
  urlLabel.textContent = url;

  const copied = document.createElement("strong");
  copied.className = "rankd-share-copied";
  copied.hidden = true;

  closeButton.addEventListener("click", closeRankdShareSheet);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) closeRankdShareSheet();
  });

  if (navigator.share) {
    options.appendChild(
      createShareButton("Share via phone", "rankd-share-native", async () => {
        try {
          await navigator.share({ title, text, url });
          closeRankdShareSheet();
        } catch (shareError) {
          const isCancel = String(shareError?.name || "").toLowerCase().includes("abort");
          if (!isCancel) showRankdCopied("Could not open share menu");
        }
      })
    );
  }

  options.appendChild(
    createShareButton("Instagram", "rankd-share-instagram", () => {
      shareToInstagram(title, text, url);
    })
  );

  options.appendChild(
    createShareButton("Threads", "rankd-share-threads", () => {
      shareToThreads(title, text, url);
    })
  );

  options.appendChild(
    createShareButton("WhatsApp", "rankd-share-whatsapp", () => {
      openExternalShare(`https://wa.me/?text=${combinedText}`);
    })
  );

  options.appendChild(
    createShareButton("Facebook", "rankd-share-facebook", () => {
      openExternalShare(`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}&quote=${encodedText}`);
    })
  );

  options.appendChild(
    createShareButton("X", "rankd-share-x", () => {
      openExternalShare(`https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`);
    })
  );

  options.appendChild(
    createShareButton("Reddit", "rankd-share-reddit", () => {
      openExternalShare(`https://www.reddit.com/submit?url=${encodedUrl}&title=${encodedTitle}`);
    })
  );

  options.appendChild(
    createShareButton("Messenger", "rankd-share-messenger", () => {
      shareToMessenger(title, text, url);
    })
  );

  options.appendChild(
    createShareButton("Telegram", "rankd-share-telegram", () => {
      openExternalShare(`https://t.me/share/url?url=${encodedUrl}&text=${encodedText}`);
    })
  );

  options.appendChild(
    createShareButton("SMS", "rankd-share-sms", () => {
      window.location.href = `sms:?body=${combinedText}`;
    })
  );

  options.appendChild(
    createShareButton("Copy link", "rankd-share-copy", () => {
      copyRankdShareLink(url);
    })
  );

  sheet.appendChild(closeButton);
  sheet.appendChild(heading);
  sheet.appendChild(intro);
  sheet.appendChild(options);
  sheet.appendChild(urlLabel);
  sheet.appendChild(copied);
  overlay.appendChild(sheet);
  document.body.appendChild(overlay);
  rankdShareSheet = overlay;
}

async function handleRankdShareButtonClick(event) {
  const button = getRankdShareButton(event.target);
  if (!button || rankdShareInFlight) return;

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation?.();

  rankdShareInFlight = true;
  const originalText = button.textContent;
  button.textContent = "Preparing share...";
  button.disabled = true;
  setRankdInlineShareStatus("Preparing share options...");

  try {
    const shareUrl = await createRankdShareUrl();
    rankdLastShareUrl = shareUrl;
    setRankdInlineShareStatus("");
    showRankdShareSheet(shareUrl);
  } catch (shareError) {
    console.error("RANKD SOCIAL SHARE FAILED:", shareError);
    setRankdInlineShareStatus(shareError.message || "Could not create share link.");
  } finally {
    button.disabled = false;
    button.textContent = originalText;
    rankdShareInFlight = false;
  }
}

function patchRankdClipboardShare() {
  if (!navigator.clipboard?.writeText || navigator.clipboard.writeText.__rankdSharePatched) return;

  const originalWriteText = navigator.clipboard.writeText.bind(navigator.clipboard);

  async function patchedWriteText(value) {
    const result = await originalWriteText(value);

    if (isRankdShareUrl(value)) {
      rankdLastShareUrl = value;
      window.dispatchEvent(new CustomEvent("rankd:share-url-ready", { detail: { url: value } }));
    }

    return result;
  }

  patchedWriteText.__rankdSharePatched = true;
  navigator.clipboard.writeText = patchedWriteText;
}

if (typeof window !== "undefined") {
  patchRankdClipboardShare();

  document.addEventListener("click", handleRankdShareButtonClick, true);

  window.addEventListener("rankd:share-url-ready", (event) => {
    const url = event.detail?.url || rankdLastShareUrl;
    window.setTimeout(() => showRankdShareSheet(url), 80);
  });
}
