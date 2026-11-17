// Playwright: the launch card in a real Board display tile, in both themes and at
// phone, laptop and wide widths. The tile body is the app window's colour (dark in both themes); the card draws on
// its own theme surface, centred, and passes axe colour contrast. On fixtures: the Board's Add link places display-15001
// of atlas, then the page's own launch store is given a Firefox launch there (the fixture build never sends one).
import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import strings from './strings.en.json';

type Case = 'wait' | 'slow' | 'ended' | 'held';
// A cold dev server builds the Hub on the first visit; the Board, the launch store and axe run after it.
test.setTimeout(180_000);
const fill = (s: string, name = 'Firefox') => s.replace('{{name}}', name);

const ATLAS = 'c0a7150000000000000000a1';

/** The seed, as a module script on the dev server: it imports the page's own launch store (the same instances the
 *  Board runs) and writes a Firefox launch at display-15001 of atlas, arrived `ago` ms before, in the state asked. */
function seed(kind: Case): string {
  const state = kind === 'ended' ? 'exited' : kind === 'held' ? 'unknown' : 'running';
  const ago = kind === 'slow' ? 26000 : 0;
  return `
import { fixtureWorld } from '/src/core/world.ts';
import { ops } from '/src/pages/apps/parts/ops.ts';
import { fromHandle } from '/src/pages/apps/parts/recent.ts';
import { arriving } from '/src/pages/apps/parts/arrival.ts';
const c = fixtureWorld.current;
const key = 'card-${kind}';
const h = { v: 1, terminal_id: 15001, incarnation: 'c'.repeat(32), command_id: 7, display: 15001, launch_tag: '1'.repeat(16), opens_in: 'window', computer: { project: c.project_id, computer_id: c.id } };
ops.addLaunch({ key, name: 'Firefox', catalogId: 'firefox', app: 'firefox', opensIn: 'screen', state: '${state}', code: '${kind === 'held' ? 'start_unconfirmed' : ''}', ${kind === 'ended' ? 'exitCode: 1, ' : ''}terminal: 15001, handle: h.launch_tag, source: '', command: '', settings: [], urls: {}, startedAt: Date.now(), computer: c.id });
ops.bind(key, fromHandle(h, { name: 'Firefox', catalogId: 'firefox', app: 'firefox' }, 1));
arriving(key, Date.now() - ${ago});
`;
}

/** Board with display-15001 of atlas, then a Firefox launch at that display in the state asked. */
async function boardWith(page: Page, theme: 'light' | 'dark', kind: Case) {
  await gotoHub(page, `/board?add=display-15001&cid=${ATLAS}`, { theme });
  // No cap of its own (as the Board's specs): a cold dev server takes a while to build the Board; the test's budget bounds it.
  await expect(page.locator('iframe[title="display-15001 on atlas"]')).toBeAttached({ timeout: 0 });
  await page.addScriptTag({ type: 'module', content: seed(kind) });
}

/** The card's box equals its parent's content box (the tile body less its padding and borders), within a pixel. */
async function expectCovers(card: Locator) {
  const [box, content] = await card.evaluate((el) => {
    const p = el.parentElement!;
    const r = p.getBoundingClientRect();
    const cs = getComputedStyle(p);
    const n = (v: string) => parseFloat(v) || 0;
    const c = el.getBoundingClientRect();
    return [
      [c.left, c.top, c.right, c.bottom],
      [r.left + n(cs.borderLeftWidth) + n(cs.paddingLeft), r.top + n(cs.borderTopWidth) + n(cs.paddingTop),
        r.right - n(cs.borderRightWidth) - n(cs.paddingRight), r.bottom - n(cs.borderBottomWidth) - n(cs.paddingBottom)],
    ];
  });
  box.forEach((v, i) => expect(Math.abs(v - content[i]!)).toBeLessThanOrEqual(1));
}

const group = (page: Page, kind: Case) =>
  page.getByRole('group', { name: kind === 'ended' ? fill(strings['st.error']) : kind === 'held' ? fill(strings['hold.title']) : fill(strings['card.starting']) });

