// Playwright, the passcode gate on real pages:
// - a page whose account has a record boots locked: only the lock screen shows (screen and print), "Locked · Hub";
// - wrong then right passcode; the app comes back with its title;
// - two pages of one browser: one holds `hub-lock:<uid>`, the other's check waits for it, then takes it (real Web Locks);
//   two checks at once never lose a counted try; a page hidden while it waits drops its request (CANCEL);
// - the tenth wrong try runs the terminal path: the record is marked out and Forget runs; the fixture shared.js has no
//   forgetBrowser, so Forget fails and the screen offers Try again (still locked, nothing navigated);
// - a lock message from another page locks this one, and the lock field types with the palette open underneath;
// - the gate is set before the app's first render; a modal open before the lock (Keyboard shortcuts) is hidden, out of
//   the accessibility tree and out of Tab's reach, and the Forgot confirm over it is named, operable and keeps Tab;
//   a body child added while locked (a late portal or toast) is hidden and inert; Ctrl+K opens nothing while locked;
// - one PBKDF2 derivation at 6x CPU throttle (measured; over 1.5 s is flagged).
// Unit cases (each line, each answer): LockScreen.test.tsx, lock.wiring.test.tsx, core/applock*.test.ts.
import { pbkdf2Sync, randomBytes } from 'node:crypto';
import { type BrowserContext, expect, type Page, test } from '@playwright/test';
import { hubUrl } from '@app/e2e';
import strings from './strings.en.json';

// The fixture world's account (core/world.ts): the shown account of every fixtures page.
const UID = '64f0ada00000000000000001';
const KEY = 'hub_lock:' + UID;
const PASS = '482915';

function record(pass: string, o: { idleMin?: number; onLeave?: boolean; n?: number; until?: number; out?: boolean } = {}): string {
  const salt = randomBytes(16);
  const hash = pbkdf2Sync(Buffer.from(pass.normalize('NFKC'), 'utf8'), salt, 600_000, 32, 'sha256');
  return JSON.stringify({
    v: 1, kdf: 'pbkdf2-sha256', iter: 600_000, salt: salt.toString('base64'), hash: hash.toString('base64'), rev: randomBytes(8).toString('base64'),
    digits: true, idleMin: o.idleMin ?? 5, onLeave: o.onLeave ?? false, tries: { n: o.n ?? 0, until: o.until ?? 0, pending: null, out: o.out ?? false },
  });
}
const REC = record(PASS);

