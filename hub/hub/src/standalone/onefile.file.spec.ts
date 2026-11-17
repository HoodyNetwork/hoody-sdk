// Playwright: the built one-file Hub (hub:build-single), opened from file://. Every request leaving the file is caught:
// only its Hoody's API origin is answered, by the mocks below; anything else is aborted, so no real API is reached and
// nothing real signs in. Checks: the sign-in card; a failed hub/config read offering only "Try again"; payments handed
// off to the online Hub with no payment request sent; inside a frame, no way to sign in.
// The file is not built by the spec run and is named explicitly: HUB_SINGLE_FILE=<a fresh hub:build-single output>.
// Without it every case is skipped and says why (a dist/ copy left from an older build is never picked up: it would
// judge that build, not the change under test).
import { existsSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { expect, test, type BrowserContext, type Route } from '@playwright/test';
import strings from './strings.en.json';

const FILE = process.env.HUB_SINGLE_FILE ?? '';
const BUILT = FILE !== '' && existsSync(FILE);
const URL_OF = pathToFileURL(FILE).href;
// A key of the right shape (never a real one) and a 24-hex account id.
const KEY = `hdy_${'0'.repeat(24)}_${'f'.repeat(48)}`;
const ACCOUNT = 'a'.repeat(24);

test.skip(!BUILT, FILE ? `no built one-file Hub at ${FILE}` : 'HUB_SINGLE_FILE is not set: build with `bun run hub:build-single --out <file>` and set HUB_SINGLE_FILE=<file>');

/** The Hoody the file is built for: the origin its first request (GET /api/v1/hub/config) goes to. */
const CONFIG = '/api/v1/hub/config';
const json = (r: Route, body: unknown, status = 200) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

/** Catches every request that leaves the file; `sent` keeps method + URL of each. */
async function fence(ctx: BrowserContext, o: { config: 'ok' | 'down' }) {
  const sent: string[] = [];
  let api: string | null = null;
  await ctx.route('**/*', async (r) => {
    const u = r.request().url();
    if (/^(file|data|blob):/.test(u)) return r.continue();
    sent.push(`${r.request().method()} ${u}`);
    const at = new URL(u);
    if (at.pathname === CONFIG && api === null) api = at.origin;
    if (at.origin !== api) return r.abort();
    if (at.pathname === CONFIG) return o.config === 'ok' ? json(r, { data: { realm_api_domain: null, proxy_domain: null, hub_file_min: 1 } }) : r.fulfill({ status: 503, body: '' });
    if (at.pathname === '/api/v1/auth/tokens/me') {
      return json(r, { data: { token: { id: 't1', alias: 'fixture key', realm_ids: [], allow_no_realm: true, expires_at: null, permissions: { computers: { read: true }, projects: { read: true }, wallet: { read: true, write: true } } } } });
    }
    if (at.pathname === '/api/v1/users/auth/me') return json(r, { data: { id: ACCOUNT, username: 'fixture-user', email: null } });
    return json(r, { error: 'NOT_FOUND', message: 'not here' }, 404);
  });
  return sent;
}

test('the sign-in card renders, with no page error', async ({ context, page }) => {
  await fence(context, { config: 'ok' });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(URL_OF);
  await expect(page.getByRole('button', { name: /^sign in$/i })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('button', { name: strings['key.way'] }).or(page.getByText(/Other ways to sign in/))).toBeVisible();
  expect(errors).toEqual([]);
});

test('hub/config refused: only Try again, no way to sign in', async ({ context, page }) => {
  await fence(context, { config: 'down' });
  await page.goto(URL_OF);
  await expect(page.getByRole('button', { name: strings['unreach.retry'] })).toBeVisible({ timeout: 20_000 });
  expect(await page.getByRole('button').allInnerTexts()).toEqual([expect.stringMatching(new RegExp(`^${strings['unreach.retry']}$`, 'i'))]);
  await expect(page.getByRole('link')).toHaveCount(0);
  await expect(page.locator('input, textarea')).toHaveCount(0);
});

test('payments: Add funds hands off to the online Hub and sends no payment request', async ({ context, page }) => {
  const sent = await fence(context, { config: 'ok' });
  await page.goto(URL_OF);
  await page.getByText(/Other ways to sign in/).click({ timeout: 20_000 });
  await page.getByText(strings['key.way']).click();
  await page.getByLabel(strings['key.label']).fill(KEY);
  await page.getByRole('button', { name: strings['key.check'] }).click();
  // A key that opens the whole account asks: everything, or one realm.
  await page.getByRole('button', { name: /Choose/ }).click();
  await page.getByRole('option', { name: strings['key.dest.all'] }).click();
  await page.getByRole('button', { name: strings['key.continue'] }).click();
  await page.getByRole('button', { name: strings['key.open'] }).click();
  await expect(page.getByRole('link', { name: 'Plans & Billing' })).toBeVisible({ timeout: 20_000 });
  await page.evaluate(() => { location.hash = '#/billing'; });
  await page.getByRole('button', { name: 'Add funds', exact: true }).click({ timeout: 20_000 });
  const d = page.getByRole('dialog');
  await expect(d.getByText('Payments are made in your Hoody Hub online.')).toBeVisible();
  await expect(d.getByRole('link', { name: /open your hoody hub/i }).or(d.getByRole('button', { name: /open your hoody hub/i }))).toBeVisible();
  expect(sent.filter((s) => !s.startsWith('GET ') && /wallet|payment|checkout|top-?up|subscription/i.test(s))).toEqual([]);
});

test('inside a frame: no way to sign in, only Open in a new tab', async ({ context, page }, info) => {
  await fence(context, { config: 'ok' });
  const outer = info.outputPath('outer.html');
  writeFileSync(outer, `<!doctype html><title>outer</title><iframe src="${URL_OF}" style="width:1200px;height:800px"></iframe>`);
  await page.goto(pathToFileURL(outer).href);
  const f = page.frameLocator('iframe');
  await expect(f.getByText(strings['framed.body'])).toBeVisible({ timeout: 20_000 });
  await expect(f.locator('input, textarea')).toHaveCount(0);
  await expect(f.getByRole('button', { name: /^sign in$/i })).toHaveCount(0);
  await expect(f.getByText(strings['key.way'])).toHaveCount(0);
});
