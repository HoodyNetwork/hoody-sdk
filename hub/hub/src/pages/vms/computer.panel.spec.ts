// Playwright: the "This computer" panel at 1440 px. No fact label wraps (each is one line of text), every fact value
// starts on one of three edges (one grid, three cells to a row), and the KVM switch ends a form-width row instead of sitting at the
// far edge of the card. At 390 px the facts are one column.
import { expect, test } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import strings from './strings.en.json';

for (const state of [undefined, 'no-memory-limit'] as const) {
  test(`This computer at 1440 px (${state ?? 'usual answer'}): labels on one line, one grid of three, switch on the form measure`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await gotoHub(page, '/vms', state ? { state } : {});
    const panel = page.locator('#vms-computer');
    await expect(panel.getByText(strings['host.disk'])).toBeVisible({ timeout: 30_000 });
    const m = await panel.evaluate((el) => {
      const r = (n: number) => Math.round(n);
      const labels = [...el.querySelectorAll('dt')].map((dt) => {
        const lh = parseFloat(getComputedStyle(dt).lineHeight);
        return { text: dt.textContent, lines: Math.round(dt.getBoundingClientRect().height / lh) };
      });
      const valueEdges = [...new Set([...el.querySelectorAll('dd')].map((dd) => r(dd.getBoundingClientRect().left)))];
      const sw = el.querySelector('[role="switch"]')!.closest('label') ?? el.querySelector('[role="switch"]')!;
      const body = el.querySelector('dl')!.getBoundingClientRect();
      return { labels, valueEdges, switchEnd: r(sw.getBoundingClientRect().right - body.left), lists: el.querySelectorAll('dl').length };
    });
    expect(m.lists).toBe(1);
    expect(m.labels.filter((l) => l.lines !== 1), 'no label wraps').toEqual([]);
    expect(m.valueEdges, 'three cells to a row').toHaveLength(3);
    // --form-max is 720 px: the switch ends within it, measured from the body's start edge.
    expect(m.switchEnd).toBeLessThanOrEqual(720);
    expect(m.switchEnd).toBeGreaterThan(400);
  });
}

test('This computer at 390 px: one column of facts', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoHub(page, '/vms');
  const panel = page.locator('#vms-computer');
  await expect(panel.getByText(strings['host.disk'])).toBeVisible({ timeout: 30_000 });
  const edges = await panel.evaluate((el) => [...new Set([...el.querySelectorAll('dd')].map((dd) => Math.round(dd.getBoundingClientRect().left)))]);
  expect(edges).toHaveLength(1);
});
