// Playwright: every section of the Bot settings drawer (a kit Section: title and one description) draws whole at
// phone and desktop widths: its title and description are visible, nothing runs past the drawer's edge or is cut by a clipping box,
// Helpers shows Who does the work and then Routing, and Advanced shows its four values as Facts.
import { expect, type Locator } from '@playwright/test';
import { gotoHub, noSideScroll, test } from '@app/e2e';
import strings from './strings.en.json';

const BASE = '/bots?sel=c-atlas~a1b2c3d4e5f60718293a4b5c~chief';

/** The text lines and controls inside `box` that run past its left or right edge, or are wider than a clipping ancestor (the rendered text, from the element up). */
async function cutIn(box: Locator): Promise<string[]> {
  return box.evaluate((root) => {
    const edge = root.getBoundingClientRect();
    const out: string[] = [];
    for (const el of root.querySelectorAll<HTMLElement>('*')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (/^(button|a|li|p|span|code|dt|dd|h[1-6])$/i.test(el.tagName) && (r.right > edge.right + 1 || r.left < edge.left - 1)) out.push(`past edge ${(el.textContent ?? '').trim().slice(0, 40)}`);
      if (el.tagName === 'TEXTAREA' || el.tagName === 'OPTION') continue; // a field's own value scrolls inside the field
      if (!Array.from(el.childNodes).some((n) => n.nodeType === 3 && (n.textContent ?? '').trim() !== '')) continue;
      const range = document.createRange();
      let left = Infinity;
      let right = -Infinity;
      for (const n of Array.from(el.childNodes)) {
        if (n.nodeType !== 3 || (n.textContent ?? '').trim() === '') continue;
        range.selectNodeContents(n);
        const rr = range.getBoundingClientRect();
        left = Math.min(left, rr.left);
        right = Math.max(right, rr.right);
      }
      for (let a: HTMLElement | null = el; a && a !== root; a = a.parentElement) {
        const ar = a.getBoundingClientRect();
        if (ar.width <= 4 || ar.height <= 4 || !/hidden|clip/.test(getComputedStyle(a).overflowX)) continue;
        if (getComputedStyle(a).textOverflow === 'ellipsis') continue;
        if (right > ar.right + 1 || left < ar.left - 1) out.push(`clipped ${(el.textContent ?? '').trim().slice(0, 40)}`);
      }
    }
    return out;
  });
}

const SECTIONS: Array<[string, string, string, string]> = [
  ['model', 'bot-set-model', 'model.title', 'model.desc'],
  ['behaviour', 'bot-set-behaviour', 'behaviour.title', 'behaviour.desc'],
  ['workers', 'bot-set-workers', 'workers.who.title', 'workers.desc'],
  ['guardrails', 'bot-set-guard', 'guard.title', 'guard.desc'],
  ['voice', 'bot-set-voice', 'voice.title', 'voice.desc'],
  ['advanced', 'bot-set-advanced', 'advanced.title', 'advanced.desc'],
];

for (const width of [320, 390, 768, 1350]) {
  test.describe(`Bot settings at ${width}px`, () => {
    test.beforeEach(async ({ hubPage }) => {
      await hubPage.setViewportSize({ width, height: 900 });
    });

    for (const [section, id, title, desc] of SECTIONS) {
      test(`${section}: the section's title and description show whole, nothing past the drawer's edge`, async ({ hubPage: page }) => {
        await gotoHub(page, `${BASE}&settings=${section}`, section === 'workers' ? { state: 'workersRouting' } : undefined);
        const dlg = page.getByRole('dialog');
        const box = dlg.locator(`#${id}`);
        await expect(box.getByRole('heading', { name: strings[title as keyof typeof strings], exact: true })).toBeVisible();
        await expect(box.getByText(strings[desc as keyof typeof strings])).toBeVisible();
        expect(await cutIn(box)).toEqual([]);
        await noSideScroll(page);
      });
    }

    test('Helpers: Who does the work, then Routing, each its own section', async ({ hubPage: page }) => {
      await gotoHub(page, `${BASE}&settings=workers`, { state: 'workersRouting' });
      const dlg = page.getByRole('dialog');
      const who = dlg.getByRole('heading', { name: strings['workers.who.title'], exact: true });
      const routing = dlg.getByRole('heading', { name: strings['workers.routing.title'], exact: true });
      await expect(who).toBeVisible();
      await expect(routing).toBeVisible();
      const [a, b] = [await who.boundingBox(), await routing.boundingBox()];
      expect((a?.y ?? 0) < (b?.y ?? 0)).toBe(true);
      await expect(dlg.getByRole('radiogroup', { name: strings['routing.mode'] })).toBeVisible();
    });

    test('Advanced: four facts, the routing one with its way to Helpers', async ({ hubPage: page }) => {
      await gotoHub(page, `${BASE}&settings=advanced`);
      const dlg = page.getByRole('dialog');
      for (const k of ['advanced.routing', 'advanced.async', 'advanced.wait', 'advanced.items'] as const) await expect(dlg.getByText(strings[k], { exact: true })).toBeVisible();
      // The section's action sits in its bar, or under "More" where the bar is narrow.
      if (width < 600) {
        await dlg.getByRole('button', { name: 'More actions', exact: true }).click();
        await expect(page.getByRole('menuitem', { name: strings['advanced.routing.seeHelpers'] })).toBeVisible();
      } else await expect(dlg.getByRole('button', { name: strings['advanced.routing.seeHelpers'] })).toBeVisible();
    });
  });
}
