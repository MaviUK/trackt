const MOBILE_VIEWPORT_QUERY = "(max-width: 768px)";
const SCROLLABLE_OVERFLOW = /^(auto|scroll|overlay)$/;

function isScrollableElement(element) {
  if (!(element instanceof HTMLElement)) return false;

  const { overflowY } = window.getComputedStyle(element);
  return (
    SCROLLABLE_OVERFLOW.test(overflowY) &&
    element.scrollHeight > element.clientHeight + 1
  );
}

function getScrollChain(target) {
  const chain = [];
  let element = target instanceof Element ? target : null;

  while (element && element !== document.documentElement) {
    if (isScrollableElement(element)) chain.push(element);
    element = element.parentElement;
  }

  const documentScroller = document.scrollingElement || document.documentElement;
  if (!chain.includes(documentScroller)) chain.push(documentScroller);

  return chain;
}

function canScrollInDirection(scroller, fingerDeltaY) {
  const scrollTop = scroller.scrollTop;
  const maxScrollTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);

  if (fingerDeltaY > 0) return scrollTop > 1;
  if (fingerDeltaY < 0) return scrollTop < maxScrollTop - 1;
  return true;
}

export function installMobileOverscrollGuard() {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return () => {};
  }

  const mobileViewport = window.matchMedia(MOBILE_VIEWPORT_QUERY);
  let touchX = 0;
  let touchY = 0;
  let scrollChain = [];
  let tracking = false;

  const handleTouchStart = (event) => {
    if (!mobileViewport.matches || event.touches.length !== 1) {
      tracking = false;
      scrollChain = [];
      return;
    }

    const touch = event.touches[0];
    touchX = touch.clientX;
    touchY = touch.clientY;
    scrollChain = getScrollChain(event.target);
    tracking = true;
  };

  const handleTouchMove = (event) => {
    if (!tracking || !mobileViewport.matches || event.touches.length !== 1) {
      return;
    }

    const touch = event.touches[0];
    const deltaX = touch.clientX - touchX;
    const deltaY = touch.clientY - touchY;

    touchX = touch.clientX;
    touchY = touch.clientY;

    if (Math.abs(deltaY) <= Math.abs(deltaX) || deltaY === 0) return;

    const hasScrollableRoom = scrollChain.some((scroller) =>
      canScrollInDirection(scroller, deltaY)
    );

    if (!hasScrollableRoom && event.cancelable) {
      event.preventDefault();
    }
  };

  const handleTouchEnd = () => {
    tracking = false;
    scrollChain = [];
  };

  document.addEventListener("touchstart", handleTouchStart, {
    passive: true,
    capture: true,
  });
  document.addEventListener("touchmove", handleTouchMove, {
    passive: false,
    capture: true,
  });
  document.addEventListener("touchend", handleTouchEnd, {
    passive: true,
    capture: true,
  });
  document.addEventListener("touchcancel", handleTouchEnd, {
    passive: true,
    capture: true,
  });

  return () => {
    document.removeEventListener("touchstart", handleTouchStart, true);
    document.removeEventListener("touchmove", handleTouchMove, true);
    document.removeEventListener("touchend", handleTouchEnd, true);
    document.removeEventListener("touchcancel", handleTouchEnd, true);
  };
}
