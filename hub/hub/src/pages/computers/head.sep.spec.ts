// Playwright: the detail header's line under the name (server · project · Current computer) never leaves a "·" at
// the end or the start of a line when it wraps, and keeps one between items that share a line, left to right and right
// to left. An opened computer takes the whole pane, so at real widths the line fits on one; the line is given less room
// step by step (longer server or project names, other languages) until it wraps. happy-dom does no layout, so this
// measures the real page.
import { expect, test, type Page } from '@playwright/test';
import { gotoHub } from '@app/e2e';

interface Item { text: string; top: number; // the vertical centre: items of one line share it
  trailing: string; leadVisible: boolean; lead: string }

async function items(page: Page): Promise<Item[]> {
  const line = page.locator('header [class*="headLine"]').first();
  await line.waitFor({ timeout: 15000 });
  return line.evaluate((el) => {
    // The clip's inline-start inset (left in LTR, right in RTL): a lead whose separator sits beyond it is cut away.
    const box = el.getBoundingClientRect();
    const rtl = getComputedStyle(el).direction === 'rtl';
    const m = /inset\(([^)]*)\)/.exec(getComputedStyle(el).clipPath)?.[1]?.trim().split(/\s+/) ?? [];
    const inset = m.length === 4 ? parseFloat(m[rtl ? 1 : 3]!) : 0;
    const clipStart = rtl ? box.right - inset : box.left + inset;
    return [...el.children].map((c) => {
      const r = c.getBoundingClientRect();
      const before = getComputedStyle(c, '::before');
      const lead = before.content === 'none' || before.content === 'normal' ? '' : before.content;
      const width = parseFloat(before.width) || 0;
      return {
        text: (c.textContent ?? '').trim(),
        top: Math.round(r.top + r.height / 2),
        trailing: ['none', 'normal'].includes(getComputedStyle(c, '::after').content) ? '' : getComputedStyle(c, '::after').content,
        lead,
        leadVisible: lead !== '' && (rtl ? r.right - width / 2 < clipStart : r.left + width / 2 > clipStart),
      };
    });
  });
}

// The room the line is given, from as laid out (0: no limit) down to one item a line, in px including the clipped lead.
const ROOMS = [0, 360, 320, 280, 240, 200, 160];
// Items of one line share their vertical centre within a few px (a flag or a button is a little taller than text);
// a wrapped line sits a whole line lower.
const sameLine = (a: Item, b: Item) => Math.abs(a.top - b.top) <= 4;

async function check(page: Page, dir: 'ltr' | 'rtl') {
  // Seven rooms in one page load; two tests share a busy dev server, so the default 30 s is too tight.
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoHub(page, '/computers?sel=atlas.00a1');
  if (dir === 'rtl') await page.evaluate(() => { document.documentElement.dir = 'rtl'; });
  let wrapped = 0;
  for (const w of ROOMS) {
    await page.locator('header [class*="headLine"]').first().evaluate((el, room) => {
      if (room) (el as HTMLElement).style.setProperty('max-width', `${room}px`);
      else (el as HTMLElement).style.removeProperty('max-width');
    }, w);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const list = await items(page);
    expect(list.length, `${w}: items`).toBeGreaterThanOrEqual(2);
    if (list.some((it, i) => i > 0 && !sameLine(list[i - 1]!, it))) wrapped++;
    list.forEach((it, i) => {
      // Nothing trails an item, so no line can end in a separator.
      expect(it.trailing, `${w}: ${it.text}: nothing after it`).toBe('');
      const startsLine = i === 0 || !sameLine(list[i - 1]!, it);
      expect(it.leadVisible, `${w}: ${it.text}: ${startsLine ? 'no "·" at a line start' : 'a "·" before it'}`).toBe(!startsLine);
    });
  }
  // The check means something only if some room wrapped the line.
  expect(wrapped, 'some room wraps the line').toBeGreaterThan(0);
  const actual = await page.locator('header [class*="headLine"]').first().evaluate((el) => getComputedStyle(el).direction);
  expect(actual, 'the line runs in the asked direction').toBe(dir);
}

test('@head the header meta line has a "·" only between items on one line, wrapped or not', async ({ page }) => {
  await check(page, 'ltr');
});

// The clip is mirrored for right-to-left (.headLine:dir(rtl)): without the mirror a wrapped line would start with a "·".
test('@head right to left: the same, with the clip on the right', async ({ page }) => {
  await check(page, 'rtl');
});
