const LOCKED_REVIEWS_SELECTOR =
  '#burgrs-show-community-portal [data-burgrs-replies-locked="true"]';
const LOCKED_MESSAGE = 'Add this show to My Shows to write reviews/replies';

function installLockedReviewStyles() {
  if (document.getElementById('burgrs-public-review-access-styles')) return;

  const style = document.createElement('style');
  style.id = 'burgrs-public-review-access-styles';
  style.textContent = `
    ${LOCKED_REVIEWS_SELECTOR} .msd-reviews-section > .msd-review-form,
    ${LOCKED_REVIEWS_SELECTOR} .msd-reviews-section > .msd-review-login-note,
    ${LOCKED_REVIEWS_SELECTOR} .msd-review-reply-action,
    ${LOCKED_REVIEWS_SELECTOR} .msd-review-reply-form {
      display: none !important;
    }
  `;
  document.head.appendChild(style);
}

function syncLockedReviewMessage(root = document) {
  const lockedSections = root.matches?.(LOCKED_REVIEWS_SELECTOR)
    ? [root]
    : Array.from(root.querySelectorAll?.(LOCKED_REVIEWS_SELECTOR) || []);

  lockedSections.forEach((section) => {
    const directNotice = Array.from(section.children).find((child) =>
      child.classList?.contains('msd-review-login-note')
    );

    if (directNotice && directNotice.textContent !== LOCKED_MESSAGE) {
      directNotice.textContent = LOCKED_MESSAGE;
    }
  });
}

function blockLockedReviewSubmissions(event) {
  const form = event.target?.closest?.('.msd-review-form, .msd-review-reply-form');
  if (!form?.closest?.(LOCKED_REVIEWS_SELECTOR)) return;

  event.preventDefault();
  event.stopImmediatePropagation();
}

function startPublicShowReviewAccessGuard() {
  installLockedReviewStyles();
  syncLockedReviewMessage(document);

  document.addEventListener('submit', blockLockedReviewSubmissions, true);

  let frameId = null;
  const observer = new MutationObserver(() => {
    if (frameId !== null) return;

    frameId = window.requestAnimationFrame(() => {
      frameId = null;
      syncLockedReviewMessage(document);
    });
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startPublicShowReviewAccessGuard, {
      once: true,
    });
  } else {
    startPublicShowReviewAccessGuard();
  }
}
