// Playwright: the chat apps flow fits a phone and a desktop. At 390 the chat rows' buttons wrap below the row
// text instead of running past the drawer's edge, the Pause all / Settings row wraps inside the tab, and the new waiting
// lines, Setup track, privacy steps and group steps run inside their boxes; at 1350 the same holds.
import { expect, type Locator, type Page } from '@playwright/test';
import { gotoHub, test } from '@app/e2e';
import strings from './strings.en.json';

const URL = '/bots?sel=c-atlas~a1b2c3d4e5f60718293a4b5c~chief&tab=apps';

/** Every button and text line inside `box` that runs past its left or right edge: their text, so a failure names them. */
async function pastEdge(box: Locator): Promise<string[]> {
  return box.evaluate((root) => {
    const edge = root.getBoundingClientRect();
    const out: string[] = [];
    for (const el of root.querySelectorAll<HTMLElement>('button, a, li, p, span, code')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.right > edge.right + 1 || r.left < edge.left - 1) out.push((el.textContent ?? '').trim().slice(0, 50));
    }
    return out;
  });
}

const open = async (page: Page, app?: string) => {
  await gotoHub(page, `${URL}${app ? `&app=${app}` : ''}`, { state: 'channelGroupAsks' });
};

/** The Needs you words of Support chat's row, whole or cut: '' when they end before the content edge of their cell (or list line) and
 * before the row's buttons start. A cell's end padding is where an ellipsis cuts, so the words must end before it. */
async function needsCut(apps: Locator): Promise<string> {
  const first = strings['apps.need.requested_one'].replace('{{count}}', '1');
  const needs = apps.getByRole('row', { name: /Support chat/ }).getByText(strings['apps.needsMore'].replace('{{first}}', first).replace('{{count}}', '1'), { exact: true });
  await expect(needs).toBeVisible();
  return needs.evaluate((el) => {
    const text = [...el.childNodes].find((x) => x.nodeType === 3 && (x.textContent ?? '').trim() !== '');
    if (!text) return 'no text';
    const r = document.createRange();
    r.selectNodeContents(text);
    const w = r.getBoundingClientRect();
    const cell = (el.closest('td') ?? el) as HTMLElement;
    const edge = cell.getBoundingClientRect().right - parseFloat(getComputedStyle(cell).paddingInlineEnd || '0');
    const row = el.closest('tr, [role="row"]');
    const btn = [...(row?.querySelectorAll('button') ?? [])].map((b) => b.getBoundingClientRect()).find((b) => b.top < w.bottom && b.bottom > w.top && b.left >= w.left);
    // An ellipsizing box (the element or one around it, up to the cell) whose content runs past it is cutting the words.
    let cut = false;
    for (let e: Element | null = el; e && e !== cell.parentElement; e = e.parentElement) {
      if (getComputedStyle(e).textOverflow === 'ellipsis' && e.scrollWidth > e.clientWidth + 1) cut = true;
    }
    return w.right <= edge + 1 && (!btn || w.right <= btn.left + 1) && !cut ? '' : `cut: words ${Math.round(w.right)} edge ${Math.round(edge)} button ${btn ? Math.round(btn.left) : '-'} ellipsis ${cut}`;
  });
}

// A list field never wraps and a table cell ellipsizes, so the Needs you words must show whole at every
// width, not just at a phone and a desktop: the table drops columns by their floors, and the Needs column's floor is its words.
for (const w of [320, 360, 390, 600, 768, 900, 1024, 1100, 1350]) {
  test.describe(`Needs you at ${w}px`, () => {
    test.beforeEach(async ({ hubPage }) => {
      await hubPage.setViewportSize({ width: w, height: 900 });
    });
    test('the words of what waits show whole, never cut by their cell, the row buttons or the page', async ({ hubPage: page }) => {
      await open(page);
      const apps = page.locator('#bot-apps');
      await expect(apps.getByRole('button', { name: strings['flow.wait.go.requested'], exact: true })).toBeVisible();
      expect(await needsCut(apps)).toBe('');
    });
  });
}

for (const w of [390, 1350]) {
  test.describe(`at ${w}px`, () => {
    test.beforeEach(async ({ hubPage }) => {
      await hubPage.setViewportSize({ width: w, height: 900 });
    });

    test('the Chat apps tab: the glance, the Apps table with its waiting lines and the head controls stay inside the page', async ({ hubPage: page }) => {
      await open(page);
      // The Apps section (head with Add / Pause all / menu, then the table) and the glance.
      const apps = page.locator('#bot-apps');
      // channelGroupAsks: the asking group is Support chat's first fix, so its Review is the row's inline action.
      await expect(apps.getByRole('button', { name: strings['flow.wait.go.requested'], exact: true })).toBeVisible();
      // The head menu always holds Settings for all chat apps; at phone width it takes Pause all too (the kit folds the secondary).
      await expect(apps.getByRole('button', { name: 'More actions', exact: true })).toBeVisible();
      if (w > 600) await expect(apps.getByRole('button', { name: strings['chan.pauseAll'], exact: true })).toBeVisible();
      expect(await pastEdge(apps)).toEqual([]);
      expect(await pastEdge(page.locator('#bot-apps-glance'))).toEqual([]);
    });

    test("an app's Chats: every row's buttons and the group steps stay inside the drawer", async ({ hubPage: page }) => {
      await open(page, 'ch-tg');
      const dlg = page.getByRole('dialog');
      await dlg.getByRole('button', { name: strings['chan.rail.chats'], exact: true }).click();
      await dlg.getByRole('button', { name: strings['flow.group.title'], exact: true }).click();
      await expect(dlg.getByText('/bind', { exact: true })).toBeVisible();
      expect(await pastEdge(dlg)).toEqual([]);
    });

    test("an app's Setup: the verdict, the track with its open step and the privacy steps stay inside the drawer", async ({ hubPage: page }) => {
      await open(page, 'ch-sl');
      const dlg = page.getByRole('dialog');
      await expect(dlg.getByRole('list', { name: strings['setup.label'] })).toBeVisible();
      expect(await pastEdge(dlg)).toEqual([]);
      await open(page, 'ch-tg');
      await expect(page.getByRole('dialog').getByText(strings['setup.privacy.restart'], { exact: true })).toBeVisible();
      expect(await pastEdge(page.getByRole('dialog'))).toEqual([]);
    });
  });
}

