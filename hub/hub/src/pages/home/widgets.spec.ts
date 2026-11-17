// Playwright: Home web widgets on fixtures (run by hub:check --page home): add, frame or new-tab note, drag order,
// kept after a reload, removed; on a phone and a desktop width.
import { expect, test, type Page } from '@playwright/test';
import { gotoHub, noSideScroll } from '@app/e2e';
import strings from './strings.en.json';
import web from './widgets/strings.en.json';

// The fixture world's proxy domain (core transport.ts): an address under it is one of the person's own Kit pages.
const KIT = 'https://p-0123456789abcdef01234567-agent-1.srv.fixture.invalid/app';

async function addWidget(page: Page, url: string, name: string) {
  const form = page.getByRole('region', { name: web['add.title'] });
  await form.getByLabel(web['add.url']).fill(url);
  await form.getByLabel(web['add.name']).fill(name);
  await form.getByRole('button', { name: web['add.submit'] }).click();
}

// The phone height puts the Example row low on the screen, where a toast would sit over its grip (when
// adding a widget still raised one; today only a failed add does, widgets/store.ts). The drag below checks its planned
// coordinates before it presses.
for (const [width, height] of [[390, 845], [1440, 900]] as const) {
  test.describe(`at ${width} px`, () => {
    test.use({ viewport: { width, height } });

    test('add, drag to the top, keep after a reload, remove', async ({ page }) => {
      // Add, drag, two page loads and a remove: about 30 s on a whole-Hub dev server.
      test.slow();
      await page.route('https://*.fixture.invalid/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>kit</title><p>kit page</p>' }));
      await gotoHub(page, '/home?customize=1');
      await expect(page.getByText(web['add.title'])).toBeVisible();
      await addWidget(page, KIT, 'Docs');
      await addWidget(page, 'https://example.org/', 'Example');

      // Drag the Example row by its grip above the first row.
      const rows = page.locator('li[data-key]');
      const last = rows.filter({ hasText: 'Example' });
      const grip = last.locator('[data-grip]');
      const first = rows.first();
      // After hover (the grip scrolled into view and taking the pointer) and the box reads, check the planned drag
      // coordinates before the mouse sequence; fail explicitly if the grip is covered or the drop point is outside the
      // viewport.
      await grip.hover();
      const g = await grip.boundingBox();
      const f = await first.boundingBox();
      if (!g || !f) throw new Error('no boxes');
      const ready = await grip.evaluate(
        (el, { gx, gy, fy }) => ({
          grip: el.contains(document.elementFromPoint(gx, gy)),
          drop: fy >= 0 && fy < window.innerHeight,
        }),
        { gx: g.x + g.width / 2, gy: g.y + g.height / 2, fy: f.y + 2 },
      );
      expect(ready, 'the grip owns its centre and the first row is on screen when the drag starts').toEqual({ grip: true, drop: true });
      await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
      await page.mouse.down();
      await page.mouse.move(g.x + g.width / 2, f.y + 2, { steps: 8 });
      await page.mouse.up();
      await expect(rows.first()).toContainText('Example');

      await page.getByRole('button', { name: strings['customize.done'] }).click();
      const docs = page.locator('section', { has: page.getByRole('heading', { level: 2, name: 'Docs' }) });
      await expect(docs.locator('iframe')).toHaveAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox');
      // loading=lazy: on a phone the card starts below the fold, and its page loads once it is scrolled to.
      await docs.scrollIntoViewIfNeeded();
      await expect(docs.frameLocator('iframe').getByText('kit page')).toBeVisible();
      const example = page.locator('section', { has: page.getByRole('heading', { level: 2, name: 'Example' }) });
      await expect(example.getByText(web['card.blocked'])).toBeVisible();
      await expect(example.locator('iframe')).toHaveCount(0);
      // The dragged widget is now the first card on Home.
      await expect(page.locator('main section h2').first()).toHaveText('Example');
      await page.screenshot({ path: test.info().outputPath(`home-widgets-${width}.png`), fullPage: true });

      await page.reload();
      await page.locator('#hub-main').waitFor();
      await expect(page.locator('main section h2').first()).toHaveText('Example');

      await example.getByRole('button', { name: 'More actions' }).click();
      await page.getByRole('menuitem', { name: web['menu.remove'].replace('{{name}}', 'Example') }).click();
      await page.getByRole('alertdialog').getByRole('button', { name: web['remove.confirm'] }).click();
      await expect(page.getByRole('heading', { level: 2, name: 'Example' })).toHaveCount(0);
      await expect(page.locator('body')).not.toHaveCSS('overflow-x', 'scroll');
      await noSideScroll(page);
    });
  });
}
