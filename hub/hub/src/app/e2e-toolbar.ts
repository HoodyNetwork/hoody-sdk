// Playwright helpers for a DataTable toolbar that fits itself to its width (DataTableLayout toolbarSteps): the filter
// chips (or a segmented filter) may be folded behind one "Filters" button, and the Cards / List choice may sit in the
// view menu. These helpers take whichever the toolbar draws now, so a spec states what it picks, not where the
// toolbar put it. They never assume a width.
import { expect, type Locator } from '@playwright/test';
import kitStrings from '@kit/strings.en.json';

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** How long one try waits for a control before the whole pick starts again from the toolbar's current fit. */
const TRY_MS = 5000;
const TRIES = 3;

/** Wait until any of `locs` shows. Several may show at once (the Cards switch beside View options), so this never
 *  asks one locator to be unique. */
async function anyVisible(...locs: Locator[]): Promise<void> {
  await expect.poll(async () => (await Promise.all(locs.map((l) => l.isVisible()))).some(Boolean), { timeout: 30_000 }).toBe(true);
}

/** "Filters" or "Filters (2)": the fold's button, with words or with its icon alone (the words are then its name). */
const foldName = new RegExp(`^(${esc(kitStrings['table.filtersButton'])}|${esc(kitStrings['table.filtersButtonCount']).replace(esc('{{count}}'), '\\d+')})$`);

/** The fold's button inside `scope`, and its panel (a dialog named Filters, drawn in a popover). */
function fold(scope: Locator) {
  return { button: scope.getByRole('button', { name: foldName }), panel: scope.page().getByRole('dialog', { name: kitStrings['table.filters'] }) };
}

/** A chip's button: its name starts with the filter's label and then carries the value ("Plan Free"). Its × is
 *  "Clear Plan", so it never matches. */
const chipButton = (scope: Locator, label: string) => scope.getByRole('button', { name: new RegExp(`^${esc(label)}`) });

/** Close the fold's panel (and an option menu still open over it) once a pick is done. */
async function closeFold(scope: Locator) {
  const { panel } = fold(scope);
  for (let i = 0; i < 2 && (await panel.isVisible()); i++) await scope.page().keyboard.press('Escape');
}

/** The row of inline chips (a group named Filters). Column headers and other buttons stay out of reach. A table with a
 *  second filter tier draws two such groups (the second is FilterChips `bar`, data-chip-bar): the locator holds both,
 *  so a chip is found in either tier, and a visibility check reads the first. */
const inlineRow = (scope: Locator) => scope.getByRole('group', { name: kitStrings['table.filters'], exact: true });

/** Where the filters' chips are now: the fold's panel (opened here) when the toolbar shows the fold, else the inline row. */
async function filtersHost(scope: Locator): Promise<{ host: Locator; folded: boolean }> {
  const f = fold(scope);
  await anyVisible(f.button, inlineRow(scope).first()); // whichever the toolbar's fit drew
  if (!(await f.button.isVisible())) return { host: inlineRow(scope), folded: false };
  await f.button.click({ timeout: TRY_MS });
  await f.panel.waitFor({ timeout: TRY_MS });
  return { host: f.panel, folded: true };
}

/**
 * Run `find` (resolve the host, open what holds the control, wait for it), then click the control it returns: the one
 * click that changes the view. The toolbar can refit while a read finishes (its fit restarts when the count appears),
 * which closes the fold or swaps chips for the button; a `find` that loses its control starts again from the current
 * fit, up to TRIES times. The final click runs once only: a pick is never sent twice.
 */
async function settle(scope: Locator, find: () => Promise<Locator>): Promise<void> {
  for (let i = 1; ; i++) {
    let target: Locator;
    try {
      target = await find();
    } catch (e) {
      if (i >= TRIES) throw e;
      // Close what the lost try left open (an option menu, the fold), and nothing else: Escape on the page itself
      // could close a detail.
      if ((await scope.page().locator('[role="menu"]:visible, [role="listbox"]:visible').count()) > 0) await scope.page().keyboard.press('Escape');
      await closeFold(scope);
      continue;
    }
    await target.click();
    return;
  }
}

/**
 * Pick `option` of the filter labelled `label`: the inline chip, the inline segmented control, or the same chip
 * inside the Filters fold. Ends with every menu and the fold closed.
 */
export async function pickFilter(scope: Locator, label: string, option: string): Promise<void> {
  const page = scope.page();
  let segmented = false;
  await settle(scope, async () => {
    const { host, folded } = await filtersHost(scope);
    const segment = host.getByRole('radiogroup', { name: label }).getByRole('radio', { name: option });
    if (!folded && (await segment.isVisible())) {
      segmented = true;
      return segment;
    }
    await chipButton(host, label).click({ timeout: TRY_MS });
    const item = page.getByRole('menuitemradio', { name: option }).or(page.getByRole('menuitemcheckbox', { name: option })).or(page.getByRole('option', { name: option })).first(); // reason: .or() takes the radio, checkbox or option item, whichever this chip draws
    await item.waitFor({ timeout: TRY_MS });
    return item;
  });
  if (segmented) return;
  // A multi chip's menu stays open after a pick; a single one closes. Either way nothing is left over the rows.
  if (await page.getByRole('menu', { name: label }).isVisible()) await page.keyboard.press('Escape');
  await closeFold(scope);
}

/** Clear the filter labelled `label` with its ×, inline or inside the Filters fold. */
export async function clearFilter(scope: Locator, label: string): Promise<void> {
  await settle(scope, async () => {
    const { host } = await filtersHost(scope);
    const x = host.getByRole('button', { name: kitStrings['table.clearFilter'].replace('{{name}}', label) });
    await x.waitFor({ timeout: TRY_MS });
    return x;
  });
  await closeFold(scope);
}

/** Choose Cards or List: the toolbar's own switch when it shows, else the same choice in the view menu. The switch
 *  may show beside View options (a page with both), so the switch wins whenever it shows. */
export async function choosePresentation(scope: Locator, choice: 'cards' | 'list'): Promise<void> {
  const page = scope.page();
  const label = kitStrings[choice === 'cards' ? 'table.present.cards' : 'table.present.list'];
  const radio = scope.getByRole('radio', { name: label, exact: true });
  const menu = scope.getByRole('button', { name: new RegExp(`^(${esc(kitStrings['table.view'])}|${esc(kitStrings['action.more'])})$`) });
  await settle(scope, async () => {
    await anyVisible(radio, menu); // whichever the toolbar's fit drew; both may show
    if (await radio.isVisible()) return radio;
    await menu.click({ timeout: TRY_MS });
    const item = page.getByRole('menuitemradio', { name: label, exact: true });
    await item.waitFor({ timeout: TRY_MS });
    return item;
  });
}