for (const theme of ['light', 'dark'] as const) {
  for (const kind of ['wait', 'slow', 'ended', 'held'] as const) {
    for (const [w, h] of [[390, 844], [1100, 800], [1440, 900]] as const) {
      test(`launch card ${kind} in a Board display tile, ${theme} at ${w}: own surface, centred, axe contrast`, async ({ page }, info) => {
        await page.setViewportSize({ width: w, height: h });
        await boardWith(page, theme, kind);
        const card = group(page, kind);
        await expect(card).toBeVisible({ timeout: 30_000 });
        // Its own theme surface, never the tile body's app colour.
        const bg = await card.evaluate((el) => getComputedStyle(el).backgroundColor);
        const body = await card.evaluate((el) => getComputedStyle(el.parentElement!).backgroundColor);
        expect(bg).not.toBe(body);
        expect(bg).not.toBe('rgba(0, 0, 0, 0)');
        // It covers the tile body's whole content box, so no strip of the app colour shows around it.
        await expectCovers(card);
        // Centred: the frame's middle within a few pixels of the card's middle, both ways (when it fits).
        const outer = (await card.boundingBox())!;
        const inner = (await card.locator(':scope > *').first().boundingBox())!; // reason: the frame is the card's only child
        expect(Math.abs(outer.x + outer.width / 2 - (inner.x + inner.width / 2))).toBeLessThanOrEqual(2);
        if (inner.height < outer.height) expect(Math.abs(outer.y + outer.height / 2 - (inner.y + inner.height / 2))).toBeLessThanOrEqual(2);
        if (kind === 'wait' || kind === 'slow') {
          await expect(card.getByRole('button', { name: strings['card.showScreen'] })).toBeVisible();
          // Past 15 s the download line shows (its absence before 15 s is a unit test: a slow host can pass 15 s here).
          if (kind === 'slow') await expect(card.getByText(strings['card.slow'])).toBeVisible();
        }
        const label = (await card.getAttribute('aria-label'))!;
        const axe = await new AxeBuilder({ page }).include(`[role="group"][aria-label="${label}"]`).withRules(['color-contrast']).analyze();
        expect(axe.violations.flatMap((v) => v.nodes.map((x) => `${v.id}: ${x.target.join(' ')} ${x.failureSummary ?? ''}`))).toEqual([]);
        await page.screenshot({ path: info.outputPath(`launchcard-${kind}-${theme}-${w}.png`) });
      });
    }
  }
}

// A tile shorter than the card's frame (a small Board tile on a phone): the card scrolls rather than cutting the top
// off (safe centring), and scrolling reaches Show. The tile body is held at 160 px, below the frame's own height.
for (const theme of ['light', 'dark'] as const) {
  test(`launch card in a tile shorter than its frame, ${theme} at 390: top in view, scroll reaches Show`, async ({ page }, info) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await boardWith(page, theme, 'slow');
    const card = group(page, 'slow');
    await expect(card).toBeVisible({ timeout: 30_000 });
    await card.evaluate((el) => {
      const p = el.parentElement!;
      p.style.flex = 'none';
      p.style.height = '160px';
    });
    const frame = card.locator(':scope > *').first(); // reason: the frame is the card's only child
    const sizes = await card.evaluate((el) => ({ scroll: el.scrollHeight, client: el.clientHeight }));
    expect(sizes.scroll).toBeGreaterThan(sizes.client);
    await expectCovers(card);
    // Safe centring: the frame starts at the card's top edge (less its padding), never above it.
    const top = await card.evaluate((el) => el.getBoundingClientRect().top + parseFloat(getComputedStyle(el).paddingTop));
    expect(Math.abs((await frame.boundingBox())!.y - top)).toBeLessThanOrEqual(1);
    await card.evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
    const show = card.getByRole('button', { name: strings['card.showScreen'] });
    await expect(show).toBeInViewport();
    const [c, b] = [(await card.boundingBox())!, (await show.boundingBox())!];
    expect(b.y + b.height).toBeLessThanOrEqual(c.y + c.height + 1);
    await page.screenshot({ path: info.outputPath(`launchcard-short-${theme}-390.png`) });
  });
}
