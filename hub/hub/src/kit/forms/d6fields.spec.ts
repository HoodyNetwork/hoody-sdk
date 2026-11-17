// Playwright: every text and search field is 40 px high, the same as a large button: the input, and
// every wrapper box around it up to the row that holds its button (the Home Ask field and its 40 px Ask button share
// one top and bottom edge). Measured at normal density with a fine pointer (compact density makes a control 32 px and
// a coarse pointer 44 px, by their own tested rules). Covered: the page fields, the table toolbar searches (whose 44 px
// toolbar row keeps its height and wraps without overflow on a phone), and the fields that only exist once opened: the
// search of a long Select (a portalled popover), the code editor's Find, and the command palette's search.
import { expect, test, type Page } from '@playwright/test';
import { gotoHub } from '@app/e2e';

test.describe.configure({ timeout: 90_000 });

const PAGES = ['/account', '/bots', '/logs', '/notes', '/vault', '/home'];
/** Pages whose table toolbar holds a search. */
const TOOLBAR_PAGES = new Set(['/account', '/bots', '/notes', '/vault']);

interface Box {
  name: string;
  h: number;
  chain: { what: string; h: number }[];
  /** The button in the row that ends the chain, when one is there: its top and bottom against the field's. */
  button: { name: string; top: number; bottom: number; fieldTop: number; fieldBottom: number } | null;
}

/** Each visible text-like input under `root`: its height, and the wrappers from its parent up to (not including) the
 * first box that holds a button outside the field, a visible label or description, another input, or a form. */
async function fields(page: Page, root: string): Promise<Box[]> {
  return page.evaluate((rootSel) => {
    const out: Box[] = [];
    const host = document.querySelector(rootSel);
    if (!host) return out;
    const shown = (e: Element) => {
      const r = e.getBoundingClientRect();
      return r.width > 2 && r.height > 2;
    };
    for (const inp of host.querySelectorAll<HTMLInputElement>('input')) {
      if (!/^(text|search|email|password|url|tel)$/.test(inp.type) || !shown(inp)) continue;
      const ir = inp.getBoundingClientRect();
      // A button drawn inside the input's own box belongs to the field (a search's clear button).
      const inside = (b: Element) => {
        const r = b.getBoundingClientRect();
        return r.left >= ir.left - 1 && r.right <= ir.right + 1 && r.top >= ir.top - 1 && r.bottom <= ir.bottom + 1;
      };
      const chain: { what: string; h: number }[] = [];
      let button: Box['button'] = null;
      let a: HTMLElement | null = inp.parentElement;
      let last: HTMLElement = inp;
      while (a && a !== host && a.tagName !== 'FORM') {
        const foreign = [...a.querySelectorAll('button, [role="button"]')].filter((b) => !inside(b) && shown(b));
        const label = [...a.querySelectorAll('label, [class*="description"], [class*="help"]')].some((l) => shown(l) && (l.textContent ?? '').trim() !== '');
        const others = [...a.querySelectorAll('input, textarea')].filter((x) => x !== inp && shown(x)).length > 0;
        if (foreign.length || label || others) {
          // The row that ends the field: its submit button (the Home Ask) shares the field's top and bottom edge.
          const b = foreign.find((x) => x.getAttribute('type') === 'submit');
          if (b && !label && !others) {
            const br = b.getBoundingClientRect();
            const field = last.getBoundingClientRect(); // the outermost wrapper of the field
            button = { name: (b.getAttribute('aria-label') ?? b.textContent ?? '').trim().slice(0, 30), top: +br.top.toFixed(1), bottom: +br.bottom.toFixed(1), fieldTop: +field.top.toFixed(1), fieldBottom: +field.bottom.toFixed(1) };
          }
          break;
        }
        last = a;
        chain.push({ what: `${a.tagName.toLowerCase()}.${[...a.classList].join('.').slice(0, 60)}`, h: +a.getBoundingClientRect().height.toFixed(1) });
        a = a.parentElement;
      }
      out.push({ name: `${inp.type} "${inp.getAttribute('aria-label') ?? inp.placeholder}"`, h: +inp.getBoundingClientRect().height.toFixed(1), chain, button });
    }
    return out;
  }, root);
}

