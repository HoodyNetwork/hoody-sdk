// The Run tab says what a run ended as on the screen the person is looking at. The status row is under the output
// panel; the panel kept the web's 240px (10 blank rows here) and the status was below the pane: after Enter a refused
// command showed "Output shows here" and nothing else, 16 wheel notches from its "didn't go through" at 80x24. The
// panel is now as tall as its content (scripts/term/css-translate/term-decls.ts) and the status row is brought into
// view when the answer arrives (parts/Run.tsx). Focus stays in the Command field.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { rendererHitAt, replay } from '../../../scripts/term/shot-replay';
import { focusedNode, semanticsOf } from '../../term/prim/semantics';
import strings from './strings.en.json';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

const CASES = [
  // A refused command (422): the failure banner.
  { fx: 'runFailed', keys: ['l', 's'], says: strings['run.failed'] },
  // A command that ran and failed: its exit code.
  { fx: 'runNonZero', keys: ['n', 'o', 'p', 'e'], says: strings['run.exit.code'].replace('{{code}}', '127') },
  // No answer came back: it may have run, and the row under the output offers the check.
  { fx: 'pendingOps', keys: ['l', 's'], says: strings['held.check'] },
] as const;

for (const c of CASES) {
  for (const [cols, rows] of [[80, 24], [120, 40]] as const) {
    test(`${c.fx} at ${cols}x${rows}: what the run ended as is on screen after Enter, focus still in the field`, async () => {
      s = await renderPage({ page: 'computers', fx: c.fx, path: '/computers?sel=atlas.00a1&tab=run', cols, rows });
      await s.settle();
      const r = s.renderer as unknown as { root: never; stdin: { emit(e: 'data', b: Buffer): unknown } };
      const tree = () => semanticsOf({ root: r.root, stdin: r.stdin as never });
      const wheel = async (x: number, y: number, dir: 'up' | 'down') => {
        r.stdin.emit('data', Buffer.from(`\x1b[<${dir === 'up' ? 64 : 65};${x + 1};${y + 1}M`));
        await s!.settle();
      };
      expect(s.frame).not.toContain(c.says);
      const steps = [{ click: 'role=textbox[name="Command"]' }, ...c.keys.map((k) => ({ press: k })), { press: 'Enter' }];
      expect(await replay(s as never, steps as never, { tree: tree as never, cols, rows, wheel, hitAt: rendererHitAt(s.renderer)! })).toBe(null);
      const end = performance.now() + 20_000;
      while (!s.frame.includes(c.says) && performance.now() < end) { await new Promise((res) => setTimeout(res, 200)); await s.settle(); }
      // On the screen as it is: nobody scrolled after Enter (the replay's own wheel only brings the field to the click).
      expect(s.frame, s.frame).toContain(c.says);
      // The field the person typed in is still drawn (its own line and the hint under it: the status came into view
      // without the command going out of it) and still has the focus.
      expect(s.frame, s.frame).toContain(`┃ ${c.keys.join('')}`);
      expect(s.frame, s.frame).toContain(strings['run.hint']);
      const f = focusedNode(tree());
      expect(f?.role).toBe('textbox');
      expect(f?.name).toBe(strings['run.label']);
      expect(s.failures).toEqual([]);
    }, 180_000);
  }
}
