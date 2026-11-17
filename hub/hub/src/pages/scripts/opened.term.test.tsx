// What the Scripts page hands outside the Hub in the terminal: "Test it in a terminal" (RunIt) opens a new temporary
// terminal of the script's computer through the host's browser (openOutside -> TermHostServices.openExternal), WHOLE.
// renderPage's `openExternal` records it as the scenario `opened` expectation does. The web half is not covered here
// (guarded by the no-window-open rule and openOutside's own cases).
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { act, queryAllByRole, semanticsOf } from '../../term/prim/semantics';

const PROJECT = '6a0000000000000000000001';
const ATLAS = 'c0a7150000000000000000a1';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

test('Test it in a terminal opens terminal-0 of the script\'s computer with ?ephemeral=true, whole', async () => {
  const opened: string[] = [];
  s = await renderPage({ page: 'scripts', path: '/scripts?sel=atlas.00a1~weather.ts', cols: 140, rows: 100, openExternal: (u) => { opened.push(u); } });
  await s.settle();
  const r = s.renderer as unknown as { root: never; stdin: never };
  const [button] = queryAllByRole(semanticsOf({ root: r.root, stdin: r.stdin }), 'button', { name: 'Test it in a terminal' });
  expect(button).toBeDefined();
  act(button!, 'press');
  await s.settle();
  expect(opened).toEqual([`https://${PROJECT}-${ATLAS}-terminal-0.n12.fixture.invalid/?ephemeral=true`]);
  expect(s.frame).not.toContain(ATLAS);
}, 180_000);