// The People and Chats tables of an app's drawer show every word whole at every width. A cell never
// clips what it holds: no ellipsizing box (the cell, or one inside it) is overflowing, no word runs past its cell's content edge, and the
// row's buttons stay inside the drawer. The drawer is the viewport's width up to 880, so these widths cover its table, list and phone forms.
/** What is cut in `box`'s table rows: a cell whose content runs past its content edge, or an ellipsizing box that overflows. */
async function cutIn(box: Locator): Promise<string[]> {
  return box.evaluate((root) => {
    const out: string[] = [];
    for (const cell of root.querySelectorAll<HTMLElement>('td, [role="cell"], [role="gridcell"]')) {
      const cs = getComputedStyle(cell);
      const edge = cell.getBoundingClientRect().right - parseFloat(cs.paddingInlineEnd || '0');
      for (const el of [cell, ...cell.querySelectorAll<HTMLElement>('*')]) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        const text = (el.textContent ?? '').trim().slice(0, 40);
        if (getComputedStyle(el).textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1) out.push(`ellipsis ${text}`);
        if (el !== cell && r.right > edge + 1) out.push(`past edge ${text} ${Math.round(r.right)} > ${Math.round(edge)}`);
      }
    }
    // A box that clips (overflow hidden, clip or scroll, no ellipsis needed) with text wider than itself, anywhere up to the table.
    for (const el of root.querySelectorAll<HTMLElement>('*')) {
      if (!Array.from(el.childNodes).some((n) => n.nodeType === 3 && (n.textContent ?? '').trim() !== '')) continue;
      const text = (el.textContent ?? '').trim().slice(0, 40);
      // The rendered text itself (a range over this element's own text nodes), not the element's box.
      const range = document.createRange();
      const own = { left: Infinity, right: -Infinity };
      for (const n of Array.from(el.childNodes)) {
        if (n.nodeType !== 3 || (n.textContent ?? '').trim() === '') continue;
        range.selectNodeContents(n);
        const rr = range.getBoundingClientRect();
        own.left = Math.min(own.left, rr.left);
        own.right = Math.max(own.right, rr.right);
      }
      for (let a: HTMLElement | null = el; a && a !== root; a = a.parentElement) {
        const ar = a.getBoundingClientRect();
        if (ar.width <= 4 || ar.height <= 4 || !/hidden|clip|scroll/.test(getComputedStyle(a).overflowX)) continue;
        if (own.right > ar.right + 1 || own.left < ar.left - 1) out.push(`clipped ${text} by ${a === el ? 'itself' : `${a.tagName.toLowerCase()}.${String(a.className).split(' ')[0]}`}`);
      }
    }
    return out;
  });
}

for (const w of [320, 360, 390, 600, 768, 900, 1024, 1100, 1350]) {
  test.describe(`People and Chats at ${w}px`, () => {
    test.beforeEach(async ({ hubPage }) => {
      await hubPage.setViewportSize({ width: w, height: 900 });
    });

    test("an app's People: the rights Tags, the language and the row's buttons show whole inside the drawer", async ({ hubPage: page }) => {
      await open(page, 'ch-tg');
      const dlg = page.getByRole('dialog');
      await dlg.getByRole('button', { name: strings['chan.rail.people'], exact: true }).click();
      const table = dlg.getByRole('table', { name: /People paired with/ });
      await expect(table).toBeVisible();
      await expect(dlg.getByRole('button', { name: strings['chan.person.add'], exact: true })).toBeVisible();
      // Every value is on the page in the presentation this width draws (table or list): the rights, the language, nothing shed.
      for (const w of [strings['chan.person.owner'], strings['chan.right.chat'], strings['chan.right.control'], strings['chan.right.gates'], strings['set.v.lang.en'], strings['set.v.lang.fr']]) {
        await expect(table).toContainText(w);
      }
      expect(await cutIn(table)).toEqual([]);
      expect(await pastEdge(dlg)).toEqual([]);
    });

    test("an app's Chats: the state, the home mark, the notes and the row's buttons show whole inside the drawer", async ({ hubPage: page }) => {
      await open(page, 'ch-tg');
      const dlg = page.getByRole('dialog');
      await dlg.getByRole('button', { name: strings['chan.rail.chats'], exact: true }).click();
      const table = dlg.getByRole('table', { name: /Chats of/ });
      await expect(table).toBeVisible();
      // The asking group's Approve is its row's inline fix.
      await expect(table.getByRole('button', { name: strings['chan.chat.approve'], exact: true })).toBeVisible();
      // The kind and the state of the chats are on the page in the presentation this width draws, never shed.
      for (const w of [strings['chan.chat.group'], strings['chan.chat.dm'], strings['chan.chat.requested'], strings['chan.chat.approved'], strings['chan.chat.home']]) {
        await expect(table).toContainText(w);
      }
      expect(await cutIn(table)).toEqual([]);
      expect(await pastEdge(dlg)).toEqual([]);
    });
  });
}
