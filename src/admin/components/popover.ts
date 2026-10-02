// Places a pop-up next to the button that opened it, instead of in the middle
// of the screen: under the button, or above it when there is no room below,
// lined up with its left edge and never off the screen. It follows the button
// if the page scrolls or the window changes size, until the pop-up closes.

const GAP = 8;
const MARGIN = 12;

function place(popup: HTMLElement, anchor: HTMLElement): void {
  const box = anchor.getBoundingClientRect();
  const width = popup.offsetWidth;
  const height = popup.offsetHeight;
  const below = window.innerHeight - box.bottom - GAP - MARGIN;
  const above = box.top - GAP - MARGIN;
  const top = below >= height || below >= above ? box.bottom + GAP : box.top - GAP - height;
  const left = Math.min(Math.max(MARGIN, box.left), window.innerWidth - width - MARGIN);
  popup.style.top = `${Math.max(MARGIN, Math.round(top))}px`;
  popup.style.left = `${Math.round(left)}px`;
  popup.dataset.side = top >= box.bottom ? 'below' : 'above';
}

const following = new WeakSet<HTMLElement>();

/** Puts `popup` (a fixed-position element) by `anchor`, and keeps it there while open. */
export function placeNear(popup: HTMLElement, anchor: HTMLElement | null): void {
  if (!anchor?.isConnected) return;
  popup.classList.add('is-anchored');
  place(popup, anchor);
  if (following.has(popup)) return;
  following.add(popup);
  const follow = () => {
    if (!popup.isConnected || (popup instanceof HTMLDialogElement && !popup.open)) {
      window.removeEventListener('scroll', follow, true);
      window.removeEventListener('resize', follow);
      return;
    }
    // The button may have been redrawn: find it again by what it does.
    const target = anchor.isConnected ? anchor : document.querySelector<HTMLElement>(popup.dataset.anchor ?? '');
    if (target) place(popup, target);
  };
  window.addEventListener('scroll', follow, true);
  window.addEventListener('resize', follow);
}
