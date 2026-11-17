// The chat menu's "Export transcript" in the terminal: the web saves a file through an object URL and
// `document` (exportMd.ts downloadText), a strict global here, so the press trapped (TERM_GLOBAL). The terminal copies
// the chat's Markdown where the host takes copies and says what happened in a toast either way.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { act, queryAllByRole, semanticsOf, type Role } from '../../term/prim/semantics';
import { activeStrictGlobals } from '../../term/env/strict-globals';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });
const REALM = 'f1f1f1f1f1f1f1f1f1f1f1f1';

async function until(ok: (f: string) => boolean, ms = 20_000): Promise<string> {
  const end = performance.now() + ms;
  while (!ok(s!.frame) && performance.now() < end) { await new Promise((r) => setTimeout(r, 250)); await s!.settle(); }
  return s!.frame;
}
async function press(role: Role, name: string | RegExp): Promise<void> {
  const r = s!.renderer as unknown as { root: never; stdin: never };
  let n;
  for (let i = 0; i < 8 && !n; i++) {
    [n] = queryAllByRole(semanticsOf({ root: r.root, stdin: r.stdin }), role, { name });
    if (!n) await s!.settle();
  }
  expect(n, `${role} "${String(name)}" not found:\n${s!.frame}`).toBeDefined();
  act(n!, 'press');
  await s!.settle();
}

test('Export transcript reads no browser global and says what it did', async () => {
  activeStrictGlobals()?.clear();
  s = await renderPage({ page: 'ai', path: `/ai/c/s-old?computer=atlas.00a1&realm=${REALM}`, cols: 120, rows: 40, settleMs: 3000 });
  await until((f) => f.includes('Plan the backup job'));
  await press('button', 'Chat actions');
  await press('menuitem', /^Export transcript/);
  const f = await until((x) => x.includes('Chat copied as Markdown') || x.includes('Chat not copied'));
  expect(s.trapsAt).toEqual([]);
  expect(s.failures).toEqual([]);
  expect(s.errors.filter((e) => e.includes('TERM_GLOBAL'))).toEqual([]);
  const traps = (activeStrictGlobals()?.ledger() ?? []).filter((r) => /src\/pages\/ai\//.test(r.stack)).map((r) => r.name);
  expect(traps).toEqual([]);
  expect(f.includes('Chat copied as Markdown') || f.includes('Chat not copied')).toBe(true);
  expect(f).not.toContain('could not be drawn');
}, 180_000);
