// Dashboard: how the resort is doing right now — money, occupancy, what needs
// attention, who arrives today and what is coming up.

import { checkOut } from '../../core/actions.js';
import { flag, html, type SafeHTML, type TemplateValue } from '../../core/dom.js';
import { addDays, formatDate, formatDateTime, peso, pesoShort, plural, timeOf } from '../../core/format.js';
import {
  closingEvent, downpaymentDue, exclusiveOn, findSession, findStaff, findUnit, isActive, poolGuests, productLabel,
} from '../../core/rules.js';
import {
  SALES_RANGES, salesBetween, salesReport, type SalesPoint, type SalesReport, type SalesSlice, type SalesSummary,
} from '../../core/sales.js';
import type { Booking, Staff, State } from '../../core/types.js';
import type { DeskContext, HandlerMap } from '../types.js';
import { kindDot, paymentPill, statusPill } from '../components/badges.js';
import { icon } from '../components/icons.js';
import { emptyState, pageHead } from '../layout.js';

const MAX_HOLDS_SHOWN = 3;
const LOOKAHEAD_DAYS = 7;

const ACTIVITY_LABELS: Record<string, string> = {
  'booking.created': 'Booking created',
  'booking.checked_in': 'Checked in',
  'booking.checked_out': 'Checked out',
  'booking.cancelled': 'Booking cancelled',
  'payment.recorded': 'Payment recorded',
  'booking.confirmed': 'Booking confirmed',
  'booking.discounted': 'Discount given',
  'booking.discount_removed': 'Discount removed',
  'booking.unconfirmed': 'Booking back on hold',
  'booking.updated': 'Booking edited',
  'inquiry.replied': 'Inquiry replied',
  'user.invited': 'User invited',
  'user.joined': 'User joined',
  'user.updated': 'User updated',
  'user.status': 'User status changed',
  'user.invite_revoked': 'Invite revoked',
  'event.created': 'Event added',
  'event.booked': 'Event booked',
  'link.created': 'Booking link sent',
  'link.cancelled': 'Booking link cancelled',
  'link.used': 'Booking link used',
};

function greeting(staff: Staff): string {
  const hour = new Date().getHours();
  const part = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  return `${part}, ${staff.name.split(' ')[0]}`;
}

function metric(label: string, value: TemplateValue, detail?: string, tone = ''): SafeHTML {
  return html`
    <div class="metric ${tone ? `metric--${tone}` : ''}">
      <span class="metric__label">${label}</span>
      <span class="metric__value">${value}</span>
      ${detail ? html`<span class="metric__detail">${detail}</span>` : ''}
    </div>`;
}

function poolMetric(state: State, sessionId: string): SafeHTML | '' {
  const session = findSession(state, sessionId);
  if (!session) return '';
  const guests = poolGuests(state, state.meta.asOf, sessionId);
  const percent = Math.min(100, Math.round((guests / session.capacity) * 100));
  return html`
    <div class="metric">
      <span class="metric__label">${session.label} pool</span>
      <span class="metric__value">${guests}<small>/${session.capacity}</small></span>
      <span class="meter" role="img" aria-label="${percent}% full"><span style="width:${percent}%"></span></span>
    </div>`;
}

function guestRow(ctx: DeskContext, booking: Booking, actionButton: TemplateValue): SafeHTML {
  return html`
    <li class="row">
      ${kindDot(ctx.state, booking.product)}
      <button class="row__main" type="button" data-action="open-booking" data-id="${booking.id}">
        <span class="row__title">${booking.guestName}</span>
        <span class="row__meta">${productLabel(ctx.state, booking.product)} · ${timeOf(booking.startsAt)} · ${plural(booking.adults + booking.kids, 'guest')}</span>
      </button>
      <span class="row__badges">${paymentPill(booking)}</span>
      ${actionButton}
    </li>`;
}

