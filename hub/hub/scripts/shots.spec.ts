// The shots runner (driven by scripts/shots.ts): one test per shot × variant. HUB_SHOTS_PAGE names
// the page (its shots.ts); HUB_SHOTS_KIT=1 renders /_kit sections. After each PNG the rendered
// page is scanned (text-scan.ts): a raw string key or an unfilled {{placeholder}} fails that shot; more than one
// accent button per region and clipped table headers are report-only (`warn:` problems, shots-lib.ts) and fail
// nothing. Hits are listed in index.json / index.html (shots.ts writes the index once the run ends). Every PNG is also
// checked for a blank frame (nearly every pixel the same colour), which the DOM check misses.
import fs from 'node:fs';
import path from 'node:path';
import { type Locator, type Page, expect, test } from '@playwright/test';
import { type ActStep, PROBLEMS_DIR, WARN, allStringKeys, blocking, isLoadingState, loadShots, pngName, promisedOutcome, variantsOf } from './shots-lib';
import { nonBackgroundShare } from './png-share';
import { scanRenderedLayout, scanRenderedText } from './text-scan';

const BASE = process.env.HUB_BASE_URL ?? '';
const PAGE = process.env.HUB_SHOTS_PAGE ?? '';
const KIT = process.env.HUB_SHOTS_KIT === '1';
const OUT = process.env.HUB_SHOTS_OUT ?? '';

const { path: pagePath, shots } = loadShots(KIT ? null : PAGE);
const KEYS = allStringKeys();

const SELECTOR = /^[a-z]+=/;
const named = (page: Page, name: string): Locator =>
  SELECTOR.test(name)
    ? page.locator(name)
    : page
        .getByRole('button', { name })
        .or(page.getByRole('link', { name }))
        .or(page.getByRole('menuitem', { name }))
        .or(page.getByRole('tab', { name }))
        .or(page.getByRole('switch', { name }))
        .or(page.getByRole('checkbox', { name }))
        .or(page.getByRole('radio', { name }));

async function act(page: Page, step: ActStep): Promise<void> {
  if ('click' in step) await named(page, step.click).first().click();
  else if ('hover' in step) await named(page, step.hover).first().hover();
  else if ('fill' in step) await (SELECTOR.test(step.fill) ? page.locator(step.fill) : page.getByLabel(step.fill)).first().fill(step.text);
  else if ('press' in step) await page.keyboard.press(step.press);
  // A plain-text wait matches visible text only: getByText is a case-insensitive substring match, so hidden copy (a
  // collapsed FAQ answer, a closed panel, a tooltip) could otherwise be the first match and never show (keys
  // new-key-myip: "Added" matched "can't be added again" in a hidden FAQ answer).
  else await (SELECTOR.test(step.waitFor) ? page.locator(step.waitFor) : page.getByText(step.waitFor).filter({ visible: true })).first().waitFor({ timeout: 10_000 });
}

/** Skeletons and busy regions still on screen (an open overlay may be busy on purpose: it is a pending send). */
const LOADING = '[data-skeleton], [class*="skeleton" i], [aria-busy="true"]:not(button):not([role="button"]):not([role="dialog"]):not([role="alertdialog"])';
fs.mkdirSync(path.join(OUT, PROBLEMS_DIR), { recursive: true });

