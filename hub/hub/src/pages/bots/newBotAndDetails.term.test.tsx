// Bots, driven by presses (fixtures):
//   - New Bot with "Give it a link now" off: Create Bot ends with the Bot done and shows no key or address
//     (the fixture's fixed answer once carried a link and a key whatever the switch said; the live
//     createBotFlow stops after the Bot). FIXTURE_SHAPE in data.ts shapes the fixture answer as the live change answers.
//     The steps list only the steps the create was sent with (target newbot.track.test.tsx): no Link or Key row.
//   - Opening a Bot's Details panel reads no browser global (BotPane's reveal ran two requestAnimationFrame: TERM_GLOBAL).
import { afterEach, expect, test } from 'bun:test';
import { renderPage } from '../../../scripts/term/render';
import { focusedNode, semanticsOf } from '../../term/prim/semantics';

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
  let y = -1;
  for (let i = rows.length - 1; i >= 0; i--) if (rows[i]!.includes(text)) { y = i; break; }
  expect(y, `"${text}" not on screen:\n${s!.frame}`).toBeGreaterThanOrEqual(0);
  await s!.click(rows[y]!.lastIndexOf(text) + 1, y);
  await s!.settle();
}

test('New Bot without a link: Create Bot shows the Bot done, no Link or Key step and no key', async () => {
  s = await renderPage({ page: 'bots', path: '/bots?drawer=new&initial=c-atlas', cols: 120, rows: 40, settleMs: 3000 });
  await press('Create Bot');
  const f = await until((x) => x.includes('The Bot is ready') || x.includes('Copy the key'));
  expect(f).toContain('The Bot is ready');
  expect(f).not.toContain('(skipped)');
  expect(f).not.toContain('Copy the key');
  expect(f).not.toContain('.hoody.bot');
  expect(s.trapsAt).toEqual([]);
}, 180_000);

test("opening a Bot's Details panel reads no browser global", async () => {
  s = await renderPage({ page: 'bots', path: '/bots?sel=c-atlas~a1b2c3d4e5f60718293a4b5c~chief', cols: 120, rows: 40, settleMs: 3000 });
  // The page opens at the Activity end (header out of view): Tab to the Details toggle, then Enter.
  const focused = (): string => { const r = s!.renderer as unknown as { root: never; stdin: never }; return focusedNode(semanticsOf({ root: r.root, stdin: r.stdin }))?.name ?? ''; };
  for (let i = 0; i < 80 && focused() !== 'Details'; i++) await s.keys.press('tab');
  expect(focused()).toBe('Details');
  await s.keys.press('return');
  await s.settle();
  await new Promise((r) => setTimeout(r, 500));
  await s.settle();
  expect(s.trapsAt).toEqual([]);
  expect(s.failures).toEqual([]);
}, 180_000);
