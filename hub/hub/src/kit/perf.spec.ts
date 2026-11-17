// Playwright: Performance mode as drawn. fouc.js runs before the page's own scripts (an init script:
// fixtures mode serves no live boot scripts), so ?perf=1 is taken and stripped before the first paint, and
// the switch then holds across a reload from storage alone. Under it a button, an open menu and an open drawer draw
// no shadow and run no animation or transition; a focused control keeps its focus ring. Needs a real browser.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { hubUrl } from '@app/e2e';
import keys from '../pages/keys/strings.en.json';
import perf from './perf.strings.en.json';

const FOUC = path.join(__dirname, '..', '..', '..', 'public', 'auth', 'fouc.js');

test.skip(process.env.HUB_PAGE !== 'keys' && process.env.HUB_PAGE !== '*', 'runs on the keys page (HUB_PAGE=keys)');

/** The Hub at `hash` with ?perf=<value> in the address, as a link from a terminal would open it. */
const withPerf = (hash: string, value: string) => hubUrl(hash).replace('#', `&perf=${value}#`);

/** No visible shadow (each layer none or fully transparent), every animation over at once, no transition. */
const still = (l: Locator) =>
  l.evaluate((el) => {
    const c = getComputedStyle(el);
    const layers = c.boxShadow === 'none' ? [] : c.boxShadow.split(/,(?![^(]*\))/).map((x) => x.trim());
    return {
      shadow: layers.every((x) => x.startsWith('rgba(0, 0, 0, 0)')) ? 'none' : c.boxShadow,
      animation: c.animationDuration.split(',').every((d) => parseFloat(d) < 0.001) ? 'none' : c.animationDuration,
      transition: c.transitionDuration.split(',').every((d) => parseFloat(d) === 0),
    };
  });

async function open(page: Page, url: string) {
  await page.goto(url);
  await page.locator('#hub-main').waitFor();
}

// An init script runs before <html> exists; fouc.js needs it, so it runs as soon as the parser adds it (before the
// head's scripts, as in the real page where fouc.js is a head script).
const foucInit = `(() => { const run = () => { ${readFileSync(FOUC, 'utf8')} };
  if (document.documentElement) run();
  else new MutationObserver((_, o) => { if (document.documentElement) { o.disconnect(); run(); } }).observe(document, { childList: true });
})();`;

test.beforeEach(async ({ page }) => {
  await page.addInitScript({ content: foucInit });
});

test('@perf ?perf=1 turns it on before paint, leaves the address, and holds across a reload', async ({ page }) => {
  await open(page, withPerf('/keys', '1'));
  expect(await page.evaluate(() => document.documentElement.getAttribute('data-hx-perf'))).toBe('on');
  expect(page.url()).not.toContain('perf=');
  expect(page.url()).toContain('#/keys');
  await page.reload();
  await page.locator('#hub-main').waitFor();
  expect(await page.evaluate(() => document.documentElement.getAttribute('data-hx-perf'))).toBe('on');
});

test('@perf under the switch: button, menu and drawer draw no shadow and do not move; focus rings stay', async ({ page }) => {
  await open(page, withPerf('/keys', '1'));
  const btn = page.getByRole('button', { name: keys['action.new'], exact: true });
  await btn.hover();
  expect(await still(btn)).toEqual({ shadow: 'none', animation: 'none', transition: true });
  await page.getByRole('button', { name: 'Account menu' }).click();
  const menu = page.getByRole('menu', { name: 'Account menu' });
  await menu.waitFor();
  const pop = page.locator('[class*="__popover_"]').filter({ has: menu });
  expect((await still(pop)).shadow).toBe('none');
  expect((await still(pop)).animation).toBe('none');
  await expect(page.getByRole('menuitemcheckbox', { name: perf['perf.label'] })).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Escape');
  await btn.click();
  const drawer = page.getByRole('dialog', { name: keys['nk.title'] });
  await drawer.waitFor();
  const panel = page.locator('[class*="__drawer_"]').filter({ has: page.getByText(keys['nk.title']) }).first(); // reason: the drawer box itself, outermost first
  expect(await still(panel)).toEqual({ shadow: 'none', animation: 'none', transition: true });
  await page.keyboard.press('Tab');
  const ring = await page.evaluate(() => getComputedStyle(document.activeElement as Element).boxShadow);
  const outline = await page.evaluate(() => getComputedStyle(document.activeElement as Element).outlineStyle);
  expect(ring !== 'none' || outline !== 'none').toBe(true);
});