function attentionItems(ctx: DeskContext): SafeHTML[] {
  const { state } = ctx;
  const today = state.meta.asOf;
  const items: SafeHTML[] = [];

  const holds = state.bookings.filter((b) => b.status === 'hold' && b.date >= today);
  holds.slice(0, MAX_HOLDS_SHOWN).forEach((b) => items.push(html`
    <li>
      <button class="attention__item" type="button" data-action="open-booking" data-id="${b.id}">
        ${icon('wallet')}
        <span><strong>${b.guestName}</strong> ${b.paid ? `still owes ${peso(downpaymentDue(b))} of the downpayment` : 'has not paid the downpayment'} for ${productLabel(state, b.product)} on ${formatDate(b.date)}</span>
      </button>
    </li>`));

  if (holds.length > MAX_HOLDS_SHOWN) {
    items.push(html`
      <li>
        <a class="attention__item" href="#/bookings">
          ${icon('wallet')}
          <span><strong>${plural(holds.length - MAX_HOLDS_SHOWN, 'more booking')}</strong> on hold, downpayment due</span>
        </a>
      </li>`);
  }

  const upcomingEvent = state.events.find((event) => event.bookingId && event.date >= today);
  const eventBooking = upcomingEvent && state.bookings.find((b) => b.id === upcomingEvent.bookingId);
  if (eventBooking && eventBooking.balance > 0 && isActive(eventBooking)) {
    items.push(html`
      <li>
        <button class="attention__item" type="button" data-action="open-booking" data-id="${eventBooking.id}">
          ${icon('sparkles')}
          <span><strong>${upcomingEvent.title}</strong> on ${formatDate(upcomingEvent.date)} still owes ${peso(eventBooking.balance)}</span>
        </button>
      </li>`);
  }

  const nextExclusive = state.bookings.find((b) => isActive(b) && b.productType === 'exclusive' && b.date >= today && b.date <= addDays(today, 14));
  if (nextExclusive) {
    items.push(html`
      <li>
        <button class="attention__item" type="button" data-action="open-booking" data-id="${nextExclusive.id}">
          ${icon('sparkles')}
          <span><strong>Exclusive rental</strong> on ${formatDate(nextExclusive.date)}: ${nextExclusive.guestName}, ${productLabel(state, nextExclusive.product)}. Other bookings are closed then.</span>
        </button>
      </li>`);
  }

  const newInquiries = state.inquiries.filter((inquiry) => inquiry.status === 'new').length;
  if (newInquiries && ctx.canView('inbox')) {
    items.push(html`
      <li>
        <a class="attention__item" href="#/inbox">
          ${icon('message')}
          <span><strong>${plural(newInquiries, 'new inquiry', 'new inquiries')}</strong> waiting for a reply</span>
        </a>
      </li>`);
  }

  const openLinks = state.bookingLinks.filter((link) => link.status === 'sent' && link.expiresAt >= today).length;
  if (openLinks) {
    items.push(html`
      <li>
        <a class="attention__item" href="#/bookings">
          ${icon('link')}
          <span><strong>${plural(openLinks, 'booking link')}</strong> sent and not filled in yet</span>
        </a>
      </li>`);
  }

  return items;
}

/** How many days of sales the dashboard is showing. Kept while the app is open. */
let salesDays: number = SALES_RANGES[0];
/** The trend bar the reader pinned by clicking or tapping it, by start date. */
let pinnedPoint: string | null = null;

function salesStat(label: string, value: string, detail: TemplateValue = '', tone = ''): SafeHTML {
  return html`
    <div class="stat ${tone ? `stat--${tone}` : ''}">
      <span class="stat__label">${label}</span>
      <span class="stat__value">${value}</span>
      ${detail ? html`<span class="stat__detail">${detail}</span>` : ''}
    </div>`;
}

/** "Wed, Sep 16 · ₱42,300 booked · ₱8,900 collected" — one bar, read out in full. */
const pointReadout = (point: SalesPoint): string =>
  `${point.title} · ${peso(point.booked)} booked · ${peso(point.collected)} collected`;

/** Sales taken and money collected per day (per week over longer windows). */
function salesChart(report: SalesReport): SafeHTML {
  const peak = Math.max(1, ...report.points.flatMap((point) => [point.booked, point.collected]));
  const height = (value: number) => `${Math.max(value > 0 ? 2 : 0, Math.round((value / peak) * 100))}%`;
  const pinned = report.points.find((point) => point.from === pinnedPoint);
  // What the line under the chart says when nothing is hovered.
  const resting = pinned
    ? pointReadout(pinned)
    : `Tallest bar ${pesoShort(peak)}${report.weekly ? ' · one bar per week' : ' · one bar per day'}`;

  return html`
    <p class="sr-only">Sales taken and money collected over the last ${report.days} days. Each bar reads out below the chart.</p>
    <div class="chart">
      ${report.points.map((point) => html`
        <button class="chart__col ${point.isNow ? 'is-now' : ''} ${point.from === pinnedPoint ? 'is-pinned' : ''}"
          type="button" data-action="pin-point" data-hover="chart-point" data-point="${point.from}"
          data-readout="${pointReadout(point)}" aria-pressed="${flag(point.from === pinnedPoint)}"
          aria-label="${pointReadout(point)}">
          <span class="chart__bars">
            <span class="chart__bar chart__bar--booked" style="height:${height(point.booked)}"></span>
            <span class="chart__bar chart__bar--collected" style="height:${height(point.collected)}"></span>
          </span>
          <span class="chart__label">${point.label}</span>
        </button>`)}
    </div>
    <p class="chart__readout small ${pinned ? '' : 'muted'}" data-slot="chart-readout" data-resting="${resting}" aria-live="polite">${resting}</p>`;
}

