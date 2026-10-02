// Motion for a desk that redraws everything on every change. Each render
// builds fresh markup, so an animation written into a class would replay on
// every keystroke; instead this marks only what is actually new after a render
// — a page, a month, a day, a period's figures — and CSS animates those marks.
//
//   .page--enter          the page was just opened
//   [data-enter] + .is-entering
//                         data-enter="slot|key" changed key since the last render
//   dialog.is-entering    a pop-up that was not open before this render

const keys = new Map<string, string>();
let lastPage = '';

const still = (): boolean => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Counts the page's figures up from nothing: "₱3,000", "12". A redraw in the
 * middle replaces the elements, so each frame finds them again by position and
 * keeps going on whatever is there now.
 */
function countUp(root: HTMLElement): void {
  const targets = [...root.querySelectorAll<HTMLElement>('[data-count-up]')].map((el) => {
    const match = /^(\D*)([\d,]+)(.*)$/.exec(el.textContent?.trim() ?? '');
    return match ? { before: match[1] ?? '', value: Number((match[2] ?? '').replace(/,/g, '')), after: match[3] ?? '' } : null;
  });
  const started = performance.now();
  const length = 700;
  const step = (now: number): void => {
    const t = Math.min(1, (now - started) / length);
    const eased = 1 - (1 - t) ** 3;
    root.querySelectorAll<HTMLElement>('[data-count-up]').forEach((el, index) => {
      const target = targets[index];
      if (!target || !target.value) return;
      el.textContent = `${target.before}${Math.round(target.value * eased).toLocaleString('en-US')}${target.after}`;
    });
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/** Call after every render of the app, with the page that was drawn. */
export function markEntering(root: HTMLElement, pageId: string, modalWasOpen: boolean): void {
  const newPage = pageId !== lastPage;
  lastPage = pageId;

  if (newPage) {
    keys.clear();
    root.querySelector('.page')?.classList.add('page--enter');
    if (!still()) countUp(root);
  }

  root.querySelectorAll<HTMLElement>('[data-enter]').forEach((el) => {
    const [slot = '', key = ''] = (el.dataset.enter ?? '').split('|');
    const before = keys.get(slot);
    if (before !== undefined && before !== key) el.classList.add('is-entering');
    keys.set(slot, key);
  });

  if (!modalWasOpen) root.querySelectorAll('dialog[data-modal]').forEach((dialog) => dialog.classList.add('is-entering'));
}
