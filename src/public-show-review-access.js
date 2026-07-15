const LOCKED_REVIEWS_SELECTOR =
  '#burgrs-show-community-portal [data-burgrs-replies-locked="true"]';
const LOCKED_MESSAGE = 'Add this show to My Shows to write reviews/replies';
const MOVED_TITLE_CLASS = 'burgrs-locked-review-title';

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

    ${LOCKED_REVIEWS_SELECTOR} .msd-reviews-section > .msd-section-title {
      display: none !important;
    }

    ${LOCKED_REVIEWS_SELECTOR} > .${MOVED_TITLE_CLASS} {
      margin: 0 0 18px;
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

    const originalTitle = section.querySelector(
      '.msd-reviews-section > .msd-section-title'
    );
    let movedTitle = Array.from(section.children).find((child) =>
      child.classList?.contains(MOVED_TITLE_CLASS)
    );

    if (originalTitle && directNotice) {
      if (!movedTitle) {
        movedTitle = document.createElement('h2');
        movedTitle.className = `msd-section-title ${MOVED_TITLE_CLASS}`;
        movedTitle.textContent = originalTitle.textContent || 'Reviews';
      }

      if (movedTitle.nextElementSibling !== directNotice) {
        section.insertBefore(movedTitle, directNotice);
      }
    }
  });

  document.querySelectorAll(`.${MOVED_TITLE_CLASS}`).forEach((title) => {
    if (!title.closest(LOCKED_REVIEWS_SELECTOR)) title.remove();
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
