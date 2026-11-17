// Playwright: AI → Knowledge → Skills at /ai/knowledge/skills (the list and its
// end-to-end cases). The six tagged tests are the functional e2e of a list (FUNCTIONAL RULE): each proves its state in
// the URL. Fixtures: the ai page's states (default; skillsMany has 60 skills, a second page; skillsTrust answers the trust
// change).
import { type Page, expect, test } from '@playwright/test';
import { expectLinkSearchDroppedOnReload, expectSearchStaysOutOfUrl, gotoHub, noSideScroll } from '@app/e2e';
import { links } from './links';
import strings from './knowledge/skills/strings.en.json';
import trust from './knowledge/skills/trust.strings.en.json';

const table = (page: Page) => page.getByRole('table', { name: strings.title });
const dataRows = (page: Page) => table(page).locator('tbody tr');
const fill = (s: string, v: Record<string, string>) => s.replace(/\{\{(\w+)\}\}/g, (_, k: string) => v[k] ?? '');

test('@search the search box narrows the skills and never writes ?q', async ({ page }) => {
  await gotoHub(page, links.skills);
  await expect(dataRows(page).first()).toBeVisible();
  // The search stays out of the URL, proved by the shared helper (the URL, history state and every link, sampled through a settle window).
  await expectSearchStaysOutOfUrl(page, { param: '', box: page.getByRole('searchbox') }, {
    text: 'pdf-tools',
    searched: async () => {
      await expect(dataRows(page)).toHaveCount(1);
      await expect(dataRows(page).first()).toContainText('pdf-tools');
    },
  });
});

test('@filter State = Off keeps ?state and only Off skills', async ({ page }) => {
  await gotoHub(page, links.skills);
  await page.getByRole('group', { name: 'Filters' }).getByRole('button', { name: strings['filter.state'] }).click();
  await page.getByRole('menuitemradio', { name: strings['state.off'] }).or(page.getByRole('menuitem', { name: strings['state.off'] })).click();
  await expect(page).toHaveURL(/[?&]state=off/);
  await expect(dataRows(page).first()).toBeVisible();
  for (const row of await dataRows(page).all()) await expect(row).toContainText(strings['state.off']);
  // The chosen filter shows as a chip with its own clear button; clearing it drops ?state and brings the On skills back.
  const clear = page.getByRole('group', { name: 'Filters' }).getByRole('button', { name: `Clear ${strings['filter.state']}` });
  await expect(clear).toBeVisible();
  await clear.click();
  await expect(page).not.toHaveURL(/[?&]state=/);
  await expect(dataRows(page).filter({ has: page.getByRole('cell', { name: strings['state.on'], exact: true }) }).first()).toBeVisible(); // any On row: the list is back
});

test('@sort the Trust header sorts the skills and keeps ?sort', async ({ page }) => {
  await gotoHub(page, links.skills);
  const header = table(page).getByRole('columnheader', { name: strings['col.trust'] });
  // The Trust cells in the order shown, and whether each row is a skill that can't be read. An unreadable skill ranks first
  // for attention, so it sits at one end: first one way, last the other. It is left out of the trust comparison.
  const labels = [strings['trust.local'], strings['trust.trusted'], strings['trust.untrusted'], strings['trust.changed']];
  const shown = () =>
    dataRows(page).evaluateAll(
      (trs, [ls, broken]) =>
        trs.map((tr) => {
          // textContent: the cell's own words. A StatusPill shows them in capitals (CSS text-transform), which innerText returns.
          const cells = Array.from((tr as HTMLTableRowElement).cells, (c) => (c.textContent ?? '').trim());
          return { broken: cells.includes(broken as string), trust: cells.find((x) => (ls as string[]).includes(x)) ?? '' };
        }),
      [labels, strings['state.broken']] as const,
    );
  const trusts = async () => (await shown()).filter((r) => !r.broken).map((r) => r.trust);
  // Where the unreadable rows are: 'first' or 'last' when they are together at that end, '' otherwise.
  const brokenEnd = async () => {
    const b = (await shown()).map((r) => r.broken), n = b.filter(Boolean).length;
    if (n === 0) return '';
    return b.slice(0, n).every(Boolean) ? 'first' : b.slice(-n).every(Boolean) ? 'last' : '';
  };
  // The list's own rank (attentionRank in knowledge/skills/logic.ts): not trusted and changed first, then made here and trusted.
  // A direction is that rank or its reverse (ties in any order), never the words' order.
  const rank = (v: string) => (v === strings['trust.untrusted'] || v === strings['trust.changed'] ? 1 : 2);
  const ranked = (vs: string[], dir: 1 | -1) => vs.every((v, i) => i === 0 || dir * (rank(v) - rank(vs[i - 1]!)) >= 0);
  await header.getByRole('button').click();
  await expect(page).toHaveURL(/[?&]sort=-?trust/);
  await expect(header).toHaveAttribute('aria-sort', /ascending|descending/);
  const one = await trusts();
  expect(new Set(one).size).toBeGreaterThan(1);
  const end = await brokenEnd();
  expect(end).not.toBe('');
  expect(one.filter((v, i) => i > 0 && v !== one[i - 1]).length).toBe(new Set(one).size - 1);
  // The sort key of the hash route's own query.
  const urlKey = () => new URLSearchParams(page.url().split('#')[1]?.split('?')[1] ?? '').get('sort');
  const firstSort = urlKey();
  expect(firstSort).toMatch(/^-?trust$/);
  await header.getByRole('button').click();
  await expect.poll(urlKey).toBe(firstSort === 'trust' ? '-trust' : 'trust');
  // The other direction groups them too, in another order (the list orders trust by its own rank, not the words).
  await expect.poll(async () => JSON.stringify(await trusts())).not.toBe(JSON.stringify(one));
  const two = await trusts();
  expect(two.filter((v, i) => i > 0 && v !== two[i - 1]).length).toBe(new Set(two).size - 1);
  expect([...two].sort()).toEqual([...one].sort());
  expect(await brokenEnd()).toBe(end === 'first' ? 'last' : 'first');
  // Each direction follows the rank: one ascending, the other its reverse (ties allowed).
  const dir = firstSort === 'trust' ? 1 : -1;
  expect(ranked(one, dir)).toBe(true);
  expect(ranked(two, dir === 1 ? -1 : 1)).toBe(true);
});

