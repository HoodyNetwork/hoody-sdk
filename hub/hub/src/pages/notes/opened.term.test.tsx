// What the Notes page hands outside the Hub in the terminal: a row's "Open note" (openNote) opens that note's own address
// on its computer's Notes through the host's browser (openOutside -> TermHostServices.openExternal), whole.
// renderPage's `openExternal` records it as the scenario `opened` expectation does. The web half is not covered here
// (guarded by the no-window-open rule and openOutside's own cases).
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { act, queryAllByRole, semanticsOf, type Role } from '../../term/prim/semantics';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

function all(role: Role, name: string | RegExp) {
  const r = s!.renderer as unknown as { root: never; stdin: never };
  return queryAllByRole(semanticsOf({ root: r.root, stdin: r.stdin }), role, { name });
}

test('row menu: Open note opens the note\'s own address whole', async () => {
  const opened: string[] = [];
  s = await renderPage({ page: 'notes', path: '/notes', cols: 140, rows: 60, openExternal: (u) => { opened.push(u); } });
  await s.settle();
  act(all('button', 'Row actions')[0]!, 'press');
  await s.settle();
  const [item] = all('menuitem' as Role, 'Open note');
  expect(item).toBeDefined();
  act(item!, 'press');
  await s.settle();
  expect(opened).toEqual(['https://6a0000000000000000000001-c0a7150000000000000000a1-notes-1.n12.fixture.invalid/notebook/a1b2c3d4e5f6a7b8c9d0e1f2/a1b2c3d4e5f6a7b8c9d0e1f1']);
}, 180_000);
