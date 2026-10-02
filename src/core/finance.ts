// Profit and loss: money that came in against money that went out, over the
// same windows the sales figures use. Cash in, cash out — a payment counts on
// the day it was received and an expense on the day it was spent, so the
// profit here is what the till actually saw, not what has been invoiced.

import { addDays } from './format.js';
import { buckets, dayOf, daysBetween, rankSlices, sumOf, within, type Bucket, type Slice } from './period.js';
import type { Expense, ExpenseCategory, ISODate, State } from './types.js';

/** One bar of the profit and loss trend. */
export interface FinancePoint extends Bucket {
  income: number;
  spend: number;
}

/** Fixed order, so a category keeps its place and its colour whatever it cost. */
export const EXPENSE_CATEGORIES: ExpenseCategory[] = ['payroll', 'utilities', 'supplies', 'upkeep', 'other'];

export const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  payroll: 'Staff pay',
  utilities: 'Utilities',
  supplies: 'Supplies',
  upkeep: 'Upkeep and repairs',
  other: 'Other',
};

/** What each category is for, shown under the picker in the form. */
export const CATEGORY_HINTS: Record<ExpenseCategory, string> = {
  payroll: 'Wages, overtime and extra hands for an event',
  utilities: 'Electricity, water, internet, LPG',
  supplies: 'Pool chemicals, kitchen, linen, cleaning, guest amenities',
  upkeep: 'Repairs, paint, garden, equipment, fuel',
  other: 'Permits, fees, transport, anything else',
};

export interface FinanceSummary {
  from: ISODate;
  to: ISODate;
  days: number;
  /** Payments received in the window. */
  income: number;
  /** Expenses dated inside the window. */
  spend: number;
  /** Income less spending: a loss when negative. */
  profit: number;
  /** Profit as a share of income, 0–1, or null when nothing came in. */
  margin: number | null;
  /**
   * Profit over the window of the same length before this one, or null when
   * nothing at all moved then — an empty window is not a fair comparison.
   */
  profitBefore: number | null;
  /** How many expenses were recorded in the window. */
  count: number;
  byCategory: Slice[];
  /** The expenses themselves, newest first, for the list under the charts. */
  expenses: Expense[];
}

export interface FinanceReport extends FinanceSummary {
  /** True when the bars are weeks rather than days. */
  weekly: boolean;
  points: FinancePoint[];
}

const spentBetween = (state: State, from: ISODate, to: ISODate): Expense[] =>
  state.expenses.filter((expense) => within(expense.date, from, to));

const collectedBetween = (state: State, from: ISODate, to: ISODate): number =>
  sumOf(state.payments.filter((payment) => within(dayOf(payment.receivedAt), from, to)).map((payment) => payment.amount));

const totalOf = (expenses: Expense[]): number => sumOf(expenses.map((expense) => expense.amount));

/** The figures for any stretch of days: the whole window, or one bar of the trend. */
export function financeBetween(state: State, from: ISODate, to: ISODate): FinanceSummary {
  const days = daysBetween(from, to);
  const expenses = spentBetween(state, from, to);
  const income = collectedBetween(state, from, to);
  const spend = totalOf(expenses);
  const before = { from: addDays(from, -days), to: addDays(from, -1) };
  const incomeBefore = collectedBetween(state, before.from, before.to);
  const spendBefore = totalOf(spentBetween(state, before.from, before.to));

  const categories = new Map<ExpenseCategory, Slice>();
  expenses.forEach((expense) => {
    const key = expense.category;
    const slice = categories.get(key) ?? { key, label: CATEGORY_LABELS[key] ?? key, amount: 0, count: 0, share: 0 };
    slice.amount += expense.amount;
    slice.count += 1;
    categories.set(key, slice);
  });

  return {
    from,
    to,
    days,
    income,
    spend,
    profit: income - spend,
    margin: income > 0 ? (income - spend) / income : null,
    profitBefore: incomeBefore || spendBefore ? incomeBefore - spendBefore : null,
    count: expenses.length,
    byCategory: rankSlices(EXPENSE_CATEGORIES.flatMap((category) => categories.get(category) ?? [])),
    // Two spends on one day keep the order they were recorded in.
    expenses: [...expenses].sort((a, b) => (b.date === a.date ? b.createdAt.localeCompare(a.createdAt) : b.date.localeCompare(a.date))),
  };
}

/** Any stretch of days with its trend bars: one per day, or per week past a fortnight. */
export function financeRange(state: State, from: ISODate, to: ISODate): FinanceReport {
  const split = buckets(state.meta.asOf, from, to, daysBetween(from, to));
  return {
    ...financeBetween(state, from, to),
    weekly: split.weekly,
    points: split.buckets.map((bucket) => ({
      ...bucket,
      income: collectedBetween(state, bucket.from, bucket.to),
      spend: totalOf(spentBetween(state, bucket.from, bucket.to)),
    })),
  };
}

/** The last `days` days up to the demo date. */
export function financeReport(state: State, days: number): FinanceReport {
  const to = state.meta.asOf;
  return financeRange(state, addDays(to, -(days - 1)), to);
}
