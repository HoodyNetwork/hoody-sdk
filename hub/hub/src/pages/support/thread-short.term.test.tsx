// A ticket's thread in a short pane: at 60x20 the pane was 13 rows, the ticket's head (a 3-line subject, its menu row)
// and the reply box (8 rows; 14 with "This may have gone through") were both pinned, so the messages had one row and
// the head, body and footer drew over each other. DetailPage now scrolls the head with the body when pinning both
// leaves the body under 4 rows, and caps the footer (it scrolls inside itself). The footer is the same Scroll at every
// size, so a reply being written survives a resize. Checked at 80x24, the smallest frame the shell draws (TooSmall.tsx).
import { afterEach, expect, test } from 'bun:test';
import { renderPage } from '../../../scripts/term/render';
import { layoutFaults } from '../../term/prim/layoutcheck';
import { focusedNode, semanticsOf } from '../../term/prim/semantics';

type S = Awaited<ReturnType<typeof renderPage>>;
let s: S | null = null;
afterEach(() => { s?.close(); s = null; });

const OPEN = '0000000000000000' + (0x6720a1b2 + 2).toString(16);
const path = `/support?sel=${OPEN}`;
const root = () => (s!.renderer as unknown as { root: never }).root;
const faultsIn = (cols: number, rows: number) =>
  layoutFaults(root(), { cols, rows }).filter((f) => /Thread|DetailPage/.test(f.path)).map((f) => `${f.kind} ${f.detail} ${f.path.slice(-80)}`);
const focused = () => { const r = s!.renderer as unknown as { root: never; stdin: never }; return focusedNode(semanticsOf({ root: r.root, stdin: r.stdin })); };

test('support thread at 80x24: head, messages and reply box do not draw over each other', async () => {
  s = await renderPage({ page: 'support', fx: null, cols: 80, rows: 24, path });
  await s.settle();
  expect(s.frame).toContain('Your reply');
  expect(faultsIn(80, 24)).toEqual([]);
});

test('a reply being written survives a resize to the smallest frame and back', async () => {
  s = await renderPage({ page: 'support', fx: null, cols: 120, rows: 40, path });
  await s.settle();
  for (let i = 0; i < 80 && focused()?.name !== 'Your reply'; i++) await s.keys.press('tab');
  expect(focused()?.name).toBe('Your reply');
  await s.keys.type('keep these words');
  expect(s.frame).toContain('keep these words');
  await s.resize(80, 24);
  await s.settle();
  expect(s.frame).toContain('keep these words');
  expect(faultsIn(80, 24)).toEqual([]);
  await s.resize(120, 40);
  await s.settle();
  expect(s.frame).toContain('keep these words');
});