function expect40(list: Box[], where: string) {
  expect(list.length, `${where}: a field is shown`).toBeGreaterThan(0);
  for (const f of list) {
    expect(f.h, `${where} ${f.name}: the input`).toBe(40);
    for (const c of f.chain) expect(c.h, `${where} ${f.name}: wrapper ${c.what}`).toBe(40);
    if (f.button) {
      expect(f.button.top, `${where} ${f.name}: "${f.button.name}" shares the field's top edge`).toBe(f.button.fieldTop);
      expect(f.button.bottom, `${where} ${f.name}: "${f.button.name}" shares the field's bottom edge`).toBe(f.button.fieldBottom);
    }
  }
}

async function loaded(page: Page) {
  await expect(page.locator('#hub-main [data-skeleton]')).toHaveCount(0, { timeout: 20_000 });
}

for (const w of [1440, 390]) {
  for (const p of PAGES) {
    test(`${p} at ${w}: every text and search field box is 40 px`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 900 });
      await gotoHub(page, p);
      await loaded(page);
      const list = await fields(page, '#hub-main');
      expect40(list, p);
      if (p === '/home') {
        // The Home case: the Ask field's wrappers up to the row of its Ask button, and the button's edges.
        const ask = list.find((f) => f.button !== null);
        expect(ask?.chain.length ?? 0, 'the Ask field has its wrappers measured').toBeGreaterThanOrEqual(2);
        expect(ask?.button?.name, 'the row ends at the Ask button').toMatch(/^Ask/);
      }
      if (!TOOLBAR_PAGES.has(p)) return;
      // The toolbar that holds the search keeps its row on one line at 1440: 53 px (its 40 px controls, 6 px above and
      // below, and the row's 1 px hairline). On a phone it may wrap, but holds its controls (no overflow, none on top of another).
      const bars = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('#hub-main [data-hub-search]')].map((s) => {
          const bar = s.parentElement!;
          const kids = [...bar.children].map((k) => k.getBoundingClientRect()).filter((r) => r.width > 0 && r.height > 0);
          let overlap = false;
          for (let i = 0; i < kids.length; i++)
            for (let j = i + 1; j < kids.length; j++) {
              const a = kids[i]!, b = kids[j]!;
              if (a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5) overlap = true;
            }
          return { h: +bar.getBoundingClientRect().height.toFixed(1), over: bar.scrollWidth - bar.clientWidth, overlap };
        }),
      );
      expect(bars.length, `${p}: the table toolbar shows its search`).toBeGreaterThan(0);
      for (const b of bars) {
        if (w === 1440) expect(b.h, `${p}: the toolbar keeps its 53 px row`).toBe(53);
        expect(b.over, `${p}: nothing spills out of the toolbar`).toBeLessThanOrEqual(1);
        expect(b.overlap, `${p}: no toolbar control sits on another`).toBe(false);
      }
    });
  }
}

