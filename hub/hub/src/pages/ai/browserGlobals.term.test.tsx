// AI page reads of browser globals reached by a press: each case drives
// the page to the read and asserts the session recorded no strict-global trap. Each one traps when read unguarded:
//   - the chat's "⋯" menu: document.activeElement (ConvMenu.tsx, the opener kept for the focus return)
//   - closing the default-model impact confirm: window.setTimeout + document.querySelector (Default.tsx)
//   - the New workflow drawer: window.requestAnimationFrame (NewAsk.tsx AskBody)
//   - MCP servers (a settings session held): window.addEventListener('pagehide') (settings/rules/Session.ts)
import { afterEach, expect, test } from 'bun:test';
import { renderPage } from '../../../scripts/term/render';

const REALM = 'f1f1f1f1f1f1f1f1f1f1f1f1';
type S = Awaited<ReturnType<typeof renderPage>>;
let s: S | null = null;
afterEach(() => { s?.close(); s = null; });

async function until(ok: (f: string) => boolean, ms = 20_000): Promise<string> {
  const end = performance.now() + ms;
  while (!ok(s!.frame) && performance.now() < end) { await new Promise((r) => setTimeout(r, 250)); await s!.settle(); }
  return s!.frame;
}
/** Click the LAST place `text` is drawn (page content sits right of and below the rails that may repeat a word). */
async function press(text: string): Promise<void> {
  await until((f) => f.includes(text));
  const rows = s!.frame.split('\n');
  let y = -1;
  for (let i = rows.length - 1; i >= 0; i--) if (rows[i]!.includes(text)) { y = i; break; }
  expect(y, `"${text}" not on screen:\n${s!.frame}`).toBeGreaterThanOrEqual(0);
  await s!.click(rows[y]!.lastIndexOf(text) + 1, y);
  await s!.settle();
}
const open = async (path: string) => { s = await renderPage({ page: 'ai', path, cols: 120, rows: 40, settleMs: 3000 }); };
const clean = () => { expect(s!.trapsAt).toEqual([]); expect(s!.failures).toEqual([]); };

test("the chat's ⋯ menu opens without reading document.activeElement", async () => {
  await open(`/ai/c/s-today?computer=atlas.00a1&realm=${REALM}`);
  await until((f) => f.includes('[Details]'));
  const rows = s!.frame.split('\n');
  const y = rows.findIndex((r) => r.includes('[Details]'));
  await s!.click(rows[y]!.lastIndexOf('[⋯]') + 1, y);
  await s!.settle();
  await until((f) => /Rename|Close this chat/.test(f));
  clean();
}, 180_000);

test('the default-model impact confirm closes without a timer or a querySelector', async () => {
  await open('/ai/models?pick=helper');
  await press('GPT-5');
  await until((f) => f.includes('Cancel'));
  await press('Cancel');
  await new Promise((r) => setTimeout(r, 600));
  await s!.settle();
  clean();
}, 180_000);

test('the New workflow drawer opens without requestAnimationFrame', async () => {
  await open('/ai/auto/workflows');
  await press('New workflow');
  await until((f) => (f.match(/New workflow/g) ?? []).length > 1);
  clean();
}, 180_000);

test('MCP servers holds a settings session without a pagehide listener on window', async () => {
  await open('/ai/connections');
  await until((f) => f.includes('MCP servers'));
  await new Promise((r) => setTimeout(r, 1500));
  await s!.settle();
  clean();
}, 180_000);
