// Playwright: the gallery's upkeep block (/_kit?tab=groups,
// data-sg-demo="upkeep"). A reveal row's Replace… opens its editor under the row, as wide as the row, with Cancel and
// Save at its foot's end; Escape closes it and focus goes back to Replace…. A warn Band attached to a field sits right
// under it and the field's border takes the warning colour. The danger group comes last, set apart, its title in the
// danger colour. At 1440 and 390, light and dark; nothing wider than the page.
import { expect, test } from '@playwright/test';
import { gotoHub } from '@app/e2e';

for (const theme of ['light', 'dark'] as const)
  for (const width of [1440, 390] as const)
    test.describe(`upkeep groups at ${width}, ${theme}`, () => {
      test.use({ viewport: { width, height: 900 } });

      test('the reveal row opens its editor in place, the attached band and the danger group keep their places', async ({ page }) => {
        await gotoHub(page, '/_kit?tab=groups', { theme });
        const demo = page.locator('[data-sg-demo="upkeep"]');
        await demo.scrollIntoViewIfNeeded();
        const row = demo.locator('[data-sg-row]').filter({ hasText: 'Webhook address' });
        const open = row.getByRole('button', { name: 'Replace…' });
        await open.click();
        const editor = row.getByRole('group', { name: 'Webhook address' });
        await expect(editor).toBeVisible();
        await expect(editor.getByRole('textbox', { name: 'New webhook address' })).toBeFocused();
        const m = await row.evaluate((r) => {
          const ed = r.querySelector<HTMLElement>('[data-sg-reveal]')!;
          const rb = r.getBoundingClientRect();
          const eb = ed.getBoundingClientRect();
          const label = r.querySelector<HTMLElement>(':scope > div')!.getBoundingClientRect();
          const rs = getComputedStyle(r);
          const inner = rb.width - Number.parseFloat(rs.paddingInlineStart) - Number.parseFloat(rs.paddingInlineEnd);
          const buttons = [...ed.querySelectorAll('button')].map((b) => b.getBoundingClientRect());
          return { below: eb.top >= label.bottom - 0.5, wide: Math.abs(eb.width - inner) <= 1, footEnd: Math.abs(Math.max(...buttons.map((b) => b.right)) - (eb.right - Number.parseFloat(getComputedStyle(ed).paddingInlineEnd))) <= 1 };
        });
        expect(m.below, 'the editor is under the row\'s name').toBe(true);
        expect(m.wide, 'the editor spans the row').toBe(true);
        expect(m.footEnd, 'Save ends the editor\'s foot').toBe(true);
        await page.keyboard.press('Escape');
        await expect(editor).toHaveCount(0);
        await expect(open).toBeFocused();

        // The attached band: under its field, the field's border in the warning colour.
        const attach = await demo.locator('[data-band-attach]').evaluate((w) => {
          const field = w.querySelector<HTMLElement>('input')!;
          // The drawn box: the input itself or the field group around it (a NumberField draws its border on the group).
          let box: HTMLElement | null = field;
          while (box && box !== w && Number.parseFloat(getComputedStyle(box).borderTopWidth) === 0) box = box.parentElement;
          const band = w.querySelector<HTMLElement>('[role="status"]')!;
          const probe = document.createElement('span');
          probe.style.color = 'var(--hx-warn-fill)';
          w.append(probe);
          const warn = getComputedStyle(probe).color;
          probe.remove();
          const fb = (box && box !== w ? box : field).getBoundingClientRect();
          const bb = band.getBoundingClientRect();
          return { tone: w.getAttribute('data-band-attach'), under: bb.top >= fb.bottom - 0.5 && bb.top - fb.bottom <= 24, border: box && box !== w ? getComputedStyle(box).borderTopColor : 'none', warn, desc: field.getAttribute('aria-describedby')?.split(' ').includes(band.id) ?? false };
        });
        expect(attach.tone).toBe('warn');
        expect(attach.under, 'the band sits right under its field').toBe(true);
        expect(attach.border, 'the field takes the warning border').toBe(attach.warn);
        expect(attach.desc, 'the field is described by the band').toBe(true);

        // The danger group: last, set apart from the group before it, its title in the danger colour.
        const danger = await demo.evaluate((d) => {
          const groups = [...d.querySelectorAll<HTMLElement>('[data-setting-group]')];
          const last = groups.at(-1)!;
          const prev = groups.at(-2)!;
          const h = last.querySelector<HTMLElement>('[data-hub-heading]')!;
          const probe = document.createElement('span');
          probe.style.color = 'var(--hx-danger)';
          d.append(probe);
          const col = getComputedStyle(probe).color;
          probe.remove();
          const plainGap = groups[1]!.getBoundingClientRect().top - groups[0]!.getBoundingClientRect().bottom;
          return { last: last.getAttribute('data-sg-tone'), title: getComputedStyle(h).color === col, apart: last.getBoundingClientRect().top - prev.getBoundingClientRect().bottom > plainGap + 8 };
        });
        expect(danger.last).toBe('danger');
        expect(danger.title, 'the danger title is in the danger colour').toBe(true);
        expect(danger.apart, 'the danger group is set apart').toBe(true);
        const over = await page.locator('#hub-main').evaluate((x) => x.scrollWidth - x.clientWidth);
        expect(over).toBeLessThanOrEqual(0);
      });
    });