/**
 * Part-to-whole: one stacked bar, then the legend that names every slice. The
 * slice keys carry the colour, so a group keeps its colour whatever it sold
 * and wherever it lands in the ranking.
 */
function shareChart(slices: SalesSlice[], total: number, empty: string, name: string): SafeHTML {
  if (!slices.length) return html`<p class="small muted">${empty}</p>`;
  const readout = (slice: SalesSlice) => `${slice.label} · ${peso(slice.amount)} · ${Math.round(slice.share * 100)}% of ${peso(total)}`;

  return html`
    <figure class="share">
      <div class="share__bar" role="img" aria-label="${name}: ${slices.map((slice) => `${slice.label} ${Math.round(slice.share * 100)}%`).join(', ')}">
        ${slices.map((slice) => html`
          <span class="share__seg share__seg--${slice.key}" style="flex-basis:${(slice.share * 100).toFixed(2)}%"
            data-hover="share-slice" data-readout="${readout(slice)}"></span>`)}
      </div>
      <figcaption class="share__readout small muted" data-slot="share-readout"
        data-resting="${peso(total)} across ${plural(slices.length, 'group', 'groups')}">${peso(total)} across ${plural(slices.length, 'group', 'groups')}</figcaption>
      <ul class="share__legend">
        ${slices.map((slice) => html`
          <li class="share__row" data-hover="share-slice" data-readout="${readout(slice)}">
            <span class="share__key share__key--${slice.key}" aria-hidden="true"></span>
            <span class="share__label">${slice.label}</span>
            <span class="share__amount">${peso(slice.amount)}</span>
            <span class="share__meta small muted">${Math.round(slice.share * 100)}% · ${slice.count}</span>
          </li>`)}
      </ul>
    </figure>`;
}

/** "vs the 7 days before", "vs the day before". */
const comparedWith = (days: number): string => `vs the ${days === 1 ? 'day' : `${days} days`} before`;

function salesSection(ctx: DeskContext): SafeHTML {
  const report = salesReport(ctx.state, salesDays);
  // Clicking a bar re-cuts the whole section to that day or week; the chart
  // itself keeps showing the full window so there is a way back.
  const focus = report.points.find((point) => point.from === pinnedPoint) ?? null;
  const shown: SalesSummary = focus ? salesBetween(ctx.state, focus.from, focus.to) : report;
  const changeTone = shown.change === null ? '' : shown.change < 0 ? 'down' : 'up';

  return html`
    <section class="sales" aria-label="Sales">
      <header class="sales__head">
        <div>
          <h2 class="sales__title">Sales</h2>
          <p class="small muted">
            ${focus
              ? html`<strong>${focus.title}</strong> · ${report.weekly ? 'this week' : 'this day'} only`
              : `${formatDate(report.from, 'monthDay')} – ${formatDate(report.to, 'monthDay')} · bookings taken in this window`}
          </p>
        </div>
        <div class="sales__controls">
          ${focus ? html`
            <button class="btn btn--quiet btn--sm" type="button" data-action="clear-point">Show all ${salesDays} days</button>` : ''}
          <div class="segmented" role="group" aria-label="Sales period">
            ${SALES_RANGES.map((days) => html`
              <button class="segmented__option ${days === salesDays ? 'is-active' : ''}" type="button"
                data-action="sales-range" data-days="${days}" aria-pressed="${flag(days === salesDays)}">${days} days</button>`)}
          </div>
        </div>
      </header>

      <div class="stats ${focus ? 'is-focused' : ''}">
        ${salesStat('Sales booked', peso(shown.booked), `${plural(shown.bookings, 'booking')} taken`)}
        ${salesStat('Collected', peso(shown.collected), shown.change === null
          ? 'Nothing to compare with'
          : html`<span class="stat__change stat__change--${changeTone}">${shown.change > 0 ? '▲' : shown.change < 0 ? '▼' : '='} ${Math.abs(shown.change)}%</span> ${comparedWith(shown.days)}`)}
        ${salesStat('Average booking', peso(shown.averageBooking), 'Per booking taken')}
        ${salesStat('Still to collect', peso(shown.outstanding), 'On these bookings', shown.outstanding ? 'warn' : '')}
      </div>

      <div class="sales__grid">
        <section class="panel sales__trend">
          <header class="panel__head">
            <h3 class="panel__title">Trend</h3>
            <p class="chart__legend small muted">
              <span class="chart__key chart__key--booked"></span>Booked
              <span class="chart__key chart__key--collected"></span>Collected
            </p>
          </header>
          ${salesChart(report)}
        </section>

        <section class="panel">
          <header class="panel__head">
            <h3 class="panel__title">What sold</h3>
            ${focus ? html`<span class="pill pill--info">${focus.label}</span>` : ''}
          </header>
          ${shareChart(shown.byProduct, shown.booked, focus ? 'Nothing was booked then.' : 'No bookings taken in this window.', 'What sold')}
        </section>

        <section class="panel">
          <header class="panel__head">
            <h3 class="panel__title">How guests paid</h3>
            ${focus ? html`<span class="pill pill--info">${focus.label}</span>` : ''}
          </header>
          ${shareChart(shown.byMethod, shown.collected, focus ? 'Nothing came in then.' : 'No payments in this window.', 'How guests paid')}
        </section>
      </div>
    </section>`;
}