test.describe('fields that exist once opened', () => {
  test('the search of a long Select, in its popover, is 40 px (Logs source on a phone)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await gotoHub(page, '/logs');
    await loaded(page);
    // The source Select is the only button named What inside the Logs toolbar (a group labelled Logs); other buttons
    // whose names contain What sit outside it, and a second match inside would fail Playwright's strict mode.
    await page.getByRole('group', { name: 'Logs', exact: true }).getByRole('button', { name: /What/ }).click();
    const pop = page.locator('[role="dialog"]:has(input), [data-trigger]:has(input), .react-aria-Popover:has(input)').last();
    await expect(pop).toBeVisible();
    const h = await pop.locator('input').first().evaluate((i) => i.getBoundingClientRect().height);
    expect(h, 'the Select search').toBe(40);
  });

  for (const w of [1440, 390]) {
    test(`the code editor's Find field is 40 px at ${w}`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 900 });
      await gotoHub(page, '/_kit?tab=secure');
      const editor = page.locator('[class*="CodeEditor-module__editor"]').first();
      await expect(editor).toBeVisible({ timeout: 20_000 });
      await editor.getByRole('button', { name: /^Find/ }).click();
      expect40(await fields(page, '[class*="CodeEditor-module__editor"]'), `Find at ${w}`);
    });

    test(`the command palette's search is 40 px at ${w}`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 900 });
      await gotoHub(page, '/home');
      await loaded(page);
      await page.keyboard.press('Control+k');
      const box = page.getByRole('dialog');
      await expect(box.getByRole('searchbox')).toBeVisible();
      // The input, its search row (the separator takes no height), the results below the row, and on a phone the
      // Close button inside the row.
      const m = await box.evaluate((d) => {
        const input = d.querySelector('input[type="search"]')!;
        const row = input.parentElement!;
        const r = row.getBoundingClientRect();
        const list = d.querySelector('[role="listbox"], [role="menu"], [role="grid"]');
        const close = [...d.querySelectorAll('button')].find((b) => b.getBoundingClientRect().width > 0 && !row.contains(b) && /close/i.test(b.getAttribute('aria-label') ?? ''));
        const c = close?.getBoundingClientRect();
        return { input: input.getBoundingClientRect().height, row: r.height, rowTop: r.top, rowBottom: r.bottom, listTop: list ? list.getBoundingClientRect().top : null, close: c ? { top: c.top, bottom: c.bottom } : null };
      });
      expect(m.input, 'the palette search').toBe(40);
      expect(m.row, 'the palette search row').toBe(40);
      expect(m.listTop, 'the results list is there').not.toBeNull();
      expect(m.listTop!, 'the results start at or below the search row').toBeGreaterThanOrEqual(m.rowBottom - 0.5);
      // A visible Close sits inside the row at every width; a phone must have one (the desktop palette shows none).
      if (w === 390) expect(m.close, 'a phone has its Close button').not.toBeNull();
      if (m.close) {
        expect(m.close.top, 'Close sits inside the search row (top)').toBeGreaterThanOrEqual(m.rowTop - 0.5);
        expect(m.close.bottom, 'Close sits inside the search row (bottom)').toBeLessThanOrEqual(m.rowBottom + 0.5);
      }
      // Forced colours drop ordinary shadows: the row keeps its separator there, still without layout height.
      await page.emulateMedia({ forcedColors: 'active' });
      const hc = await box.evaluate((d) => {
        const row = d.querySelector('input[type="search"]')!.parentElement!;
        const kids = [...row.children].filter((c) => c.getBoundingClientRect().width > 0).map((c) => getComputedStyle(c).forcedColorAdjust);
        return { shadow: getComputedStyle(row).boxShadow, adjust: getComputedStyle(row).forcedColorAdjust, row: row.getBoundingClientRect().height, kids };
      });
      expect(hc.adjust, 'forced colours: the row keeps its own separator').toBe('none');
      expect(hc.shadow, 'forced colours: the separator is drawn').not.toBe('none');
      expect(hc.row, 'forced colours: the search row').toBe(40);
      expect(hc.kids.length, 'forced colours: the row holds its icon and input').toBeGreaterThanOrEqual(2);
      expect(hc.kids, 'forced colours: the icon and input keep their system colours').toEqual(hc.kids.map(() => 'auto'));
      if (w === 390) {
        // The phone Close at the sheet's top edge draws its focus ring inside the button (the modal clips outside).
        const closeBtn = box.getByRole('button', { name: /close/i });
        await page.emulateMedia({ forcedColors: 'none' });
        await closeBtn.focus();
        await page.keyboard.press('Shift+Tab');
        await page.keyboard.press('Tab');
        const ring = await closeBtn.evaluate((b) => ({ fv: b.hasAttribute('data-focus-visible'), shadow: getComputedStyle(b).boxShadow }));
        expect(ring.fv, 'Close has keyboard focus').toBe(true);
        expect(ring.shadow, 'Close: the focus ring is drawn inside the button').toMatch(/inset/);
      }
    });
  }
});
