// Outline icons (24×24, stroke = currentColor).

import { raw, type SafeHTML } from '../../core/dom.js';

const PATHS = {
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01"/>',
  inbox: '<path d="M4 13h4l2 3h4l2-3h4"/><path d="M6.5 5h11L20 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-5z"/>',
  sparkles: '<path d="M12 3l1.8 4.7 4.7 1.8-4.7 1.8L12 16l-1.8-4.7-4.7-1.8 4.7-1.8z"/><path d="M18.5 15l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/>',
  broom: '<path d="M19 3l-7.5 7.5"/><path d="M9.5 9.5l5 5-2.5 6.5-9-9z"/><path d="M6 15l3 3"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  logout: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H4"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.7-4.7L3 9M3 4v5h5M4 13a8 8 0 0 0 14.7 4.7L21 15M21 20v-5h-5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  alert: '<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/>',
  check: '<path d="M5 12l5 5L20 7"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
  message: '<path d="M4 5h16v11H9l-5 4z"/>',
  wallet: '<rect x="3" y="6" width="18" height="14" rx="2"/><path d="M16 13h2M3 10h18M7 6V4h10v2"/>',
  arrowRight: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  chevronLeft: '<path d="M15 6l-6 6 6 6"/>',
  chevronRight: '<path d="M9 6l6 6-6 6"/>',
  key: '<circle cx="8" cy="12" r="4"/><path d="M12 12h9M17 12v4M20.5 12v3"/>',
  link: '<path d="M10 13a4 4 0 0 0 5.7.4l2.6-2.6A4 4 0 0 0 12.6 5l-1.5 1.5"/><path d="M14 11a4 4 0 0 0-5.7-.4L5.7 13.2A4 4 0 0 0 11.4 19l1.5-1.5"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M3 20a6 6 0 0 1 12 0M16 4.5a3.5 3.5 0 0 1 0 7M18 20a6 6 0 0 0-3-5.2"/>',
  download: '<path d="M12 4v11M7.5 11.5L12 16l4.5-4.5M5 19h14"/>',
} as const;

export type IconName = keyof typeof PATHS;

export function icon(name: IconName, label?: string): SafeHTML {
  const a11y = label ? `role="img" aria-label="${label}"` : 'aria-hidden="true"';
  return raw(`<svg class="icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${a11y}>${PATHS[name]}</svg>`);
}
