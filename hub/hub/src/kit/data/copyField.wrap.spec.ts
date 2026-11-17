// A CopyField whose value is a web address (the kit shows it as its
// ExtLink) shows the whole address on a phone and on a desktop: it wraps inside the field, and nothing between the link
// and the field clips it or cuts it with an ellipsis. Any other value (a code, a command, an address shown plain) keeps
// its one line with an ellipsis. Measured on the Bots Link tab's address drawers: the chat page's
// address (a link) and the OpenAI-compatible base (plain).
import { expect, type Page } from '@playwright/test';
import { gotoHub, test } from '@app/e2e';

const LINK_TAB = '/bots?sel=c-atlas~a1b2c3d4e5f60718293a4b5c~chief&tab=link';
const VALUE = '[class*="fieldValue"]';

/** Each shown CopyField value: whether it holds a link, the link's text, and what clips or cuts it. */
function fields(page: Page) {
  return page.evaluate((sel) => {
    const out: Array<{ link: boolean; text: string; cut: string[]; oneLine: boolean }> = [];
    for (const v of document.querySelectorAll<HTMLElement>(sel)) {
      if (v.getClientRects().length === 0) continue;
      const a = v.querySelector<HTMLElement>(':scope > a');
      const cut: string[] = [];
      const box = v.parentElement as HTMLElement;
      for (let n: Element | null = a ?? v; n && n !== box.parentElement; n = n.parentElement) {
        const cs = getComputedStyle(n);
        if (n.scrollWidth > n.clientWidth + 1 && cs.overflowX !== 'visible') cut.push(`${n.tagName} clips ${n.scrollWidth}>${n.clientWidth}`);
        if (cs.textOverflow === 'ellipsis' && cs.whiteSpace === 'nowrap') cut.push(`${n.tagName} ellipsis`);
      }
      const r = (a ?? v).getBoundingClientRect();
      if (r.right > document.documentElement.clientWidth) cut.push(`right ${Math.round(r.right)}`);
      const cs = getComputedStyle(v);
      out.push({ link: a !== null, text: (a ?? v).innerText, cut, oneLine: cs.whiteSpace === 'nowrap' && cs.textOverflow === 'ellipsis' });
    }
    return out;
  }, VALUE);
}

/** Open one address's How to use it drawer on the Link tab (the addresses are a table's rows). */
async function openDoor(page: Page, kind: RegExp) {
  const row = page.getByRole('table', { name: 'Addresses' }).getByRole('row', { name: kind });
  await row.getByRole('button', { name: 'Row actions' }).click();
  await page.getByRole('menuitem', { name: /^How to use the / }).click();
  // Named: the row menu is a dialog too while it closes.
  const d = page.getByRole('dialog', { name: / address$/ });
  await expect(d).toBeVisible();
  // The drawer slides in from the side: measure once it has come to rest inside the viewport.
  await expect.poll(() => d.evaluate((el) => el.getBoundingClientRect().right <= document.documentElement.clientWidth + 1)).toBe(true);
}

for (const [name, coarse] of [
  ['desktop', false],
  ['phone', true],
] as const) {
  test(`${name}: a CopyField address shows whole and wraps; other values keep one line with an ellipsis`, async ({ hubPage, hubPageCoarse }) => {
    const page = coarse ? hubPageCoarse : hubPage;
    await gotoHub(page, LINK_TAB);
    // A plain value: the OpenAI-compatible address, which a program calls (copied, not opened).
    await openDoor(page, /OpenAI-compatible/);
    const others = (await fields(page)).filter((f) => !f.link);
    expect(others.length).toBeGreaterThan(0);
    for (const f of others) expect(f.oneLine, f.text).toBe(true);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: / address$/ })).toBeHidden();
    // A web address: the chat page, which opens.
    await openDoor(page, /Chat page/);
    await expect(page.locator(`${VALUE} > a`).first()).toBeVisible();
    const links = (await fields(page)).filter((f) => f.link);
    expect(links.length).toBeGreaterThan(0);
    for (const f of links) {
      expect(f.text).toMatch(/^https:\/\/\S+$/);
      expect(f.cut, f.text).toEqual([]);
    }
    // A field narrower than its address (a 12rem column): the address wraps onto more lines, still whole and uncut.
    await page.locator(VALUE).filter({ has: page.locator(':scope > a') }).first().evaluate((v) => {
      (v.parentElement as HTMLElement).style.maxWidth = '12rem'; // the field's box: the value and Copy
    });
    const [narrow] = (await fields(page)).filter((f) => f.link);
    expect(narrow?.cut, narrow?.text).toEqual([]);
    // The address takes more than one line: its text's line boxes, counted whatever box the link is (inline on a fine
    // pointer; on a coarse one the kit boxes a standalone address in a 44 px inline-flex, which has one rect).
    const lines = await page.locator(`${VALUE} > a`).first().evaluate((a) => {
      const r = document.createRange();
      r.selectNodeContents(a.querySelector('bdi') ?? a); // the address's own words, not the icon after them
      return new Set([...r.getClientRects()].filter((b) => b.width > 0).map((b) => Math.round(b.top))).size;
    });
    expect(lines, 'the narrow address wraps').toBeGreaterThan(1);
  });
}