/** A page of the Hub; with `locked`, the record is stored first and the page reloads, so it boots locked. */
async function open(ctx: BrowserContext, o: { locked?: boolean; rec?: string } = {}): Promise<Page> {
  const page = await ctx.newPage();
  await page.goto(hubUrl('/home'));
  await page.locator('#hub-main').waitFor({ state: 'attached' });
  if (o.locked) {
    await page.evaluate(([k, v]) => localStorage.setItem(k!, v!), [KEY, o.rec ?? REC]);
    await page.reload();
    await page.locator('#hub-main').waitFor({ state: 'attached' });
  }
  return page;
}
const lockField = (p: Page) => p.getByLabel(strings['lock.field'], { exact: true });
const unlockBtn = (p: Page) => p.getByRole('button', { name: strings['lock.screen.unlock'], exact: true });
const tries = (p: Page) => p.evaluate((k) => (JSON.parse(localStorage.getItem(k) ?? '{}') as { tries?: { n: number } }).tries?.n, KEY);
const lockState = (p: Page) => p.evaluate(async () => { const q = await navigator.locks.query(); return { held: q.held?.length ?? 0, pending: q.pending?.length ?? 0 }; });
async function hide(p: Page) {
  await p.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

/** An unlocked page at a viewport width and route (no record stored yet). */
async function openAt(ctx: BrowserContext, route: string, width: number): Promise<Page> {
  const page = await ctx.newPage();
  await page.setViewportSize({ width, height: 900 });
  await page.goto(hubUrl(route));
  await page.locator('#hub-main').waitFor({ state: 'attached' });
  return page;
}
/** Another page of the browser stores the record and posts the lock stamp (the storage path of a lock message). */
async function lockFromAnotherPage(ctx: BrowserContext): Promise<Page> {
  const b = await open(ctx);
  await b.evaluate(([k, v, now]) => { localStorage.setItem(k!, v!); localStorage.setItem(now!, String(Date.now())); }, [KEY, REC, 'hub_lock_now:' + UID]);
  return b;
}
/** The focus is on one of the lock host's controls, or past the last one on the body (the browser's own chrome). */
const focusInHost = (p: Page) => p.evaluate(() => { const a = document.activeElement; return a === document.body || !!(a && document.getElementById('hub-lock-host')!.contains(a)); });
async function unlockWith(p: Page) {
  await lockField(p).fill(PASS);
  await unlockBtn(p).click();
  await expect(p.locator('body')).not.toHaveAttribute('data-hub-locked', '', { timeout: 15_000 });
}

test.describe.configure({ mode: 'serial' });

test('boots locked: only the lock screen shows, on screen and in print; the tab says "Locked · Hub"', async ({ context }) => {
  const p = await open(context, { locked: true });
  await expect(p.locator('body')).toHaveAttribute('data-hub-locked', '');
  await expect(p.getByRole('heading', { name: strings['lock.screen.title'] })).toBeVisible();
  await expect(p.locator('#root')).toBeHidden();
  await expect(p.locator('#root')).toHaveAttribute('inert', '');
  await expect(lockField(p)).toBeFocused();
  await expect(lockField(p)).toHaveAttribute('inputmode', 'numeric');
  await expect(p).toHaveTitle(strings['lock.tabTitle']);
  // Nothing of the account on the screen.
  await expect(p.locator('#hub-lock-host')).not.toContainText(/ada|@example/i);
  await p.emulateMedia({ media: 'print' });
  await expect(p.locator('#root')).toBeHidden();
  await expect(p.getByRole('heading', { name: strings['lock.screen.title'] })).toBeVisible();
  await p.emulateMedia({ media: 'screen' });
});

test('wrong, then right: the wrong line, then the app and its title come back', async ({ context }) => {
  const p = await open(context, { locked: true });
  await lockField(p).fill('000000');
  await unlockBtn(p).click();
  await expect(p.getByRole('alert').filter({ hasText: strings['lock.screen.wrong'] })).toBeVisible({ timeout: 15_000 });
  expect(await tries(p)).toBe(1);
  await lockField(p).fill(PASS);
  await unlockBtn(p).click();
  await expect(p.locator('body')).not.toHaveAttribute('data-hub-locked', '', { timeout: 15_000 });
  await expect(p.locator('#root')).toBeVisible();
  await expect(p).not.toHaveTitle(strings['lock.tabTitle']);
  expect(await tries(p)).toBe(0);
});

test('the tenth wrong try runs the terminal path: the record is out, Forget runs; here it fails, so the screen says so and offers Try again', async ({ context }) => {
  const p = await open(context, { locked: true, rec: record(PASS, { n: 9 }) });
  const url = p.url();
  await lockField(p).fill('000000');
  await unlockBtn(p).click();
  await expect(p.getByRole('alert').filter({ hasText: strings['notice.purgeBody'] })).toBeVisible({ timeout: 15_000 });
  await expect(p.getByRole('button', { name: strings['notice.tryAgain'], exact: true })).toBeVisible();
  await expect(lockField(p)).toHaveCount(0);
  await expect(p.locator('body')).toHaveAttribute('data-hub-locked', '');
  expect(p.url()).toBe(url);
  expect(await p.evaluate((k) => (JSON.parse(localStorage.getItem(k) ?? '{}') as { tries?: { out: boolean } }).tries?.out, KEY)).toBe(true);
  // Try again runs the terminal Forget again: it fails the same way here and stays.
  await p.getByRole('button', { name: strings['notice.tryAgain'], exact: true }).click();
  await expect(p.getByRole('alert').filter({ hasText: strings['notice.purgeBody'] })).toBeVisible();
  expect(p.url()).toBe(url);
});

test('a reload during a stored wait: the countdown, the disabled field and the tries-left line at once, with no check of its own', async ({ context }) => {
  const p = await open(context, { locked: true, rec: record(PASS, { n: 8, until: Date.now() + 15 * 60_000 }) });
  await expect(p.getByRole('button', { name: /^Try again in 1[45]:/ })).toBeVisible({ timeout: 15_000 });
  await expect(lockField(p)).toBeDisabled();
  await expect(p.getByRole('alert').filter({ hasText: '2 tries left' })).toBeVisible();
  expect(await tries(p)).toBe(8);
});

test('a reload with a stored out (the boot terminal path ran, its Forget failed): the purge message and Try again, no field', async ({ context }) => {
  const p = await open(context, { locked: true, rec: record(PASS, { n: 10, out: true }) });
  await expect(p.getByRole('alert').filter({ hasText: strings['notice.purgeBody'] })).toBeVisible({ timeout: 15_000 });
  await expect(p.getByRole('button', { name: strings['notice.tryAgain'], exact: true })).toBeVisible();
  await expect(lockField(p)).toHaveCount(0);
});

test('a cold load of an unmatched route while a passcode is stored: the tab still says "Locked · Hub"', async ({ context }) => {
  const p = await open(context, { locked: true });
  await p.goto(hubUrl('/no-such-page-here'));
  await expect(p.locator('body')).toHaveAttribute('data-hub-locked', '');
  await expect(p).toHaveTitle(strings['lock.tabTitle']);
});

test('two pages, real Web Locks: while one page holds hub-lock:<uid>, the other\'s check waits; it takes the lock after release and unlocks', async ({ context }) => {
  const a = await open(context, { locked: true });
  const b = await open(context);
  await expect(b.locator('body')).toHaveAttribute('data-hub-locked', '');
  // Page A holds the account's lock (as its own check would) until told to let go.
  await a.evaluate((name) => {
    (window as unknown as { release?: () => void }).release = undefined;
    void navigator.locks.request(name, () => new Promise<void>((r) => { (window as unknown as { release?: () => void }).release = r; }));
  }, 'hub-lock:' + UID);
  await expect.poll(() => lockState(a)).toEqual({ held: 1, pending: 0 });
  await lockField(b).fill(PASS);
  await unlockBtn(b).click();
  await expect.poll(() => lockState(b)).toEqual({ held: 1, pending: 1 });
  await b.waitForTimeout(1500);
  await expect(b.locator('body')).toHaveAttribute('data-hub-locked', '');
  expect(await tries(b)).toBe(0); // nothing reserved before the lock was taken
  await a.evaluate(() => (window as unknown as { release?: () => void }).release?.());
  await expect(b.locator('body')).not.toHaveAttribute('data-hub-locked', '', { timeout: 15_000 });
  await expect.poll(() => lockState(b)).toEqual({ held: 0, pending: 0 });
  // A stays locked: unlocking is per tab.
  await expect(a.locator('body')).toHaveAttribute('data-hub-locked', '');
});

test('two pages checking at once: the checks run one after the other, and both wrong tries are counted', async ({ context }) => {
  const a = await open(context, { locked: true });
  const b = await open(context);
  await lockField(a).fill('111111');
  await lockField(b).fill('222222');
  await Promise.all([unlockBtn(a).click(), unlockBtn(b).click()]);
  await expect(a.getByRole('alert').filter({ hasText: strings['lock.screen.wrong'] })).toBeVisible({ timeout: 20_000 });
  await expect(b.getByRole('alert').filter({ hasText: strings['lock.screen.wrong'] })).toBeVisible({ timeout: 20_000 });
  expect(await tries(a)).toBe(2);
});

test('CANCEL: a page hidden while its check waits for the lock drops the request; the check never runs there', async ({ context }) => {
  const a = await open(context, { locked: true });
  const b = await open(context);
  await a.evaluate((name) => {
    void navigator.locks.request(name, () => new Promise<void>((r) => { (window as unknown as { release?: () => void }).release = r; }));
  }, 'hub-lock:' + UID);
  await expect.poll(() => lockState(a)).toEqual({ held: 1, pending: 0 });
  await lockField(b).fill(PASS);
  await unlockBtn(b).click();
  await expect.poll(() => lockState(b)).toEqual({ held: 1, pending: 1 });
  await hide(b);
  await expect.poll(() => lockState(b)).toEqual({ held: 1, pending: 0 });
  await a.evaluate(() => (window as unknown as { release?: () => void }).release?.());
  await b.waitForTimeout(1500);
  await expect(b.locator('body')).toHaveAttribute('data-hub-locked', '');
  expect(await tries(b)).toBe(0);
});

test('a lock message from another page locks this one; with the palette open underneath, the lock field takes typing and unlocks', async ({ context }) => {
  await (await open(context)).evaluate(([k, v]) => localStorage.setItem(k!, v!), [KEY, REC]);
  const a = await open(context);
  await expect(a.locator('body')).toHaveAttribute('data-hub-locked', '');
  await lockField(a).fill(PASS);
  await unlockBtn(a).click();
  await expect(a.locator('body')).not.toHaveAttribute('data-hub-locked', '', { timeout: 15_000 });
  await a.keyboard.press('Control+k');
  await expect(a.getByRole('dialog', { name: strings['palette.label'] })).toBeVisible();
  // Another page posts the lock stamp (the storage path of the lock message).
  const b = await open(context);
  await b.evaluate((k) => localStorage.setItem(k, String(Date.now())), 'hub_lock_now:' + UID);
  await expect(a.locator('body')).toHaveAttribute('data-hub-locked', '');
  await expect(a.getByRole('dialog', { name: strings['palette.label'] })).toBeHidden();
  await lockField(a).click();
  await a.keyboard.type(PASS);
  await expect(lockField(a)).toHaveValue(PASS);
  await a.keyboard.press('Enter');
  await expect(a.locator('body')).not.toHaveAttribute('data-hub-locked', '', { timeout: 15_000 });
  // The palette was kept, not closed, by the lock.
  await expect(a.getByRole('dialog', { name: strings['palette.label'] })).toBeVisible();
});

test('the gate is set before the app first renders: when #hub-main first appears, the body already says locked', async ({ context }) => {
  await context.addInitScript(() => {
    const w = window as unknown as { gateAtFirstRender?: boolean };
    new MutationObserver((_, obs) => {
      if (w.gateAtFirstRender === undefined && document.getElementById('hub-main')) {
        w.gateAtFirstRender = document.body.hasAttribute('data-hub-locked');
        obs.disconnect();
      }
    }).observe(document, { childList: true, subtree: true });
  });
  const p = await open(context, { locked: true });
  expect(await p.evaluate(() => (window as unknown as { gateAtFirstRender?: boolean }).gateAtFirstRender)).toBe(true);
});

test('a modal open before the lock is hidden, out of the accessibility tree and of Tab; the Forgot confirm over it is named, operable and keeps Tab; unlock keeps the modal', async ({ context }) => {
  const p = await open(context, { locked: true });
  await lockField(p).fill(PASS);
  await unlockBtn(p).click();
  await expect(p.locator('body')).not.toHaveAttribute('data-hub-locked', '', { timeout: 15_000 });
  await p.locator('#hub-main').click({ position: { x: 5, y: 5 } });
  await p.keyboard.press('?');
  const help = p.getByRole('dialog', { name: strings['keys.title'] });
  await expect(help).toBeVisible();
  const b = await open(context);
  await b.evaluate((k) => localStorage.setItem(k, String(Date.now())), 'hub_lock_now:' + UID);
  await expect(p.locator('body')).toHaveAttribute('data-hub-locked', '');
  await expect(help).toBeHidden();
  expect(await p.locator('body').ariaSnapshot()).not.toContain(strings['keys.title']);
  // Tab cycles the lock screen's controls; past the last one it leaves the page for the browser's own chrome (the body
  // is the active element then), never to the app or the modal behind.
  const inHost = () => p.evaluate(() => { const a = document.activeElement; return a === document.body || !!(a && document.getElementById('hub-lock-host')!.contains(a)); });
  const onLockControl = () => p.evaluate(() => { const a = document.activeElement; return !!(a && a !== document.body && document.getElementById('hub-lock-host')!.contains(a)); });
  let reached = 0;
  for (let i = 0; i < 6; i++) { await p.keyboard.press('Tab'); expect(await inHost()).toBe(true); if (await onLockControl()) reached++; }
  expect(reached).toBeGreaterThanOrEqual(3);
  await p.getByRole('button', { name: strings['lock.screen.forget'], exact: true }).click();
  const confirm = p.getByRole('alertdialog', { name: strings['lock.forgot.title'] });
  await expect(confirm).toBeVisible();
  const inConfirm = () => p.evaluate(() => !!document.activeElement?.closest('[role="alertdialog"]'));
  for (let i = 0; i < 4; i++) { await p.keyboard.press('Tab'); expect(await inConfirm()).toBe(true); }
  // The card behind the confirm is inert (out of the accessibility tree; Playwright's ariaSnapshot ignores inert, so
  // check the attribute and that the browser refuses focus to the field).
  await expect(p.locator('[data-hub-lock-screen]')).toHaveAttribute('inert', '');
  expect(await p.evaluate(() => { (document.querySelector('[data-hub-lock-screen] input') as HTMLInputElement).focus(); return !!document.activeElement?.closest('[role="alertdialog"]'); })).toBe(true);
  await confirm.getByRole('button', { name: /cancel/i }).click();
  await expect(confirm).toBeHidden();
  await lockField(p).fill(PASS);
  await p.keyboard.press('Enter');
  await expect(p.locator('body')).not.toHaveAttribute('data-hub-locked', '', { timeout: 15_000 });
  await expect(help).toBeVisible();
});

test('while locked: a body child added late (a portal or toast) is hidden and inert, and Ctrl+K opens nothing', async ({ context }) => {
  const p = await open(context, { locked: true });
  await p.evaluate(() => {
    const d = document.createElement('div');
    d.id = 'late-portal';
    d.innerHTML = '<button type="button">late action</button>';
    document.body.appendChild(d);
  });
  await expect(p.locator('#late-portal')).toBeHidden();
  await expect(p.locator('#late-portal')).toHaveAttribute('inert', '');
  await p.keyboard.press('Control+k');
  await expect(p.getByRole('dialog', { name: strings['palette.label'] })).toHaveCount(0);
  await expect(lockField(p)).toBeFocused();
});

test('another page\'s fifth wrong try: this page shows the 30 s countdown and the disabled field, with no input here (real storage event)', async ({ context }) => {
  const rec = record(PASS, { n: 4 });
  const a = await open(context, { locked: true, rec });
  const b = await open(context, { locked: true, rec });
  await expect(lockField(a)).toBeEnabled(); // the Unlock button is disabled only while the field is empty
  await lockField(b).fill('000000');
  await unlockBtn(b).click();
  await expect(b.getByRole('button', { name: /^Try again in 0:(30|29|28)$/ })).toBeVisible({ timeout: 15_000 });
  expect(await tries(b)).toBe(5);
  // A: nothing typed, clicked or focused there since it booted.
  await expect(a.getByRole('button', { name: /^Try again in 0:(30|29|28|27|26|25)$/ })).toBeVisible({ timeout: 10_000 });
  await expect(lockField(a)).toBeDisabled();
});

test('another page\'s seventh wrong try, after the sixth\'s wait ended: this page shows the 5 min countdown and "3 tries left" at once', async ({ context }) => {
  const rec = record(PASS, { n: 6, until: Date.now() - 1_000 });
  const a = await open(context, { locked: true, rec });
  const b = await open(context, { locked: true, rec });
  await expect(a.getByRole('alert').filter({ hasText: 'tries left' })).toHaveCount(0);
  await lockField(b).fill('000000');
  await unlockBtn(b).click();
  await expect(b.getByRole('button', { name: /^Try again in [45]:/ })).toBeVisible({ timeout: 15_000 });
  await expect(a.getByRole('button', { name: /^Try again in [45]:/ })).toBeVisible({ timeout: 10_000 });
  await expect(a.getByRole('alert').filter({ hasText: '3 tries left' })).toBeVisible();
  await expect(lockField(a)).toBeDisabled();
});

test('a modal opened while locked (its trigger pressed by a timer after the lock): hidden, out of the accessibility tree, in print too; the lock field keeps the focus and Tab; unlock shows it', async ({ context }) => {
  const p = await openAt(context, '/home', 1350);
  const qr = p.locator('[aria-haspopup="dialog"]').first(); // reason: any QR code trigger opens the same real modal
  await expect(qr).toBeVisible();
  const name = (await qr.getAttribute('aria-label')) ?? (await qr.textContent()) ?? '';
  await lockFromAnotherPage(context);
  await expect(p.locator('body')).toHaveAttribute('data-hub-locked', '');
  await expect(lockField(p)).toBeFocused();
  // The app's own code opens it while the lock is up: the trigger's press handler runs (a script click; a person cannot reach it).
  await p.evaluate(() => new Promise<void>((r) => setTimeout(() => { (document.querySelector('[aria-haspopup="dialog"]') as HTMLElement).click(); r(); }, 300)));
  // The app's dialog: any outside the lock host (the lock screen is one too).
  const dialog = p.locator('body > :not(#hub-lock-host) [role="dialog"]');
  await expect(dialog).toHaveCount(1);
  await expect(dialog).toBeHidden();
  // Its focus scope mounted while locked: it took nothing (the browser refuses focus inside inert).
  await p.waitForTimeout(300);
  await expect(lockField(p)).toBeFocused();
  expect(await dialog.evaluate((d) => d.contains(document.activeElement))).toBe(false);
  const title = await dialog.evaluate((d) => d.getAttribute('aria-label') || document.getElementById(d.getAttribute('aria-labelledby') ?? '')?.textContent || '');
  expect(title).not.toBe('');
  const snap = await p.locator('body').ariaSnapshot();
  expect(snap).not.toContain(title);
  expect(snap).not.toContain(name);
  for (let i = 0; i < 6; i++) { await p.keyboard.press('Tab'); expect(await focusInHost(p)).toBe(true); }
  await p.keyboard.type('12');
  await expect(lockField(p)).toHaveValue(/12$/);
  await p.emulateMedia({ media: 'print' });
  await expect(dialog).toBeHidden();
  await expect(p.getByRole('heading', { name: strings['lock.screen.title'] })).toBeVisible();
  await p.emulateMedia({ media: 'screen' });
  await unlockWith(p);
  // Unlocked: the dialog has the focus and the page behind it stays out of reach until it closes (React Aria hid
  // nothing the lock had hidden already, so the lock keeps its marks for it).
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true);
  await expect(p.locator('#root')).toHaveAttribute('inert', '');
  await p.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(p.locator('#root')).not.toHaveAttribute('inert', '');
  expect(await p.evaluate(() => document.activeElement !== document.body && !!document.getElementById('root')!.contains(document.activeElement))).toBe(true);
});

