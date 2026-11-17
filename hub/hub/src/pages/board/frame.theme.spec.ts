// Playwright: a script tile whose answer is raw JSON or text (a document that sets no colours)
// stays readable in every Hub theme, OS colour preference and engine. The tile's frame shows the browser tab ground
// (Frame `page`): black on white, or the engine's own opaque dark canvas with white text, never dark text on the dark
// program ground. Contrast is measured on the drawn text line: the ground is the commonest colour, the text the colour
// farthest from it.
import { expect, test, type Page } from '@playwright/test';
import { gotoHub } from '@app/e2e';

const SHOTS = process.env.HUB_THEME_SHOTS;

async function contrastOf(page: Page, png: Buffer): Promise<number> {
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const g = c.getContext('2d')!;
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    const lum = (r: number, gg: number, b: number) => {
      const f = (v: number) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
      return 0.2126 * f(r) + 0.7152 * f(gg) + 0.0722 * f(b);
    };
    const counts = new Map<number, number>();
    const ls: number[] = [];
    for (let i = 0; i < d.length; i += 4) {
      const l = lum(d[i]!, d[i + 1]!, d[i + 2]!);
      ls.push(l);
      const k = Math.round(l * 1000);
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    const ground = [...counts].sort((a, b) => b[1] - a[1])[0]![0] / 1000;
    const text = ls.reduce((far, l) => (Math.abs(l - ground) > Math.abs(far - ground) ? l : far), ground);
    const [hi, lo] = ground > text ? [ground, text] : [text, ground];
    return (hi + 0.05) / (lo + 0.05);
  }, png.toString('base64'));
}

// Both engines in one file: the config's project is Chromium, and use({ browserName }) needs a worker per engine, so
// each test launches its engine itself (the playwright fixture) with the OS colour preference under test.
for (const engine of ['chromium', 'firefox'] as const) {
  for (const os of ['light', 'dark'] as const) {
    for (const theme of ['light', 'dark'] as const) {
      for (const [kind, type, body] of [['JSON', 'application/json', '{"status": "disabled"}'], ['text', 'text/plain', 'status: disabled']] as const) {
        test(`${engine}, OS ${os}: a script tile answering ${kind} is readable (Hub ${theme})`, async ({ playwright }) => {
          test.setTimeout(300_000); // two engines launched per test, on a busy machine
          const browser = await playwright[engine].launch();
          try {
            const page = await (await browser.newContext({ colorScheme: os, viewport: { width: 1440, height: 900 } })).newPage();
            await page.route(/fixture\.invalid/, (r) => r.fulfill({ status: 200, contentType: type, body }));
            await gotoHub(page, '/board/open/atlas.00a1/script/sys/btrfsreport', { theme });
            const frame = page.locator('iframe[title]').first();
            await expect(frame).toBeVisible({ timeout: 60_000 });
            // The frame is another origin (the computer's address): read it through Playwright's frame, not the DOM.
            await expect(page.frameLocator('iframe[title]').first().locator('body')).toContainText('disabled', { timeout: 20_000 });
            await page.waitForTimeout(300);
            if (SHOTS) await frame.screenshot({ path: `${SHOTS}/${engine}-os${os}-hub${theme}-${kind}.png` });
            // Measured on the text's own line box as drawn (the frame ground behind it shows through), so an engine's own
            // chrome in the frame cannot pass for the text: Chromium's Pretty-print bar overlaps the <pre> box.
            const inner = page.frames().find((f) => f.url().includes('fixture.invalid'));
            if (!inner) throw new Error('no script frame');
            const line = await inner.evaluate(() => {
              const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
              for (let n = w.nextNode(); n; n = w.nextNode()) {
                if (!n.textContent?.includes('disabled')) continue;
                const r = document.createRange();
                r.selectNodeContents(n);
                const b = r.getClientRects()[0]!;
                return { x: b.left, y: b.top, width: b.width, height: b.height };
              }
              return null;
            });
            const box = await frame.boundingBox();
            if (!line || !box) throw new Error('no text line');
            const png = await page.screenshot({ clip: { x: box.x + line.x, y: box.y + line.y, width: line.width, height: line.height } });
            expect(await contrastOf(page, png)).toBeGreaterThanOrEqual(4.5);
          } finally {
            await browser.close();
          }
        });
      }
    }
  }
}