test('@perf ?perf=0 turns it off and the menu item shows it off; a shadow is drawn again', async ({ page }) => {
  await open(page, withPerf('/keys', '1'));
  await open(page, withPerf('/keys', '0'));
  expect(await page.evaluate(() => document.documentElement.hasAttribute('data-hx-perf'))).toBe(false);
  expect(page.url()).not.toContain('perf=');
  await page.getByRole('button', { name: 'Account menu' }).click();
  await expect(page.getByRole('menuitemcheckbox', { name: perf['perf.label'] })).toHaveAttribute('aria-checked', 'false');
  const pop = page.locator('[class*="__popover_"]').filter({ has: page.getByRole('menu', { name: 'Account menu' }) });
  expect((await still(pop)).shadow).not.toBe('none');
});

test('@perf a focused toast keeps its focus ring (the toast adds the ring to its shadow token)', async ({ page }) => {
  await open(page, withPerf('/keys', '0'));
  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('menuitemcheckbox', { name: perf['perf.label'] }).click();
  await expect(page.locator('html')).toHaveAttribute('data-hx-perf', 'on');
  const toast = page.locator('[class*="__toast_"]').filter({ hasText: perf['perf.on'] });
  await toast.waitFor();
  // A script focus is not a keyboard one, so mark the toast as React Aria does for a keyboard focus.
  await toast.evaluate((el) => el.setAttribute('data-focus-visible', ''));
  const ring = await toast.evaluate((el) => getComputedStyle(el).boxShadow);
  expect(ring.split(/,(?![^(]*\))/).some((x) => !x.trim().startsWith('rgba(0, 0, 0, 0)') && x.trim() !== 'none')).toBe(true);
});

test('@perf a state an animation shows still shows: the page-change bar appears after its delay', async ({ page }) => {
  await open(page, withPerf('/keys', '1'));
  // The real pageHost .pending rule (its bar is visible only through its pending-show animation), on a probe element.
  const opacity = await page.evaluate(async () => {
    const cls = [...document.styleSheets]
      .flatMap((sh) => { try { return [...sh.cssRules]; } catch { return []; } })
      .map((r) => (r as CSSStyleRule).selectorText ?? '')
      .map((sel) => /pageHost-module__pending_[\w-]+/.exec(sel)?.[0])
      .find(Boolean);
    if (!cls) return 'no pending rule';
    const el = document.createElement('div');
    el.className = cls;
    document.querySelector('#hub-main')!.prepend(el);
    await new Promise((r) => setTimeout(r, 400));
    const o = getComputedStyle(el, '::after').opacity;
    el.remove();
    return o;
  });
  expect(opacity).toBe('1');
});

test('@perf turning it on while a menu is leaving lets the menu go', async ({ page }) => {
  await open(page, hubUrl('/keys'));
  // The real kit menu exit rule on a probe element. React Aria unmounts a leaving overlay when its running
  // animations finish; an animation cancelled by the switch never finishes, so the overlay would stay.
  const outcome = await page.evaluate(async () => {
    const cls = [...document.styleSheets]
      .flatMap((sh) => { try { return [...sh.cssRules]; } catch { return []; } })
      .map((r) => (r as CSSStyleRule).selectorText ?? '')
      .filter((sel) => sel.includes('[data-exiting]'))
      .map((sel) => /Menu-module__popover_[\w-]+/.exec(sel)?.[0])
      .find(Boolean);
    if (!cls) return 'no menu exit rule';
    const slow = document.createElement('style');
    slow.textContent = ':root:not([data-hx-perf="on"]) [data-exiting] { animation-duration: 20s !important; }';
    document.head.append(slow);
    const el = document.createElement('div');
    el.className = cls;
    el.setAttribute('data-exiting', '');
    document.querySelector('#hub-main')!.prepend(el);
    const running = el.getAnimations().filter((a) => a.playState === 'running');
    if (running.length === 0) return 'no exit animation';
    document.documentElement.setAttribute('data-hx-perf', 'on');
    const done = Promise.all(running.map((a) => a.finished)).then(() => 'finished', () => 'cancelled');
    const r = await Promise.race([done, new Promise((res) => setTimeout(() => res('still running'), 1000))]);
    el.remove();
    slow.remove();
    return r;
  });
  expect(outcome).toBe('finished');
});

test('@perf the account menu turns it on in place, with a toast', async ({ page }) => {
  await open(page, hubUrl('/keys'));
  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('menuitemcheckbox', { name: perf['perf.label'] }).click();
  await expect(page.getByText(perf['perf.on'], { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.getAttribute('data-hx-perf'))).toBe('on');
  expect(await page.evaluate(() => localStorage.getItem('hub_perf_v1'))).toBe('1');
});
