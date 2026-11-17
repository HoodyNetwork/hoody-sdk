// Tile through Home's Shortcuts card, the one page that uses it: five keycap tiles with a faint solid
// edge (the tile's own text colour at 14%) on all four sides, the --hx-tile-fill fill, the tile padding and the stacked layout, and All
// shortcuts with no line, centred. Every tile is the kit's own part (its module class), not a page look-alike.
// Both themes, fine and coarse; and a narrow card, where the grid tightens --tile-pad-y and the odd fifth key and All
// shortcuts each take a whole row.
import { expect, type Page } from '@playwright/test';
import { gotoHub, test } from '@app/e2e';
import strings from '../../pages/home/strings.en.json';

const look = (page: Page) =>
  page.locator('#hub-main section').filter({ has: page.getByRole('button', { name: strings['keys.all'] }) }).evaluate((card) => {
    const probe = document.createElement('i');
    probe.style.display = 'block';
    card.appendChild(probe);
    const token = (name: string, prop: 'color' | 'backgroundColor' | 'paddingTop') => {
      probe.style[prop] = name.startsWith('--') ? `var(${name})` : name;
      return getComputedStyle(probe)[prop];
    };
    const t = {
      line: token('color-mix(in srgb, currentcolor 14%, transparent)', 'color'),
      fill: token('--hx-tile-fill', 'backgroundColor'),
      sp1: token('--sp-1', 'paddingTop'),
      sp3: token('--sp-3', 'paddingTop'),
      inline: token('calc(var(--sp-3) + var(--sp-half))', 'paddingTop'),
      gap: token('calc(var(--sp-2) + var(--sp-half))', 'paddingTop'),
    };
    probe.remove();
    const grid = card.querySelector('dl')!.parentElement!;
    const button = [...card.querySelectorAll('button')].find((b) => b.closest('dl') === null)!;
    const tiles = [...card.querySelectorAll('dl > div'), button.parentElement!];
    return {
      ...t,
      gridW: Math.round(grid.getBoundingClientRect().width),
      tiles: tiles.map((el) => {
        const c = getComputedStyle(el);
        return {
          kit: [...el.classList].some((k) => /^Layouts[-_.]module__tile_/.test(k)),
          edges: [...new Set(['Top', 'Right', 'Bottom', 'Left'].map((s) => `${c[`border${s}Width` as 'borderTopWidth']} ${c[`border${s}Style` as 'borderTopStyle']} ${c[`border${s}Color` as 'borderTopColor']}`))],
          bg: c.backgroundColor,
          flow: `${c.display} ${c.flexDirection} ${c.alignItems} ${c.justifyContent}`,
          pad: [c.paddingTop, c.paddingRight, c.paddingBottom, c.paddingLeft],
          gap: c.rowGap,
          w: Math.round(el.getBoundingClientRect().width),
          top: Math.round(el.getBoundingClientRect().top),
          bottom: Math.round(el.getBoundingClientRect().bottom),
        };
      }),
    };
  });

type Look = Awaited<ReturnType<typeof look>>;
const checkTiles = (l: Look, padY: string) => {
  expect(l.tiles).toHaveLength(6);
  expect(l.fill).not.toBe('rgba(0, 0, 0, 0)');
  for (const [i, t] of l.tiles.entries()) {
    const stack = i < 5;
    expect(t.kit, `tile ${i} is the kit Tile`).toBe(true);
    expect(t.edges).toEqual([`1px solid ${stack ? l.line : 'rgba(0, 0, 0, 0)'}`]);
    expect(t.bg).toBe(stack ? l.fill : 'rgba(0, 0, 0, 0)');
    expect(t.flow).toBe(stack ? 'flex column flex-start center' : 'flex row center normal');
    expect(t.pad).toEqual([padY, l.inline, padY, l.inline]);
    if (stack) expect(t.gap).toBe(l.gap);
  }
};

const open = async (page: Page, theme: 'light' | 'dark') => {
  await gotoHub(page, '/home', { theme });
  await expect(page.getByRole('button', { name: strings['keys.all'] })).toBeVisible();
};

const narrow = async (page: Page, theme: 'light' | 'dark') => {
  await open(page, theme);
  const l = await look(page);
  checkTiles(l, l.sp1);
  expect(l.tiles.slice(4).map((t) => t.w)).toEqual([l.gridW, l.gridW]);
  for (const t of l.tiles.slice(0, 4)) expect(t.w).toBeLessThan(l.gridW / 2);
  // Each takes a row of its own: the fifth key below the four, All shortcuts below the fifth, no overlap.
  const [fifth, all] = [l.tiles[4]!, l.tiles[5]!];
  expect(fifth.top).toBeGreaterThanOrEqual(Math.max(...l.tiles.slice(0, 4).map((t) => t.bottom)));
  expect(all.top).toBeGreaterThanOrEqual(fifth.bottom);
};

for (const theme of ['light', 'dark'] as const) {
  test(`fine ${theme} 1350: five keycap tiles edged and filled in two columns, All shortcuts with no line`, async ({ hubPage: page }) => {
    await page.setViewportSize({ width: 1350, height: 1000 });
    await open(page, theme);
    const l = await look(page);
    checkTiles(l, l.sp3);
    for (const t of l.tiles) expect(t.w).toBeLessThan(l.gridW / 2);
    // The third row: the fifth key below the four, All shortcuts beside it.
    const [fifth, all] = [l.tiles[4]!, l.tiles[5]!];
    expect(fifth.top).toBeGreaterThanOrEqual(Math.max(...l.tiles.slice(0, 4).map((t) => t.bottom)));
    expect(all.top).toBe(fifth.top);
  });
  test(`coarse ${theme} (390): a narrow card tightens the tiles, the fifth key and All shortcuts take whole rows`, async ({ hubPageCoarse: page }) => {
    await narrow(page, theme);
  });
}

test('fine light 390: a narrow card tightens the tiles, the fifth key and All shortcuts take whole rows', async ({ hubPage: page }) => {
  await page.setViewportSize({ width: 390, height: 1000 });
  await narrow(page, 'light');
});