export function render(ctx: DeskContext): SafeHTML {
  const { state, staff } = ctx;
  const today = state.meta.asOf;
  const horizon = addDays(today, LOOKAHEAD_DAYS);
  const canWrite = ctx.can('bookings.write');

  const todays = state.bookings.filter((b) => b.date === today && isActive(b) && b.product !== 'event');
  const arriving = todays.filter((b) => ['hold', 'confirmed'].includes(b.status));
  const inHouse = state.bookings.filter((b) => b.status === 'checked_in');
  const collected = state.payments.filter((p) => p.receivedAt.startsWith(today)).reduce((sum, p) => sum + p.amount, 0);
  const upcoming = state.bookings
    .filter((b) => isActive(b) && b.date > today && b.date <= horizon)
    .slice(0, 6);
  const balancesDue = state.bookings
    .filter((b) => isActive(b) && b.status !== 'checked_out' && b.date === today)
    .reduce((sum, b) => sum + b.balance, 0);
  const closedFor = closingEvent(state, today);
  const attention = attentionItems(ctx);
  const recent = state.activityLog.slice(0, 6);

  return html`
    ${pageHead({
      eyebrow: greeting(staff),
      title: 'Dashboard',
      subtitle: `${formatDate(today, 'long')} · ${plural(todays.length, 'booking')} today`,
      actions: canWrite ? html`
        <button class="btn btn--primary" type="button" data-action="new-booking">${icon('plus')} New booking</button>` : '',
    })}

    ${closedFor ? html`<p class="notice notice--event">V6M is closed today for ${closedFor.title}.</p>` : ''}
    ${exclusiveOn(state, today) ? html`
      <p class="notice notice--exclusive">Exclusive rental today: ${exclusiveOn(state, today)?.guestName} has ${productLabel(state, exclusiveOn(state, today)?.product ?? '')}. No other guests during their time.</p>` : ''}

    <div class="metrics">
      ${metric('Arriving today', arriving.length, plural(arriving.reduce((sum, b) => sum + b.adults + b.kids, 0), 'guest'))}
      ${metric('In house', inHouse.length, 'Checked in now')}
      ${poolMetric(state, 'daytour')}
      ${poolMetric(state, 'overnight')}
      ${metric('Collected today', peso(collected))}
      ${metric('Balances due', peso(balancesDue), "On today's bookings", balancesDue ? 'warn' : '')}
    </div>

    ${salesSection(ctx)}

    <div class="dashboard-grid">
      <section class="panel dashboard-grid__arriving">
        <header class="panel__head">
          <h2 class="panel__title">Arriving today</h2>
          <span class="panel__count">${arriving.length}</span>
        </header>
        ${arriving.length ? html`
          <ul class="rows">
            ${arriving.map((b) => guestRow(ctx, b, canWrite
              ? html`<button class="btn btn--secondary btn--sm" type="button" data-action="open-booking" data-id="${b.id}">Check in</button>`
              : statusPill(b)))}
          </ul>` : emptyState('No more arrivals today', 'Walk-ins can be added with New booking.')}
      </section>

      <section class="panel dashboard-grid__attention">
        <header class="panel__head">
          <h2 class="panel__title">Needs attention</h2>
          <span class="panel__count">${attention.length}</span>
        </header>
        ${attention.length ? html`<ul class="attention">${attention}</ul>` : emptyState('All clear', 'No holds, balances or open inquiries.')}
      </section>

      <section class="panel dashboard-grid__inhouse">
        <header class="panel__head">
          <h2 class="panel__title">In house</h2>
          <span class="panel__count">${inHouse.length}</span>
        </header>
        ${inHouse.length ? html`
          <ul class="rows">
            ${inHouse.map((b) => guestRow(ctx, b, canWrite
              ? html`<button class="btn btn--secondary btn--sm" type="button" data-action="check-out" data-id="${b.id}">Check out</button>`
              : statusPill(b)))}
          </ul>` : emptyState('Nobody checked in yet', 'Guests appear here after check-in.')}
      </section>

      <section class="panel dashboard-grid__upcoming">
        <header class="panel__head">
          <h2 class="panel__title">Next ${LOOKAHEAD_DAYS} days</h2>
          <a class="small" href="#/calendar">Open calendar</a>
        </header>
        ${upcoming.length ? html`
          <ul class="rows">
            ${upcoming.map((b) => html`
              <li class="row">
                ${kindDot(state, b.product)}
                <button class="row__main" type="button" data-action="open-booking" data-id="${b.id}">
                  <span class="row__title">${b.guestName}</span>
                  <span class="row__meta">${productLabel(state, b.product)} · ${formatDate(b.date)}</span>
                </button>
                <span class="row__badges">${paymentPill(b)}</span>
              </li>`)}
          </ul>` : emptyState('Nothing booked yet', 'The week ahead is open.')}
      </section>

      <section class="panel dashboard-grid__activity">
        <header class="panel__head"><h2 class="panel__title">Recent activity</h2></header>
        <ul class="timeline">
          ${recent.map((entry) => html`
            <li>
              <span>${ACTIVITY_LABELS[entry.action] ?? entry.action}${entry.detail ? ` · ${entry.detail}` : ''}</span>
              <span class="small muted">${formatDateTime(entry.at)} · ${entry.staffId ? findStaff(state, entry.staffId)?.name ?? 'Removed account' : 'System'}</span>
            </li>`)}
        </ul>
      </section>
    </div>`;
}

