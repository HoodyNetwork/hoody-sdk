// Playwright: the people and key links in
// "Only people or keys I pick" are one table in a "People and key links" section of the computer's Permissions tab, at
// phone and wide widths. A long name shows whole (it wraps, never cut) and so does Can open: in list rows through the
// kit's listWraps, in the column table a wide tab draws through its wraps (a cell that takes the lines it needs).
// Nothing in the tab runs past its edge, and Remove is in the row's menu, inside the tab. The add form is its own
// drawer ("New key link").
import { expect, test } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import drawer from './parts/AccessDrawer.strings.en.json';
import strings from './strings.en.json';

// cedar starts with no rules: the test adds one key link with a long name through the add drawer (the fixtures keep it).
// The widest name the form takes: 32 letters (ENTRY_NAME_MAX) with no place to break, so it shows whole only by wrapping.
const NAME = 'M'.repeat(32);
const SHOWN = 'm'.repeat(32); // as the rules store it
// Every program the form offers: the longest "Can open" line a key link gets.
const PROGS = ['agent', 'terminal', 'screen', 'files', 'browser'] as const;
for (const width of [360, 390, 1100, 2560]) {
  test.describe(`at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });
    // Five program runs before the row shows (up to 30 s on a loaded machine): more than the 30 s default per test.
    test.setTimeout(120_000);

    test('a key link with a long name: its row shows the name whole, nothing overflows, and Remove is in the row menu inside the tab', async ({ page }) => {
      await gotoHub(page, '/computers?sel=cedar.00c3&tab=permissions');
      await expect(page.getByRole('tab', { name: strings['tab.permissions'], selected: true })).toBeVisible({ timeout: 60_000 });
      // By attribute, not by role: while the add drawer is open the tab behind it is hidden from assistive technology.
      const d = page.locator('[role="tabpanel"]');
      // The add form, and after it the secret shown once: one drawer over the tab.
      const add = page.getByRole('dialog', { name: drawer['acc.p.formKey'] });
      await d.getByText(drawer['acc.people'], { exact: true }).click(); // the radio's own label (the input is visually hidden)
      await expect(d.getByRole('radio', { name: new RegExp(drawer['acc.people']) })).toBeChecked();
      // Add a key link is the section's second head action: beside Add a person when there is room, else in its menu.
      const head = d.getByRole('group', { name: drawer['acc.p.title'] });
      const direct = head.getByRole('button', { name: drawer['acc.p.addKey'] });
      if (width >= 1100) await expect(direct, 'both add actions show in a wide tab').toBeVisible();
      if (await direct.count()) await direct.click();
      else {
        await head.getByRole('button', { name: 'More actions' }).click();
        await page.getByRole('menuitem', { name: drawer['acc.p.addKey'] }).click();
      }
      await add.getByRole('textbox', { name: drawer['acc.p.name'] }).fill(NAME);
      const picked: string[] = [];
      for (const p of PROGS) {
        const label = drawer[`acc.p.prog.${p}`];
        const box = add.getByRole('checkbox', { name: label });
        await expect(box, `cedar offers ${label} to link`).toBeEnabled();
        await add.getByText(label, { exact: true }).click(); // the checkbox's own label
        await expect(box).toBeChecked();
        picked.push(label);
      }
      expect(picked, 'every program the form offers is picked: the longest Can open line').toEqual(PROGS.map((p) => drawer[`acc.p.prog.${p}`]));
      await add.getByRole('button', { name: drawer['acc.p.continue'] }).click();
      await page.getByRole('alertdialog').getByRole('button', { name: drawer['acc.p.confirmGo'], exact: true }).click();
      await expect(d.getByText(drawer['acc.now.people'])).toBeVisible({ timeout: 60_000 }); // one link per program: five runs (a loaded machine took near 30 s; the test has 120 s)
      await add.getByRole('button', { name: drawer['acc.p.secretDone'] }).click();
      const row = d.getByRole('table', { name: drawer['acc.p.title'] }).locator(`[data-row-id="hub-key-${SHOWN}"]`);
      await expect(row).toBeVisible();
      await expect(row).toContainText(drawer['acc.p.key']);
      for (const label of picked) await expect(row).toContainText(label);
      const m = await d.evaluate((el, { name, opens }) => {
        const body = el.getBoundingClientRect();
        const r = el.querySelector(`[data-row-id="hub-key-${name}"]`) as HTMLElement;
        // The deepest element holding the text, then every box from it up to the row: none may cut it, across or down.
        const cutOf = (parts: string[]) => {
          const has = (x: Element) => parts.every((t) => (x.textContent ?? '').includes(t));
          let x: HTMLElement | null = Array.from(r.querySelectorAll<HTMLElement>('*')).find((e) => has(e) && !Array.from(e.children).some(has)) ?? null;
          if (!x) return -1;
          let worst = 0;
          for (; x && x !== r; x = x.parentElement) worst = Math.max(worst, x.scrollWidth - x.clientWidth, x.scrollHeight - x.clientHeight);
          return worst;
        };
        const b = (r.querySelector('[aria-label="Row actions"]') as HTMLElement).getBoundingClientRect();
        // Can open is the kit's wrapping line-2 field (column listWraps) in list rows and its wrapping cell (column
        // wraps) in the column table: the box holding the whole line wraps words and breaks a run with no break point anywhere.
        const WRAPS = '[data-meta-wraps], [data-cell-wraps]';
        const field = Array.from(r.querySelectorAll<HTMLElement>(WRAPS)).find((e) => opens.every((t) => (e.textContent ?? '').includes(t)));
        const wraps = field ? `${getComputedStyle(field).whiteSpace} ${getComputedStyle(field).overflowWrap}` : 'no wrapping field';
        // The name wraps by the kit too (the list primary, or the name cell of the column table): no span of the page's own.
        const nameEl = Array.from(r.querySelectorAll<HTMLElement>(WRAPS)).find((e) => e.textContent === name);
        const nameWraps = nameEl ? `${getComputedStyle(nameEl).whiteSpace} ${getComputedStyle(nameEl).overflowWrap}` : 'no wrapping name';
        return { over: el.scrollWidth - el.clientWidth, name: cutOf([name]), opens: cutOf(opens), wraps, nameWraps, body: { l: body.left, r: body.right }, menu: { l: b.left, r: b.right } };
      }, { name: SHOWN, opens: picked });
      expect(m.over, 'nothing in the tab runs past its edge').toBeLessThanOrEqual(0);
      expect(m.name, 'the widest name shows whole, never cut to an ellipsis').toBeGreaterThanOrEqual(0);
      expect(m.name, 'the widest name shows whole, never cut to an ellipsis').toBeLessThanOrEqual(1);
      expect(m.opens, 'every program it can open shows, never cut').toBeGreaterThanOrEqual(0);
      expect(m.opens, 'every program it can open shows, never cut').toBeLessThanOrEqual(1);
      expect(m.wraps, 'Can open wraps onto the lines it needs, at every width').toBe('normal anywhere');
      expect(m.nameWraps, 'the name wraps whole by the kit, at every width').toBe('normal anywhere');
      expect(m.menu.r, 'the row menu ends inside the tab').toBeLessThanOrEqual(m.body.r + 0.5);
      expect(m.menu.l, 'the row menu starts inside the tab').toBeGreaterThanOrEqual(m.body.l - 0.5);
      await row.getByRole('button', { name: 'Row actions' }).click();
      await expect(page.getByRole('menuitem', { name: drawer['acc.p.removeLabel'].replace('{{name}}', SHOWN) }), 'Remove is in the row menu').toBeInViewport();
    });
  });
}
