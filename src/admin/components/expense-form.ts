// Record or edit an expense: what the resort spent, on what day, out of which
// pocket. The dashboard's profit and loss section adds these up against the
// payments that came in. The category list is edited here too: "+ New
// category…" in the dropdown, and Edit categories to delete one (its expenses
// move to Other).

import { addExpenseCategory, recordExpense, removeExpense, removeExpenseCategory, updateExpense, type NewExpense } from '../../core/actions.js';
import { $maybe, html, type SafeHTML } from '../../core/dom.js';
import { OTHER_CATEGORY, expenseCategories } from '../../core/finance.js';
import { formatDate, formatDigits, parseDigits, peso, plural } from '../../core/format.js';
import { METHOD_LABELS } from '../../core/rules.js';
import type { Expense, ExpenseCategory, PaymentMethod, State } from '../../core/types.js';
import { asField, type DrawerContent } from '../types.js';
import { icon } from './icons.js';

const METHODS: PaymentMethod[] = ['cash', 'gcash', 'bank_transfer'];

/** Things a resort buys often, offered per category so the list stays short. */
const ITEM_PRESETS: Record<string, string[]> = {
  payroll: ['Staff wages', 'Overtime', 'Extra hands for an event', 'Lifeguard'],
  utilities: ['Meralco bill', 'Water bill', 'Internet', 'LPG tank'],
  supplies: ['Chlorine and pool chemicals', 'Cleaning supplies', 'Linen and towels', 'Kitchen stock', 'Guest amenities'],
  upkeep: ['Pool pump repair', 'Aircon servicing', 'Paint and hardware', 'Garden and grass cutting', 'Fuel'],
  other: ['Business permit', 'Transport', 'Bank charges'],
};

/** The dropdown's last choice: type a new category instead of picking one. */
const NEW_CATEGORY = '__new';

const option = (value: string, label: string, selected: string): SafeHTML =>
  html`<option value="${value}" ${value === selected ? 'selected' : ''}>${label}</option>`;

const draftFrom = (expense: Expense): NewExpense => ({
  date: expense.date,
  category: expense.category,
  item: expense.item,
  amount: expense.amount,
  method: expense.method,
  vendor: expense.vendor ?? '',
  note: expense.note ?? '',
});

const blankDraft = (state: State): NewExpense => ({
  date: state.meta.asOf,
  category: 'supplies',
  item: '',
  amount: 0,
  method: 'cash',
  vendor: '',
  note: '',
});