test('a focused Board frame crossing the lock: the frame hides (screen and print), leaves the accessibility tree, loses the focus and the keyboard; its parent keys move nothing; unlock shows it with its state', async ({ context }) => {
  // A program page that answers: a frame with a text field of its own.
  await context.route(/fixture\.invalid/, (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>prog</title><input id="in" aria-label="program field">' }));
  const p = await openAt(context, '/board', 1350);
  await p.getByRole('button', { name: /^Add a program/ }) /* the Board's own string (with its key hint); the shell never imports a page */.click();
  await p.getByRole('option', { name: /^atlas/ }).click();
  await p.getByRole('option', { name: /^Terminal/ }).click();
  await p.getByRole('option', { name: /^terminal-1/ }).click();
  const iframe = p.locator('iframe[title="terminal-1 on atlas"]');
  await expect(iframe).toBeVisible();
  const inFrame = p.frameLocator('iframe[title="terminal-1 on atlas"]').locator('#in');
  await inFrame.click();
  await p.keyboard.type('a');
  await expect(inFrame).toHaveValue('a');
  await expect(iframe).toBeFocused();
  await lockFromAnotherPage(context);
  await expect(p.locator('body')).toHaveAttribute('data-hub-locked', '');
  await expect(iframe).toBeHidden();
  await expect(lockField(p)).toBeFocused();
  // The keyboard reaches the lock field, never the frame.
  await p.keyboard.type('12');
  await expect(lockField(p)).toHaveValue('12');
  await expect(inFrame).toHaveValue('a');
  expect(await p.locator('iframe[title="terminal-1 on atlas"]').contentFrame().locator('body').evaluate(() => document.hasFocus())).toBe(false);
  // The frame's parent keys (leave the tile, move right) arrive while locked: the focus stays on the lock field.
  for (const chord of ['escape', 'right']) {
    await iframe.contentFrame().locator('body').evaluate((_, c) => window.parent.postMessage({ type: 'hoody-parent-key', v: 1, chord: c }, '*'), chord);
  }
  await p.waitForTimeout(300);
  await expect(lockField(p)).toBeFocused();
  for (let i = 0; i < 6; i++) { await p.keyboard.press('Tab'); expect(await focusInHost(p)).toBe(true); }
  expect(await p.locator('body').ariaSnapshot()).not.toContain('terminal-1');
  await p.emulateMedia({ media: 'print' });
  await expect(iframe).toBeHidden();
  await p.emulateMedia({ media: 'screen' });
  await lockField(p).fill('');
  await unlockWith(p);
  await expect(iframe).toBeVisible();
  await expect(inFrame).toHaveValue('a');
});

// The overlays that sit outside the page's own flow, one row each: opened unlocked, then the lock comes from another
// page. Each must hide (screen and print), leave the accessibility tree and Tab's reach while locked, and the app
// must come back on unlock. `portal` rows render as their own body child (outside #root).
const SURFACES: ReadonlyArray<{ name: string; width: number; route: string; portal: boolean; open: (p: Page) => Promise<void>; surface: (p: Page) => ReturnType<Page['locator']>; aria: string }> = [
  {
    name: 'the phone More drawer', width: 390, route: '/home', portal: false, aria: strings['nav.label'],
    open: (p) => p.getByRole('navigation', { name: strings['bottom.label'] }).getByRole('button', { name: strings['bottom.more'], exact: true }).click(),
    surface: (p) => p.getByRole('navigation', { name: strings['nav.label'], includeHidden: true }),
  },
  {
    name: 'the account menu', width: 1350, route: '/home', portal: true, aria: strings['top.account'],
    open: (p) => p.getByRole('button', { name: strings['top.account'] }).click(),
    surface: (p) => p.getByRole('menu', { name: strings['top.account'], includeHidden: true }),
  },
  {
    name: 'the phone floating action button', width: 390, route: '/vault', portal: true, aria: 'New entry',
    open: async () => undefined,
    surface: (p) => p.locator('body > div:has(> button[aria-label="New entry"])'),
  },
  {
    name: 'the Agent dock', width: 1350, route: '/home', portal: false, aria: strings['ask.label'],
    open: (p) => p.getByRole('button', { name: new RegExp(`^${strings['top.ask']}(?:,|$)`) }).first().click(), // reason: the top bar's Agent comes before Home's Agent program tile; the fixture world has a chat waiting, so its name may carry the AI dot's words ("AI, waiting for you")
    surface: (p) => p.getByRole('complementary', { name: strings['ask.label'], exact: true, includeHidden: true }),
  },
  {
    name: 'the phone Agent sheet', width: 390, route: '/home', portal: false, aria: strings['ask.label'],
    open: (p) => p.locator('form').filter({ has: p.getByRole('list', { name: 'Ideas to start with' }) }).getByRole('button', { name: 'Ask', exact: true }).click(), // reason: a phone opens the sheet from Home's Ask with the box empty (the bottom nav's AI is a link to the AI page; the top bar's AI button is not shown at 390); the names are the home strings, which the shell may not import
    surface: (p) => p.getByRole('complementary', { name: strings['ask.label'], exact: true, includeHidden: true }),
  },
];

for (const row of SURFACES) {
  test(`portal surfaces: ${row.name} open when the lock comes is hidden on screen and in print, out of the accessibility tree and Tab's reach; unlock brings the app back`, async ({ context }) => {
    const p = await openAt(context, row.route, row.width);
    await row.open(p);
    const surface = row.surface(p);
    await expect(surface).toBeVisible();
    expect(await surface.evaluate((e) => !document.getElementById('root')!.contains(e))).toBe(row.portal);
    await lockFromAnotherPage(context);
    await expect(p.locator('body')).toHaveAttribute('data-hub-locked', '');
    await expect(surface).toBeHidden();
    await expect(lockField(p)).toBeFocused();
    // ariaSnapshot ignores inert: what it lists is what is not hidden (display or visibility) from it.
    expect(await p.locator('body').ariaSnapshot()).not.toContain(row.aria);
    for (let i = 0; i < 6; i++) { await p.keyboard.press('Tab'); expect(await focusInHost(p)).toBe(true); }
    // Inert from its body child (the portal's own, or #root).
    expect(await surface.evaluate((e) => !!e.closest('body > [inert]'))).toBe(true);
    await p.emulateMedia({ media: 'print' });
    await expect(surface).toBeHidden();
    await expect(p.getByRole('heading', { name: strings['lock.screen.title'] })).toBeVisible();
    await p.emulateMedia({ media: 'screen' });
    await unlockWith(p);
    await expect(p.locator('#root')).toBeVisible();
  });
}

test('PBKDF2 at 6x CPU throttle: one 600 000-iteration derivation, measured', async ({ context }) => {
  const p = await open(context);
  const cdp = await context.newCDPSession(p);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
  const ms = await p.evaluate(async () => {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('482915'), 'PBKDF2', false, ['deriveBits']);
    const t0 = performance.now();
    await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new Uint8Array(16), iterations: 600_000 }, key, 256);
    return performance.now() - t0;
  });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  test.info().annotations.push({ type: 'pbkdf2-6x-ms', description: String(Math.round(ms)) });
  expect(ms).toBeGreaterThan(0);
});
