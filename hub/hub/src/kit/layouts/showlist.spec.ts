// Playwright: a fill-mode detail's title starts at the pane's inset whether the list
// is shown or hidden. "Show list" takes Hide list's place in the header's end cluster (page buttons, the pane control,
// then the ⋯ menu last), so no control sits before the title and the first tab lines up with it. Real layout, so a real
// browser.
import { type Page, expect, test } from '@playwright/test';
import { gotoHub } from '@app/e2e';

const SEL = '/scripts?sel=atlas.00a1~weather.ts';

/** The title text's start and the pane-control button's place, both from the detail pane's left edge. */
async function header(page: Page) {
  return page.evaluate(() => {
    const title = document.querySelector<HTMLElement>('#hub-main h2[data-hub-title]');
    const pane = title?.closest('section');
    const head = title?.closest('header');
    if (!title || !pane || !head) throw new Error('no detail header');
    const range = document.createRange();
    range.selectNodeContents(title);
    const text = range.getBoundingClientRect();
    const ctl = [...head.querySelectorAll<HTMLElement>('button')].find((b) => /^(Show|Hide) list/.test(b.getAttribute('aria-label') ?? ''));
    const paneLeft = pane.getBoundingClientRect().left;
    return {
      titleLeft: Math.round(text.left - paneLeft),
      ctl: ctl?.getAttribute('aria-label')?.replace(/\s*\(.*$/, '') ?? null,
      ctlAfterTitle: !!ctl && ctl.getBoundingClientRect().left > text.right,
    };
  });
}

test('at 1440 the title starts at the same inset with the list hidden as with it shown, Show list after it', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoHub(page, SEL);
  await page.locator('#hub-main h2[data-hub-title]').waitFor();
  const shown = await header(page);
  expect(shown.ctl).toBe('Hide list');
  expect(shown.ctlAfterTitle).toBe(true);

  await gotoHub(page, `${SEL}&list=0`);
  await page.locator('#hub-main h2[data-hub-title]').waitFor();
  await expect.poll(async () => (await header(page)).ctl).toBe('Show list');
  const hidden = await header(page);
  expect(hidden.ctlAfterTitle, JSON.stringify(hidden)).toBe(true);
  expect(hidden.titleLeft, JSON.stringify({ shown, hidden })).toBe(shown.titleLeft);
});

/** The header's buttons in DOM order, by name, and where the pane control sits against the title (line, end side). */
async function headerRows(page: Page) {
  return page.evaluate(() => {
    const title = document.querySelector<HTMLElement>('#hub-main section h2[data-hub-title]');
    const pane = title?.closest('section');
    const head = title?.closest('header');
    if (!title || !pane || !head) throw new Error('no detail header');
    const range = document.createRange();
    range.selectNodeContents(title);
    const text = range.getBoundingClientRect();
    const shown = [...head.querySelectorAll<HTMLElement>('button')].filter((b) => b.offsetParent !== null);
    const name = (b: HTMLElement) => (b.getAttribute('aria-label') ?? b.textContent ?? '').replace(/\s*\(.*$/, '').trim();
    const ctl = shown.find((b) => /^(Show|Hide) list/.test(name(b)));
    const last = shown.at(-1)?.getBoundingClientRect();
    const c = ctl?.getBoundingClientRect();
    const p = pane.getBoundingClientRect();
    const h = head.getBoundingClientRect();
    return {
      stacked: head.className.includes('detailStacked'),
      titleLeft: Math.round(text.left - p.left),
      buttons: shown.map(name),
      ctlBelowTitle: !!c && c.top >= text.bottom,
      // The cluster ends the line: its last control (the ⋯ when there is one) at the header's end.
      endAtEnd: !!last && Math.round(h.right - last.right) <= 32,
      // The end group (pane control, ⋯; ListDetailPage.tsx `data-detail-end`): on a wrapped header it keeps the name row
      // and comes first in the DOM, the page's buttons going to the line below (DetailHeader.endcluster.test.tsx).
      endButtons: shown.filter((b) => b.closest('[data-detail-end]')).map(name),
      pageBelowTitle: shown.filter((b) => !b.closest('[data-detail-end]')).every((b) => b.getBoundingClientRect().top >= text.bottom),
      endGroupAtEnd: (() => {
        const e = shown.filter((b) => b.closest('[data-detail-end]')).at(-1)?.getBoundingClientRect();
        return !!e && Math.round(h.right - e.right) <= 32;
      })(),
    };
  });
}

/** The pane control's name: the last button, or the one before a trailing ⋯ menu. */
const paneCtl = (buttons: string[]) => (buttons.at(-1) === 'More actions' ? buttons.at(-2) : buttons.at(-1));

test('a loaded note (actions and menu) with the list hidden: the title at the inset, Show list before the menu', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 900 });
  await gotoHub(page, '/notes');
  await page.getByRole('row').filter({ hasText: 'Meeting notes: storefront review' }).click();
  await page.locator('#hub-main section h2[data-hub-title]').waitFor();
  const shown = await headerRows(page);
  expect(paneCtl(shown.buttons)).toBe('Hide list');
  await page.keyboard.press('Backslash');
  await expect.poll(async () => paneCtl((await headerRows(page)).buttons)).toBe('Show list');
  const hidden = await headerRows(page);
  // NoteDetail's own action first, then the pane control, then the ⋯ menu last.
  expect(hidden.buttons, JSON.stringify(hidden)).toEqual(['Open in a new tab', 'Show list', 'More actions']);
  expect(hidden.titleLeft, JSON.stringify({ shown, hidden })).toBe(shown.titleLeft);
});

test('a stacked header (960, list shown): the title and the end group (pane control, ⋯) keep the first line; the page buttons go below', async ({ page }) => {
  // Probes at 900/960/1100/1440 (scripts, computers, vault, bots; Notes also 1000/1280) found no stacked header with
  // the list hidden, so this case stacks with the list shown. The control is the same element in both states
  // (ListDetailPage.test.tsx keeps it), and the hidden-list placement has its own cases above.
  await page.setViewportSize({ width: 960, height: 900 });
  await gotoHub(page, SEL);
  await page.locator('#hub-main section h2[data-hub-title]').waitFor();
  await expect.poll(async () => (await headerRows(page)).stacked).toBe(true);
  const r = await headerRows(page);
  // The end group keeps the name row (the pane control is not below the title), ends the header with the ⋯ last, and
  // the page's own buttons take the line below.
  expect(paneCtl(r.endButtons), JSON.stringify(r)).toBe('Hide list');
  expect(r.endButtons.at(-1), JSON.stringify(r)).toBe('More actions');
  expect(r.ctlBelowTitle, JSON.stringify(r)).toBe(false);
  expect(r.pageBelowTitle, JSON.stringify(r)).toBe(true);
  expect(r.endGroupAtEnd, JSON.stringify(r)).toBe(true);
  await gotoHub(page, `${SEL}&list=0`);
  await page.locator('#hub-main section h2[data-hub-title]').waitFor();
  await expect.poll(async () => paneCtl((await headerRows(page)).endButtons)).toBe('Show list');
  expect((await headerRows(page)).titleLeft).toBe(r.titleLeft);
});
