// Playwright: the control role tokens move no pixel. In the gallery's controls tab, inside its default and its compact
// specimen area, each role token and the token it aliases resolve to the same length or colour, in each theme with each
// pointer, and a retired role name resolves to nothing there. The node test (kit/controlRoles.test.ts) reads the
// declarations; this reads what the browser computes where the specimens are drawn, the compact area's own
// redeclaration included.
import { expect, test } from '@playwright/test';
import { gotoHub } from '@app/e2e';

/** Role token -> the token it aliases, read as a length (width) or a colour. */
const LENGTHS: [string, string][] = [
  ['--ctl-h-md', '--ctl-h'],
  ['--field-pad-x', '--sp-3'],
];
const COLOURS: [string, string][] = [
  ['--ctl-line-field', '--hx-field-line'],
  ['--ctl-line-toggle', '--hx-switch-line'],
  ['--field-bg', '--hx-field-bg'],
  ['--field-line-hover', '--hx-ink'],
  ['--field-off-bg', '--hx-fill'],
  ['--field-off-ink', '--hx-muted'],
];
/** Role names the kit no longer declares: a reader left behind would draw with whatever it inherits. */
const RETIRED = ['--ctl-pad-x-md', '--ctl-pad-x-sm', '--ctl-gap', '--ctl-gap-sm', '--ctl-line-button', '--ctl-line-quiet', '--ctl-line-frame', '--ctl-ink-on', '--ctl-hover', '--ctl-press', '--hx-grey-1', '--hx-grey-2', '--hx-grey-3', '--hx-grey-4', '--hx-grey-hover', '--hx-sec-line'];
/** What a token that did not resolve shows: a probe's width falls back to 0, its colour to the sentinel it inherits. */
const SENTINEL = 'rgb(1, 2, 3)';

interface Reading {
  area: string;
  name: string;
  got: string;
  want: string;
}

for (const theme of ['light', 'dark'] as const)
  for (const pointer of ['fine', 'coarse'] as const)
    test.describe(`control role tokens: ${theme}, ${pointer} pointer`, () => {
      if (pointer === 'coarse') test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

      test('each role resolves as the token it aliases, in the default and the compact area', async ({ page }) => {
        await gotoHub(page, '/_kit?tab=controls', { theme });
        await page.locator('[data-spec-density="compact"] [data-cell]').first().waitFor();
        expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(pointer === 'coarse');
        const { readings, ctlH, literals, declared } = await page.evaluate(
          ({ lengths, colours, retired, sentinel }) => {
            const out: Reading[] = [];
            const ctlH: Record<string, string> = {};
            const literals: Record<string, string> = {};
            const declared: string[] = [];
            for (const area of ['default', 'compact']) {
              const host = document.querySelector<HTMLElement>(`[data-spec-density="${area}"]`)!;
              const box = document.createElement('div');
              box.style.cssText = `position: absolute; color: ${sentinel}`;
              host.appendChild(box);
              const read = (prop: 'width' | 'color', token: string) => {
                const probe = document.createElement('div');
                probe.style.position = 'absolute';
                probe.style.setProperty(prop, `var(${token})`);
                box.appendChild(probe);
                const v = getComputedStyle(probe)[prop];
                probe.remove();
                return v;
              };
              for (const [name, old] of lengths) out.push({ area, name, got: read('width', name), want: read('width', old) });
              for (const [name, old] of colours) out.push({ area, name, got: read('color', name), want: read('color', old) });
              ctlH[area] = read('width', '--ctl-h');
              const cs = getComputedStyle(box);
              literals[area] = `${cs.getPropertyValue('--ctl-h-xs').trim()} ${cs.getPropertyValue('--ctl-off-opacity').trim()}`;
              for (const name of retired) if (cs.getPropertyValue(name).trim() !== '') declared.push(`${area} ${name}`);
              box.remove();
            }
            return { readings: out, ctlH, literals, declared };
          },
          { lengths: LENGTHS, colours: COLOURS, retired: RETIRED, sentinel: SENTINEL },
        );
        expect(readings).toHaveLength(2 * (LENGTHS.length + COLOURS.length));
        const unresolved = readings.filter((r) => r.want === '0px' || r.want === SENTINEL || r.got === '0px' || r.got === SENTINEL);
        expect(unresolved, 'a token that resolves to nothing').toEqual([]);
        const differ = readings.filter((r) => r.got !== r.want).map((r) => `${r.area} ${r.name}: ${r.got}, its alias ${r.want}`);
        expect(differ, `${theme} ${pointer}: a role that moved a pixel`).toEqual([]);
        // Density never changes a control height: the compact area reads the same --ctl-h.
        const ctl = pointer === 'coarse' ? '44px' : '40px';
        expect(ctlH).toEqual({ default: ctl, compact: ctl });
        expect(literals).toEqual({ default: '24px 0.5', compact: '24px 0.5' });
        expect(declared, 'a retired role name still resolves').toEqual([]);
      });

      test('the top bar redeclares --ctl-h, and --ctl-h-md follows it there', async ({ page }) => {
        await gotoHub(page, '/', { theme });
        const bar = page.locator('header').first();
        await bar.waitFor();
        const read = await bar.evaluate((host) => {
          const width = (token: string) => {
            const probe = document.createElement('div');
            probe.style.position = 'absolute';
            probe.style.width = `var(${token})`;
            host.appendChild(probe);
            const v = getComputedStyle(probe).width;
            probe.remove();
            return v;
          };
          return { role: width('--ctl-h-md'), token: width('--ctl-h') };
        });
        expect(read).toEqual({ role: pointer === 'coarse' ? '44px' : '32px', token: pointer === 'coarse' ? '44px' : '32px' });
      });
    });