test('@page with 60 skills the pager moves to page 2 and keeps ?page', async ({ page }) => {
  await gotoHub(page, links.skills, { state: 'skillsMany' });
  await expect(dataRows(page).first()).toBeVisible();
  const first = await dataRows(page).first().innerText();
  await page.getByRole('navigation', { name: 'Pages' }).getByRole('button', { name: 'Next page' }).click();
  await expect(page).toHaveURL(/[?&]page=2/);
  await expect(dataRows(page).first()).not.toHaveText(first);
  await page.goBack();
  await expect(page).not.toHaveURL(/[?&]page=/);
});

test('@reload State, sort and page survive a reload, the search does not', async ({ page }) => {
  test.slow(); // the proof opens the page three times (preflight, link, reload) and waits out a settle window after each
  // The link brings the search with State, sort and page 2; the helper proves the search is adopted and gone after the
  // reload while every kept key keeps its value. 'team' is the description of the 54 notes-NN skills (the seed's
  // release-notes are not among them); 'notes' is not used: it is a nav link.
  await expectLinkSearchDroppedOnReload(page, { param: '', box: page.getByRole('searchbox') }, {
    text: 'team',
    path: links.skills,
    goto: { state: 'skillsMany' },
    keep: { state: 'on', sort: 'name', page: '2' },
    searched: async () => {
      await expect(page.getByRole('navigation', { name: 'Pages' })).toContainText('of 54');
      await expect(dataRows(page)).toHaveCount(4);
    },
    unsearched: async () => {
      await expect(page.getByRole('navigation', { name: 'Pages' })).toContainText('of 57');
      await expect(dataRows(page)).toHaveCount(7);
    },
    after: async () => {
      await expect(page.getByRole('navigation', { name: 'Pages' })).toContainText('51');
    },
  });
});

test('@no-match a search with no skill shows "No skills match."; Clear filters brings them back', async ({ page }) => {
  await gotoHub(page, links.skills);
  await expect(dataRows(page).first()).toBeVisible();
  const before = await dataRows(page).count();
  await page.getByRole('searchbox').fill('zzz');
  await expect(page.getByText(strings.noMatch)).toBeVisible();
  await expect(page).not.toHaveURL(/[?&]q=/);
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page).not.toHaveURL(/[?&]q=/);
  await expect.poll(() => dataRows(page).count()).toBe(before);
});

test('an untrusted skill that is on says so; switching it off leaves it not trusted', async ({ page }) => {
  await gotoHub(page, links.skills);
  await dataRows(page).filter({ hasText: 'deploy-check' }).click();
  await expect(page.getByText(strings['use.untrustedOn'])).toBeVisible();
  const sw = page.getByRole('switch', { name: strings['use.switch'] });
  await expect(sw).toBeChecked();
  await page.getByText(strings['use.switch'], { exact: true }).click(); // the drawn track covers the input; its label toggles it as a person would
  await expect(sw).not.toBeChecked();
  await expect(page.getByText(strings['use.done.off'])).toBeVisible();
  await page.goBack();
  const row = dataRows(page).filter({ hasText: 'deploy-check' });
  await expect(row).toContainText(strings['state.off']);
  await expect(row).toContainText(strings['trust.untrusted']);
});

for (const width of [1440, 390]) {
  test(`at ${width}: Review and trust opens a confirm inside the viewport; Trust it trusts the skill and the list says so`, async ({ page }) => {
    await page.setViewportSize({ width, height: width < 600 ? 844 : 900 });
    await gotoHub(page, links.skills, { state: 'skillsTrust' });
    const row = dataRows(page).filter({ hasText: 'deploy-check' });
    await expect(row).toContainText(strings['trust.untrusted']);
    await row.click();
    await page.getByRole('button', { name: trust['grant.open'], exact: true }).click();
    const dialog = page.getByRole('alertdialog', { name: fill(trust['grant.title'], { name: 'deploy-check' }) });
    await expect(dialog).toBeVisible();
    const box = (await dialog.boundingBox())!;
    expect(box.x >= 0 && box.x + box.width <= width + 0.5, 'the confirm fits the width').toBe(true);
    const go = dialog.getByRole('button', { name: trust['grant.confirm'], exact: true });
    await go.scrollIntoViewIfNeeded();
    await expect(go).toBeInViewport();
    await go.click();
    await expect(page.getByText(fill(trust['done.grant'], { name: 'deploy-check' }))).toBeVisible();
    await page.goBack();
    await expect(dataRows(page).filter({ hasText: 'deploy-check' })).toContainText(strings['trust.trusted']);
    await noSideScroll(page);
  });
}