export const hovers: HandlerMap = {
  // Each figure has its own read-out line, so write into the one this slice sits in.
  'share-slice': ({ el, event }) => {
    const readout = el.closest('.share')?.querySelector<HTMLElement>('[data-slot="share-readout"]');
    if (!readout) return;
    const arriving = event.type === 'mouseover' || event.type === 'focusin';
    readout.textContent = arriving ? el.dataset.readout ?? '' : readout.dataset.resting ?? '';
    readout.classList.toggle('muted', !arriving);
  },

  // Arriving shows that bar's figures; leaving puts the resting line back.
  'chart-point': ({ el, event }) => {
    const readout = document.querySelector<HTMLElement>('[data-slot="chart-readout"]');
    if (!readout) return;
    const arriving = event.type === 'mouseover' || event.type === 'focusin';
    readout.textContent = arriving ? el.dataset.readout ?? '' : readout.dataset.resting ?? '';
    readout.classList.toggle('muted', !arriving && !pinnedPoint);
  },
};

export const actions: HandlerMap = {
  'sales-range': ({ el, ctx }) => {
    salesDays = Number(el.dataset.days) || SALES_RANGES[0];
    pinnedPoint = null;
    ctx.redraw();
  },

  // Clicking a bar cuts the section down to it; clicking it again undoes that.
  'pin-point': ({ el, ctx }) => {
    pinnedPoint = pinnedPoint === el.dataset.point ? null : el.dataset.point ?? null;
    ctx.redraw();
  },

  'clear-point': ({ ctx }) => {
    pinnedPoint = null;
    ctx.redraw();
  },

  'check-out': ({ el, ctx }) => {
    const booking = checkOut(el.dataset.id ?? '', ctx.staff.id);
    const unit = findUnit(ctx.state, booking.product);
    ctx.toast(`${booking.guestName} checked out${unit ? ` · ${unit.name} is free again` : ''}`);
  },
};
