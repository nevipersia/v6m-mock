// Places a pop-up next to the button that opened it, instead of in the middle
// of the screen: under the button, or above it when there is no room below,
// lined up with its left edge and never off the screen. When it fits on
// neither side it slides up over the button until it is all in view, and one
// taller than the window is capped to it and scrolls inside. It follows the
// button if the page scrolls or the window changes size, until it closes.

const GAP = 8;
const MARGIN = 12;

/** Where a pop-up of this height goes by a button: its top, and a height cap when the window is too short. */
export function verticalPlace(box: DOMRect, height: number): { top: number; side: 'below' | 'above'; maxHeight: number | null } {
  const viewport = window.innerHeight;
  const below = viewport - box.bottom - GAP - MARGIN;
  const above = box.top - GAP - MARGIN;
  if (below >= height) return { top: box.bottom + GAP, side: 'below', maxHeight: null };
  if (above >= height) return { top: box.top - GAP - height, side: 'above', maxHeight: null };
  // Fits on neither side: keep it whole on screen, over the button if need be.
  const room = viewport - MARGIN * 2;
  if (height >= room) return { top: MARGIN, side: 'below', maxHeight: room };
  return { top: viewport - MARGIN - height, side: 'below', maxHeight: null };
}

function place(popup: HTMLElement, anchor: HTMLElement): void {
  const box = anchor.getBoundingClientRect();
  // Measure at full height; a cap from an earlier, shorter window would hide rows.
  popup.style.maxHeight = '';
  const width = popup.offsetWidth;
  const { top, side, maxHeight } = verticalPlace(box, popup.offsetHeight);
  const left = Math.min(Math.max(MARGIN, box.left), window.innerWidth - width - MARGIN);
  popup.style.top = `${Math.round(top)}px`;
  popup.style.left = `${Math.round(Math.max(MARGIN, left))}px`;
  if (maxHeight !== null) popup.style.maxHeight = `${maxHeight}px`;
  popup.dataset.side = side;
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
