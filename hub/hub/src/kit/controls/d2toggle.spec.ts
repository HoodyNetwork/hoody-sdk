// Playwright, measured as drawn in both themes on a real toggle group (AI >
// Spending period): a 40 px track (32 px options, 3 px padding, 1 px frame) in the field look (the input fill, the
// field line), square;
// options in mono 12 px uppercase with 0.06em tracking; the current option the thumb with an ink frame and a shadow; a
// hovered option's text turns ink; keyboard focus the kit ring (--focus-ring). Colours are the tokens' (a probe reads
// them in each theme); light also checks the spec's literal values. Medium and large controls are the same 40 px track.
import { expect, test, type Locator, type Page } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import aiStrings from '../../pages/ai/strings.en.json';
import kit2 from '../gallery/kit2.strings.en.json';

const LIGHT = { track: 'rgb(248, 248, 248)', line: 'rgb(122, 122, 122)' /* #7a7a7a, --hx-field-line: 3:1 on the field fill */, thumb: 'rgb(255, 255, 255)', ink: 'rgb(16, 16, 16)', text: 'rgb(92, 92, 92)' };

async function token(page: Page, name: string) {
  return page.evaluate((n) => {
    const d = document.createElement('div');
    d.style.color = `var(${n})`;
    document.body.append(d);
    const v = getComputedStyle(d).color;
    d.remove();
    return v;
  }, name);
}

async function drawn(l: Locator) {
  return l.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const c = getComputedStyle(el);
    return {
      h: Math.round(r.height * 10) / 10,
      bg: c.backgroundColor,
      line: c.borderTopColor,
      lineW: c.borderTopWidth,
      radius: c.borderTopLeftRadius,
      pad: c.paddingTop,
      gap: c.columnGap,
      color: c.color,
      shadow: c.boxShadow,
      font: c.fontFamily,
      size: c.fontSize,
      weight: c.fontWeight,
      tt: c.textTransform,
      ls: c.letterSpacing,
      padX: c.paddingLeft,
      outline: `${c.outlineStyle} ${c.outlineWidth} ${c.outlineColor}`,
      offset: c.outlineOffset,
    };
  });
}

for (const theme of ['light', 'dark'] as const) {
  test.describe(`toggle group at 1440 (${theme})`, () => {
    test.use({ viewport: { width: 1440, height: 900 } });

    test(`the track, the options and the thumb as the spec draws them (${theme})`, async ({ page }) => {
      await gotoHub(page, '/ai/models', { theme });
      await expect(page.locator('html')).toHaveAttribute('data-hx-theme', theme);
      const group = page.getByRole('radiogroup', { name: aiStrings['spend.period'] });
      await group.waitFor({ timeout: 15_000 });
      const t = await drawn(group);
      expect([t.h, t.pad, t.gap, t.lineW, t.radius]).toEqual([40, '3px', '2px', '1px', '0px']);
      expect(t.bg).toBe(await token(page, '--hx-tog-track'));
      expect(t.line).toBe(await token(page, '--hx-tog-line'));
      const cur = group.getByRole('radio', { checked: true });
      const other = group.getByRole('radio', { checked: false }).first(); // any unchosen period; all share one rule
      const c = await drawn(cur);
      const o = await drawn(other);
      expect([c.h, o.h]).toEqual([32, 32]);
      expect([o.padX, o.size, o.weight, o.tt, o.ls]).toEqual(['12px', '12px', '500', 'uppercase', '0.72px']);
      expect(o.font).toMatch(/Geist Mono/);
      expect(o.bg).toBe('rgba(0, 0, 0, 0)');
      expect(o.color).toBe(await token(page, '--hx-tog-text'));
      expect(c.bg).toBe(await token(page, '--hx-tog-thumb'));
      expect(c.line).toBe(await token(page, '--hx-tog-ink'));
      expect(c.color).toBe(await token(page, '--hx-tog-ink'));
      expect(c.shadow).toContain('0px 2px 2px');
      if (theme === 'light') {
        expect([t.bg, t.line, c.bg, c.line, c.color, o.color]).toEqual([LIGHT.track, LIGHT.line, LIGHT.thumb, LIGHT.ink, LIGHT.ink, LIGHT.text]);
      }
      // Hover: the unchosen option's text turns ink, it gets no thumb.
      await other.hover();
      await expect(other).toHaveAttribute('data-hovered', 'true');
      // The colour eases over --dur-press: wait for it to settle.
      await expect(other).toHaveCSS('color', await token(page, '--hx-tog-ink'));
      expect((await drawn(other)).bg).toBe('rgba(0, 0, 0, 0)');
      // Keyboard focus: the kit ring, no outline; an arrow still moves focus to the next option (behaviour unchanged).
      await page.mouse.move(0, 0);
      await cur.focus();
      await page.keyboard.press('Shift+Tab');
      await page.keyboard.press('Tab');
      await expect(cur).toBeFocused();
      const f = await cur.evaluate((el) => {
        const c = getComputedStyle(el);
        const probe = document.createElement('span');
        probe.style.boxShadow = 'var(--focus-ring)';
        el.appendChild(probe);
        const want = getComputedStyle(probe).boxShadow;
        probe.remove();
        return { shadow: c.boxShadow, want, outline: c.outlineStyle };
      });
      expect(f.shadow).toBe(f.want);
      expect(f.outline).toBe('none');
      await page.keyboard.press('ArrowRight');
      await expect(cur).not.toBeFocused();
      expect(await group.getByRole('radio').evaluateAll((rs) => rs.some((r) => r === document.activeElement))).toBe(true);
    });
  });
}

test('a medium (md) and a large (lg) toggle group are the same 40 px track with 32 px options', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoHub(page, '/_kit?tab=nav');
  for (const name of [kit2['seg.pay'], kit2['seg.start']]) {
    const g = page.getByRole('radiogroup', { name, exact: true });
    await g.waitFor({ timeout: 15_000 });
    expect((await drawn(g)).h, name).toBe(40);
    for (const o of await g.getByRole('radio').all()) expect((await drawn(o)).h, name).toBe(32);
  }
});
