// The ChatGPT sign-in step's "Open the sign-in page" (GptStep): it opened the page with window.open, a browser global the
// terminal Hub has none of (TERM_GLOBAL). It now goes through the kit's openOutside: on the web
// the same new tab (hostEnv openExternal, noopener,noreferrer); in the terminal the host browser, or the link copied.
import { afterEach, expect, test } from 'bun:test';
import { renderPage } from '../../../../scripts/term/render';

type S = Awaited<ReturnType<typeof renderPage>>;
let s: S | null = null;
afterEach(() => { s?.close(); s = null; });

async function until(ok: (f: string) => boolean, ms = 20_000): Promise<string> {
  const end = performance.now() + ms;
  while (!ok(s!.frame) && performance.now() < end) { await new Promise((r) => setTimeout(r, 250)); await s!.settle(); }
  return s!.frame;
}
async function press(text: string): Promise<void> {
  await until((f) => f.includes(text));
  const rows = s!.frame.split('\n');
  const y = rows.findIndex((r) => r.includes(text));
  expect(y, `"${text}" not on screen:\n${s!.frame}`).toBeGreaterThanOrEqual(0);
  await s!.click(rows[y]!.indexOf(text) + 1, y);
}

test('Sign in with ChatGPT, then "Open the sign-in page": no browser global is read', async () => {
  s = await renderPage({ page: 'ai', path: '/ai/models?connect=openai', cols: 120, rows: 40, settleMs: 3000 });
  await press('Sign in with ChatGPT');
  await press('Open the sign-in page');
  await s.settle();
  expect(s.trapsAt).toEqual([]);
  expect(s.failures).toEqual([]);
}, 180_000);
