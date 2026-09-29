// Two buttons that step through a long page, part by part, so a reader does
// not have to scroll the dashboard from Sales down to Recent activity by hand.
//
// A section opts in by carrying data-part="Its name"; the buttons find them in
// the order they appear and say where each one would land. Panels that sit
// side by side on a wide screen share a row, and a row is one landing — the
// same page steps through more landings on a phone, where they stack.

import { html, type SafeHTML } from '../../core/dom.js';
import { icon } from './icons.js';

/** How far below the sticky top bar a part sits once jumped to. */
const TOP_GAP = 84;

/** Parts whose tops are this close together are on the same row. */
const ROW_SLACK = 12;

/** A page with less than half a screen to scroll does not need the buttons. */
const WORTH_IT = 400;

interface Landing {
  el: HTMLElement;
  name: string;
  /** Distance from the top of the page, so it does not move as the page does. */
  top: number;
  /** The foot of the page rather than a part of it: nothing to focus there. */
  foot?: boolean;
}

/** A part hidden at this width — the phone list beside the desktop table — is not a stop. */
const onScreen = (el: HTMLElement): boolean => el.getClientRects().length > 0;

const atBottom = (): boolean =>
  window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;

/**
 * The parts in the order they are read, with everything sharing a row folded
 * into its first one. Sorted by where they sit rather than by where they are
 * written: a two-column grid puts the second column's panels between the
 * first column's in the markup, but above or below them on screen.
 */
function landings(): Landing[] {
  const found = [...document.querySelectorAll<HTMLElement>('[data-part]')]
    .filter(onScreen)
    .map((el) => ({ el, name: el.dataset.part || 'the next part', top: Math.round(el.getBoundingClientRect().top + window.scrollY) }))
    .sort((a, b) => a.top - b.top);

  const list: Landing[] = [];
  found.forEach((landing) => {
    const last = list[list.length - 1];
    if (last && landing.top - last.top <= ROW_SLACK) return;
    list.push(landing);
  });

  // A last part that runs on for screens — a long table of bookings — needs a
  // stop at its end, or the button would give up with the page still moving.
  const last = list[list.length - 1];
  const page = document.documentElement.scrollHeight;
  if (last && page - last.top > window.innerHeight * 1.5) {
    list.push({ el: last.el, name: 'the end of the page', top: page, foot: true });
  }

  // Everything inside the last screenful lands in the same place, because the
  // page cannot scroll any further. Keep the first of them — reaching it means
  // reaching the rest — and drop the others, so stepping always moves.
  const furthest = Math.max(0, page - window.innerHeight);
  const beyond = list.findIndex((landing) => landing.top - TOP_GAP >= furthest);
  return beyond === -1 ? list : list.slice(0, beyond + 1);
}

/** The landing being read: the last one whose top has passed the top bar. */
function currentIndex(list: Landing[]): number {
  // The foot of the page is the last landing by definition: nothing below it
  // can be scrolled to, which is why the list stops there.
  if (atBottom()) return list.length - 1;
  const line = window.scrollY + TOP_GAP + 1;
  let index = 0;
  list.forEach((landing, at) => {
    if (landing.top <= line) index = at;
  });
  return index;
}

function goTo({ el, top, foot }: Landing, first: boolean): void {
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Going all the way up should show the page's own heading, not just the
  // first part sitting under the top bar.
  window.scrollTo({ top: first ? 0 : Math.max(0, top - TOP_GAP), behavior: still ? 'auto' : 'smooth' });
  if (foot) return;
  // Take the keyboard and the screen reader along, not just the view.
  el.setAttribute('tabindex', '-1');
  el.focus({ preventScroll: true });
}

/**
 * Where each button would go, or undefined when it has nowhere left. Down is
 * spent at the foot of the page however many landings are left: the last few
 * can share the final screenful, and there is nothing to scroll to when they
 * are already on it.
 */
function targets(list: Landing[]): { at: number; up?: Landing; down?: Landing } {
  const at = currentIndex(list);
  return { at, up: list[at - 1], down: atBottom() ? undefined : list[at + 1] };
}

/** Moves one landing up (-1) or down (1). */
export function jumpBy(step: -1 | 1): void {
  const list = landings();
  const { at, up, down } = targets(list);
  const target = step === -1 ? up : down;
  if (target) goTo(target, at + step === 0);
}

/**
 * Shows or hides the buttons and says where each one goes. Called after every
 * render and on scroll, because both change the answer.
 */
export function refreshJump(): void {
  const nav = document.querySelector<HTMLElement>('[data-slot="jump"]');
  if (!nav) return;
  const list = landings();
  const enoughToScroll = document.documentElement.scrollHeight > window.innerHeight + WORTH_IT;
  const { up, down } = targets(list);
  // Two dead buttons are worse than none: that happens when the only landing
  // left to reach is already on screen.
  nav.hidden = list.length < 2 || !enoughToScroll || (!up && !down);
  if (nav.hidden) return;

  ([['jump-up', up], ['jump-down', down]] as const).forEach(([action, target]) => {
    const button = nav.querySelector<HTMLButtonElement>(`[data-action="${action}"]`);
    if (!button) return;
    const where = action === 'jump-up' ? 'Up' : 'Down';
    button.disabled = !target;
    button.title = target ? `${where} to ${target.name}` : `Nothing further ${where.toLowerCase()}`;
    button.setAttribute('aria-label', button.title);
  });
}

/** The buttons themselves, parked in a corner of the shell. */
export function jumpControl(): SafeHTML {
  return html`
    <nav class="jump" data-slot="jump" aria-label="Jump between the parts of this page" hidden>
      <button class="jump__btn" type="button" data-action="jump-up" aria-label="Up to the previous part">${icon('chevronUp')}</button>
      <button class="jump__btn" type="button" data-action="jump-down" aria-label="Down to the next part">${icon('chevronDown')}</button>
    </nav>`;
}
