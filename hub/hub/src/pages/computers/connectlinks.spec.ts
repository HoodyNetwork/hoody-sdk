// Playwright: Computer › Connect with every program link (two lists, fourteen rows: Workspaces is reached from its own
// page, never offered as a link of one computer) and the SSH section at
// 1440, 1024 and a 390 px phone: no sideways scroll, and in every link row the name, the address and the actions never
// overlap. Layout needs a real browser.
import { expect, test } from '@playwright/test';
import { gotoHub, noSideScroll } from '@app/e2e';
import strings from './strings.en.json';

for (const [width, touch] of [[1440, false], [1024, false], [390, true]] as const)
  test.describe(`${width} px${touch ? ' touch' : ''}`, () => {
    test.use({ viewport: { width, height: 900 }, hasTouch: touch, isMobile: touch });
    test('every program row fits: no overlap, no sideways scroll', async ({ page }) => {
      await gotoHub(page, '/computers?sel=atlas.00a1&tab=connect');
      const ssh = page.getByRole('region', { name: strings['ssh.title'] });
      await ssh.getByRole('button', { name: new RegExp(`^${strings['ssh.gateway.title']}`) }).waitFor({ timeout: 20_000 });
      const lists = page.locator('section#connect-links ul, section#connect-api ul');
      await expect(lists).toHaveCount(2);
      await expect(lists.nth(0).locator(':scope > li')).toHaveCount(11);
      await expect(lists.nth(1).locator(':scope > li')).toHaveCount(3);
      await noSideScroll(page);
      const bad = await lists.evaluateAll((uls) => {
        const out: string[] = [];
        for (const ul of uls)
          for (const li of ul.querySelectorAll(':scope > li')) {
            const parts = [...li.querySelectorAll('strong, bdi, button')].map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0 && r.height > 0);
            for (let i = 0; i < parts.length; i++)
              for (let j = i + 1; j < parts.length; j++) {
                const a = parts[i]!, b = parts[j]!;
                const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
                const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
                if (w > 1 && h > 1 && !(a.left <= b.left && a.right >= b.right && a.top <= b.top && a.bottom >= b.bottom) && !(b.left <= a.left && b.right >= a.right && b.top <= a.top && b.bottom >= a.bottom))
                  out.push(`${li.textContent?.slice(0, 20)}: ${i}/${j}`);
              }
            const lr = li.getBoundingClientRect();
            for (const r of parts) if (r.right > lr.right + 1 || r.left < lr.left - 1) out.push(`${li.textContent?.slice(0, 20)}: out of its row`);
          }
        return out;
      });
      expect(bad).toEqual([]);
    });
  });
