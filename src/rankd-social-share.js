let rankdLastShareUrl = "";
let rankdShareSheet = null;
let rankdCopiedTimer = null;

function isRankdShareUrl(value) {
  return typeof value === "string" && value.includes("/rankd/share/");
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

function openExternalShare(url) {
  window.open(url, "_blank", "noopener,noreferrer");
}

async function copyRankdShareLink(url) {
  try {
    await navigator.clipboard?.writeText(url);
    showRankdCopied("Link copied");
  } catch {
    showRankdCopied("Copy failed");
  }
}

function showRankdCopied(message) {
  const copied = rankdShareSheet?.querySelector?.(".rankd-share-copied");
  if (!copied) return;

  copied.textContent = message;
  copied.hidden = false;

  window.clearTimeout(rankdCopiedTimer);
  rankdCopiedTimer = window.setTimeout(() => {
    copied.hidden = true;
  }, 1800);
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
  overlay.innerHTML = `
    <div class="rankd-share-sheet" role="dialog" aria-modal="true" aria-label="Share Rank'd matchup">
      <button type="button" class="rankd-share-close" aria-label="Close share options">×</button>
      <h2>Share matchup</h2>
      <p>${text}</p>
      <div class="rankd-share-options"></div>
      <small class="rankd-share-url"></small>
      <strong class="rankd-share-copied" hidden></strong>
    </div>
  `;

  const closeButton = overlay.querySelector(".rankd-share-close");
  const options = overlay.querySelector(".rankd-share-options");
  const urlLabel = overlay.querySelector(".rankd-share-url");

  urlLabel.textContent = url;
  closeButton?.addEventListener("click", closeRankdShareSheet);
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
    createShareButton("WhatsApp", "rankd-share-whatsapp", () => {
      openExternalShare(`https://wa.me/?text=${combinedText}`);
    })
  );

  options.appendChild(
    createShareButton("X", "rankd-share-x", () => {
      openExternalShare(`https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`);
    })
  );

  options.appendChild(
    createShareButton("Facebook", "rankd-share-facebook", () => {
      openExternalShare(`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}&quote=${encodedText}`);
    })
  );

  options.appendChild(
    createShareButton("Telegram", "rankd-share-telegram", () => {
      openExternalShare(`https://t.me/share/url?url=${encodedUrl}&text=${encodedText}`);
    })
  );

  options.appendChild(
    createShareButton("Copy link", "rankd-share-copy", () => {
      copyRankdShareLink(url);
    })
  );

  document.body.appendChild(overlay);
  rankdShareSheet = overlay;
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

  window.addEventListener("rankd:share-url-ready", (event) => {
    const url = event.detail?.url || rankdLastShareUrl;
    window.setTimeout(() => showRankdShareSheet(url), 80);
  });
}