for (const shot of shots) {
  for (const v of variantsOf(shot)) {
    test(`${shot.name} ${v.id}`, async ({ page }) => {
      const file = pngName(shot, v);
      const problemsFile = path.join(OUT, PROBLEMS_DIR, `${file}.txt`);
      fs.rmSync(problemsFile, { force: true });
      await page.setViewportSize({ width: v.width, height: v.height });
      const dock = v.dock === true;
      await page.addInitScript((open) => {
        try {
          window.localStorage.setItem('hub.v3.ask', JSON.stringify({ open }));
        } catch {
          /* storage refused */
        }
      }, dock);
      // Freeze the page against edits made while the run goes: Vite's HMR socket is answered by a
      // silent stand-in, so a file saved during the run cannot reload the page mid-shot (blank frames).
      await page.routeWebSocket(/[?&]token=/, () => undefined);
      const q = new URLSearchParams({
        fxbar: '0',
        fxl: 'instant',
        theme: v.theme,
      });
      if (shot.state) q.set('fx', shot.state);
      if (shot.realm) q.set('fxrealm', shot.realm);
      if (shot.computer === false) q.set('fxcomputer', 'none');
      await page.goto(`${BASE}/?${q.toString()}#${pagePath}${shot.path ?? ''}`);
      await page.locator('#hub-main').waitFor();
      await page.waitForLoadState('networkidle');
      if (shot.waitForText) await expect(page.getByText(shot.waitForText).first()).toBeVisible();
      const problems: string[] = [];
      // A Playwright selector ('role=…', 'text=…', 'css=…'), or the name of a button, link, …
      if (shot.click) await named(page, shot.click).first().click();
      for (const k of shot.keys ?? []) await page.keyboard.press(k);
      for (const step of shot.act ?? []) await act(page, step);

      // Settle: every state but a *loading* one is shot after its skeletons are gone.
      if (!isLoadingState(shot)) {
        const still = page.locator(LOADING).filter({ visible: true });
        const deadline = Date.now() + 10_000;
        while ((await still.count()) > 0 && Date.now() < deadline) await page.waitForTimeout(200);
        if ((await still.count()) > 0)
          problems.push('still loading after 10 s (skeleton or aria-busy on screen): wait for the data, or name the state *loading*');
      }
      // The Outcome line a *pending*/*failed*/*unknown* state promises (kit Outcome, FormFooter, OutcomeSlot carry data-outcome).
      const promised = promisedOutcome(shot.name);
      if (promised && !shot.noOutcome) {
        const kinds = promised === 'pending' ? ['pending'] : ['failed', 'not_sent'];
        const line = page.locator(kinds.map((k) => `[data-outcome="${k}"]`).join(', ')).filter({ visible: true });
        await line
          .first()
          .waitFor({ timeout: 5_000 })
          .catch(() => undefined);
        if ((await line.count()) === 0) {
          problems.push(
            `named *${promised === 'pending' ? 'pending/unknown' : 'failed'}* but no ${kinds.join('/')} Outcome line is visible` +
              (shot.act?.length || shot.click || shot.keys?.length ? '' : ": add an `act` step that performs the action (e.g. act: [{ click: 'Save' }])"),
          );
        }
      }
      // The 250 ms settle stays: a fonts.ready + double-rAF wait shot earlier frames (a still-running progress bar, a key press not yet
      // applied: detail-hidden on page demo), which changed the PNGs.
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(250);
      const png = await page.screenshot({
        path: path.join(OUT, file),
        animations: 'disabled',
      });
      // Blank frame: the shell alone paints several percent of the pixels away from the background. Measured in Node from
      // the PNG; a PNG it cannot decode (null) is measured in the page, as before.
      const share =
        nonBackgroundShare(png) ??
        (await page
          .evaluate(async (b64) => {
            const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
            const img = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
            const canvas = new OffscreenCanvas(img.width, img.height);
            const ctx = canvas.getContext('2d');
            if (!ctx) return 1;
            ctx.drawImage(img, 0, 0);
            const d = ctx.getImageData(0, 0, img.width, img.height).data;
            const counts = new Map<number, number>();
            let n = 0;
            for (let i = 0; i < d.length; i += 16) {
              const k = ((d[i] ?? 0) << 16) | ((d[i + 1] ?? 0) << 8) | (d[i + 2] ?? 0);
              counts.set(k, (counts.get(k) ?? 0) + 1);
              n++;
            }
            let most = 0;
            for (const c of counts.values()) if (c > most) most = c;
            return n ? 1 - most / n : 0;
          }, png.toString('base64'))
          .catch(() => -1));
      if (share < 0) problems.push('the page navigated or reloaded while the shot was taken: retake it');
      else if (share < 0.005)
        problems.push(
          `blank frame: ${(share * 100).toFixed(2)}% of the pixels differ from the background (the page did not paint; check the state renders and the shot waits for it)`,
        );

      const blank = await page.evaluate(() => {
        const main = document.querySelector('#hub-main');
        if (!main) return true;
        return (main.textContent ?? '').trim().length < 3 && !main.querySelector('svg, img, canvas, input, textarea');
      });
      if (blank) problems.push('blank page: #hub-main shows nothing');
      problems.push(...(await page.evaluate(scanRenderedText, KEYS)), ...(await page.evaluate(scanRenderedLayout)).map((p) => `${WARN}${p}`));
      if (problems.length) fs.writeFileSync(problemsFile, `${problems.join('\n')}\n`);
      expect(blocking(problems), `${file}: see <shots dir>/<page>/index.html`).toEqual([]);
    });
  }
}
