const CREATOR_BIO_MAX = 160;
const COUNTER_ATTR = "data-creator-bio-counter";
const LEGACY_BIO_HIDDEN_ATTR = "data-legacy-bio-hidden";

let syncQueued = false;

function setReactTextareaValue(textarea, value) {
  const descriptor = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype,
    "value"
  );

  descriptor?.set?.call(textarea, value);
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
}

function findTextareaByLabel(labelText) {
  if (window.location.pathname !== "/profile/edit") return null;

  const expected = String(labelText || "").trim().toLowerCase();

  return Array.from(document.querySelectorAll("textarea")).find((textarea) => {
    const wrapper = textarea.closest("div");
    const label = wrapper?.querySelector(":scope > label");
    return label?.textContent?.trim().toLowerCase() === expected;
  });
}

function hideLegacyBioField() {
  const textarea = findTextareaByLabel("Bio");
  const wrapper = textarea?.closest("div");
  if (!wrapper) return;

  wrapper.hidden = true;
  wrapper.setAttribute(LEGACY_BIO_HIDDEN_ATTR, "true");
}

function findCreatorBioTextarea() {
  return findTextareaByLabel("Creator bio");
}

function updateCounter(textarea, counter) {
  const length = Math.min(textarea.value.length, CREATOR_BIO_MAX);
  const text = `${length}/${CREATOR_BIO_MAX}`;
  if (counter.textContent !== text) counter.textContent = text;
}

function installCreatorBioLimit() {
  hideLegacyBioField();

  const textarea = findCreatorBioTextarea();
  if (!textarea) return;

  textarea.maxLength = CREATOR_BIO_MAX;
  textarea.setAttribute("aria-describedby", "creator-bio-character-count");

  if (textarea.value.length > CREATOR_BIO_MAX) {
    setReactTextareaValue(textarea, textarea.value.slice(0, CREATOR_BIO_MAX));
  }

  let counter = textarea.parentElement?.querySelector(`[${COUNTER_ATTR}]`);
  if (!counter) {
    counter = document.createElement("div");
    counter.id = "creator-bio-character-count";
    counter.className = "creator-bio-character-count";
    counter.setAttribute(COUNTER_ATTR, "true");
    textarea.insertAdjacentElement("afterend", counter);
  }

  updateCounter(textarea, counter);

  if (textarea.dataset.creatorBioLimitInstalled !== "true") {
    textarea.dataset.creatorBioLimitInstalled = "true";
    textarea.addEventListener("input", () => {
      if (textarea.value.length > CREATOR_BIO_MAX) {
        setReactTextareaValue(textarea, textarea.value.slice(0, CREATOR_BIO_MAX));
        return;
      }
      updateCounter(textarea, counter);
    });
  }
}

function queueCreatorBioLimit() {
  if (syncQueued) return;
  syncQueued = true;

  window.requestAnimationFrame(() => {
    syncQueued = false;
    installCreatorBioLimit();
  });
}

if (typeof window !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", queueCreatorBioLimit, {
      once: true,
    });
  } else {
    queueCreatorBioLimit();
  }

  new MutationObserver(queueCreatorBioLimit).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  window.addEventListener("popstate", queueCreatorBioLimit);
  window.addEventListener("pageshow", queueCreatorBioLimit);
}