/** Pass an expense to edit it; pass nothing to record a new one. */
export function createExpenseForm(existing?: Expense): DrawerContent {
  let draft: NewExpense | null = existing ? draftFrom(existing) : null;
  let error = '';
  let confirmRemove = false;
  /** Typing a new category's name, and the name so far. */
  let adding = false;
  let newName = '';
  /** The list of categories with a delete button on each, and the one being asked about. */
  let editingList = false;
  let askDelete: ExpenseCategory | null = null;
  // The actions below, so Enter in the new category's box can run Add.
  let actionsRef: NonNullable<DrawerContent['actions']>;

  const showError = (root: HTMLElement) => {
    const slot = $maybe('[data-slot="error"]', root);
    if (slot) slot.textContent = error;
  };

  return {
    live: false,
    title: existing ? 'Edit expense' : 'Record an expense',

    render(ctx) {
      const { state } = ctx;
      if (!draft) draft = blankDraft(state);
      const form = draft;
      const categories = expenseCategories(state);
      // The category may have been deleted while the form was open.
      if (!categories.some((category) => category.id === form.category)) form.category = OTHER_CATEGORY;
      const hint = categories.find((category) => category.id === form.category)?.hint ?? '';
      const presets = ITEM_PRESETS[form.category] ?? [];

      return html`
        <form class="booking-form" data-submit="save-expense" novalidate>
          <fieldset class="form-section">
            <legend class="form-section__title">What was spent</legend>
            ${adding ? html`
              <div class="field">
                <span class="field__label">New category</span>
                <div class="inline-add">
                  <input class="input" name="newCategory" data-input="newCategory" value="${newName}" placeholder="Marketing, Food and drinks…"
                    autocomplete="off" maxlength="40" data-focus-key="new-category">
                  <button class="btn btn--primary btn--sm" type="button" data-action="add-category">Add</button>
                  <button class="btn btn--quiet btn--sm" type="button" data-action="cancel-category">Cancel</button>
                </div>
              </div>` : html`
              <label class="field">
                <span class="field__label">Category</span>
                <select class="input" name="category" data-input="field">
                  ${categories.map((category) => option(category.id, category.label, form.category))}
                  <option value="${NEW_CATEGORY}">+ New category…</option>
                </select>
              </label>`}
            ${hint ? html`<p class="small muted">${hint}</p>` : ''}
            ${adding ? '' : html`
              <button class="link-button cat-edit-toggle" type="button" data-action="toggle-categories" aria-expanded="${editingList ? 'true' : 'false'}">
                ${editingList ? 'Done editing categories' : 'Edit categories'}
              </button>`}
            ${editingList && !adding ? html`
              <ul class="cat-list">
                ${categories.map((category) => {
                  const count = state.expenses.filter((expense) => expense.category === category.id).length;
                  if (askDelete === category.id) {
                    return html`
                      <li class="cat-list__row cat-list__row--ask">
                        <span>Delete <strong>${category.label}</strong>?${count ? ` Its ${plural(count, 'expense')} move to Other.` : ''}</span>
                        <span class="cat-list__buttons">
                          <button class="btn btn--quiet btn--sm" type="button" data-action="keep-category">Keep</button>
                          <button class="btn btn--danger btn--sm" type="button" data-action="delete-category" data-id="${category.id}">Delete</button>
                        </span>
                      </li>`;
                  }
                  return html`
                    <li class="cat-list__row">
                      <span>${category.label} <span class="small muted">${count ? plural(count, 'expense') : 'unused'}</span></span>
                      ${category.id === OTHER_CATEGORY
                        ? html`<span class="small muted">Always kept</span>`
                        : html`<button class="cat-list__delete" type="button" data-action="ask-delete-category" data-id="${category.id}"
                            aria-label="Delete ${category.label}" title="Delete ${category.label}">${icon('trash')}</button>`}
                    </li>`;
                })}
              </ul>` : ''}
            <label class="field">
              <span class="field__label">What was it for</span>
              <input class="input" name="item" data-input="field" value="${form.item}" list="expense-presets"
                placeholder="${presets[0] ?? 'What the money was spent on'}" autocomplete="off">
            </label>
            <datalist id="expense-presets">
              ${presets.map((preset) => html`<option value="${preset}"></option>`)}
            </datalist>
            <div class="form-grid">
              <label class="field">
                <span class="field__label">Amount (₱)</span>
                <input class="input input--amount" name="amount" data-input="field" type="text" inputmode="numeric"
                  autocomplete="off" placeholder="0" value="${form.amount ? formatDigits(form.amount) : ''}">
              </label>
              <label class="field">
                <span class="field__label">Day it was spent</span>
                <input class="input" name="date" data-input="field" type="date" max="${state.meta.asOf}" value="${form.date}">
              </label>
            </div>
          </fieldset>

          <fieldset class="form-section">
            <legend class="form-section__title">Where it went</legend>
            <div class="form-grid">
              <label class="field">
                <span class="field__label">Paid with</span>
                <select class="input" name="method" data-input="field">
                  ${METHODS.map((method) => option(method, METHOD_LABELS[method], form.method))}
                </select>
              </label>
              <label class="field">
                <span class="field__label">Paid to (optional)</span>
                <input class="input" name="vendor" data-input="field" value="${form.vendor}" placeholder="Meralco, hardware store" autocomplete="off">
              </label>
            </div>
            <label class="field">
              <span class="field__label">Note (optional)</span>
              <input class="input" name="note" data-input="field" value="${form.note}" placeholder="Replaced the pump bearing">
            </label>
          </fieldset>

          <p class="form-error" data-slot="error" role="alert">${error}</p>

          <div class="button-row button-row--end">
            <button class="btn btn--quiet" type="button" data-action="close-drawer">Cancel</button>
            <button class="btn btn--primary" type="submit">${existing ? 'Save changes' : 'Record expense'}</button>
          </div>
        </form>

        ${existing ? html`
          <div class="detail-section">
            ${confirmRemove ? html`
              <div class="action-card action-card--danger">
                <h4 class="action-card__title">Remove this expense?</h4>
                <p class="small muted">${existing.item} · ${peso(existing.amount)} on ${formatDate(existing.date, 'long')}. The profit and loss figures change straight away.</p>
                <div class="button-row">
                  <button class="btn btn--quiet" type="button" data-action="keep-expense">Keep it</button>
                  <button class="btn btn--danger" type="button" data-action="confirm-remove">Remove expense</button>
                </div>
              </div>` : html`
              <button class="btn btn--quiet btn--danger-text" type="button" data-action="ask-remove">${icon('trash')} Remove expense</button>`}
          </div>` : ''}`;
    },

    inputs: {
      newCategory: ({ el, root }) => {
        newName = (el as HTMLInputElement).value;
        error = '';
        showError(root);
      },

      field: ({ el, root, redraw }) => {
        if (!draft) return;
        const field = asField(el);
        if (field.name === 'amount') {
          draft.amount = parseDigits(field.value);
          const formatted = formatDigits(field.value);
          if (formatted !== field.value) field.value = formatted;
        } else if (field.name === 'category') {
          // The last choice opens a box to name a new category instead.
          if (field.value === NEW_CATEGORY) {
            adding = true;
            newName = '';
            error = '';
            redraw();
            root.querySelector<HTMLInputElement>('[name="newCategory"]')?.focus();
            return;
          }
          // The hint and the suggestions belong to the category, so redraw.
          draft.category = field.value as ExpenseCategory;
          error = '';
          redraw();
          return;
        } else if (field.name === 'method') {
          draft.method = field.value as PaymentMethod;
        } else {
          draft[field.name as 'item'] = field.value;
        }
        error = '';
        showError(root);
      },
    },

    actions: actionsRef = {
      'add-category': ({ ctx, root, redraw }) => {
        if (!draft) return;
        const result = addExpenseCategory(newName, ctx.staff.id);
        if (result.error !== undefined) {
          error = result.error;
          showError(root);
          return;
        }
        draft.category = result.category.id;
        adding = false;
        newName = '';
        error = '';
        redraw();
        ctx.toast(`Category ${result.category.label} added`);
      },

      'cancel-category': ({ redraw }) => {
        adding = false;
        newName = '';
        error = '';
        redraw();
      },

      'toggle-categories': ({ redraw }) => {
        editingList = !editingList;
        askDelete = null;
        redraw();
      },

      'ask-delete-category': ({ el, redraw }) => {
        askDelete = el.dataset.id ?? null;
        redraw();
      },

      'keep-category': ({ redraw }) => {
        askDelete = null;
        redraw();
      },

      'delete-category': ({ el, ctx, root, redraw }) => {
        const result = removeExpenseCategory(el.dataset.id ?? '', ctx.staff.id);
        askDelete = null;
        if (result.error !== undefined) {
          error = result.error;
          showError(root);
          return;
        }
        redraw();
        ctx.toast(`${result.label} deleted${result.moved ? ` · ${plural(result.moved, 'expense')} moved to Other` : ''}`, 'warning');
      },

      'save-expense': ({ ctx, root, ...rest }) => {
        if (!draft) return;
        // Enter in the new category's box adds the category, not the expense.
        if (adding) {
          void actionsRef['add-category']?.({ ctx, root, ...rest });
          return;
        }
        const result = existing ? updateExpense(existing.id, draft, ctx.staff.id) : recordExpense(draft, ctx.staff.id);
        if (result.error !== undefined) {
          error = result.error;
          showError(root);
          return;
        }
        ctx.toast(`${result.expense.item} · ${peso(result.expense.amount)} ${existing ? 'saved' : 'recorded'}`);
        ctx.closeDrawer();
      },

      'ask-remove': ({ redraw }) => {
        confirmRemove = true;
        redraw();
      },

      'keep-expense': ({ redraw }) => {
        confirmRemove = false;
        redraw();
      },

      'confirm-remove': ({ ctx, root }) => {
        if (!existing) return;
        const result = removeExpense(existing.id, ctx.staff.id);
        if (result.error !== undefined) {
          error = result.error;
          confirmRemove = false;
          showError(root);
          return;
        }
        ctx.toast(`${result.expense.item} removed`, 'warning');
        ctx.closeDrawer();
      },
    },
  };
}
