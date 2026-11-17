// Finding a note in the terminal list (useDataView owns search and the Computer filter). Typing in the table's Search
// keeps the notes whose title, section or computer matches; the Computer chip, reached by Tab from Search and opened
// with Enter, narrows the list to the one computer picked (the chip then names it).
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { act, focusedNode, queryAllByRole, semanticsOf, type Role, type SemNode } from '../../term/prim/semantics';
import kit from '../../kit/strings.en.json';
import strings from './strings.en.json';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

const tree = (): SemNode[] => {
  const r = s!.renderer as unknown as { root: never; stdin: never };
  return semanticsOf({ root: r.root, stdin: r.stdin });
};
const all = (role: Role, name: string | RegExp): SemNode[] => queryAllByRole(tree(), role, { name });
const focused = (): { role: string; name: string } | null => {
  const n = focusedNode(tree());
  return n ? { role: n.role, name: n.name } : null;
};
function clean(p: PageSession): void {
  expect(p.failures).toEqual([]);
  expect(p.trapsAt).toEqual([]);
}

test('Search keeps only the notes that match', async () => {
  s = await renderPage({ page: 'notes', cols: 140, rows: 50 });
  const before = await s.settle();
  expect(before).toContain('Weekly plan');
  expect(before).toContain('Staging release notes');
  const search = all('searchbox', kit['search.label']);
  expect(search).toHaveLength(1);
  // Focus first and let the field take it: keys sent in the same turn as the focus are lost (the field shows its
  // placeholder while the footer already says "Typing"). Then type as a person does.
  act(search[0]!, 'focus');
  await s.settle();
  await s.keys.type('deploy');
  expect(all('searchbox', kit['search.label'])[0]?.value).toBe('deploy');
  let frame = await s.settle();
  for (const end = performance.now() + 5_000; frame.includes('Weekly plan') && performance.now() < end;) {
    await new Promise((r) => setTimeout(r, 50));
    frame = await s.settle();
  }
  expect(frame).toContain('Deploy checklist');
  expect(frame).not.toContain('Weekly plan');
  expect(frame).not.toContain('Staging release notes');
  clean(s);
}, 180_000);

test('the Computer filter narrows the list to the computer picked', async () => {
  s = await renderPage({ page: 'notes', cols: 140, rows: 50 });
  const before = await s.settle();
  expect(before).toContain('Weekly plan');
  // The chip sits right after Search in the table's toolbar.
  act(all('searchbox', kit['search.label'])[0]!, 'focus');
  await s.settle();
  await s.keys.press('tab');
  expect(focused()).toEqual({ role: 'button', name: strings['filter.computer'] });
  await s.keys.press('enter');
  const option = all('menuitemradio', 'borealis');
  expect(option).toHaveLength(1);
  act(option[0]!, 'press');
  const frame = await s.settle();
  expect(frame).toContain('Staging release notes');
  expect(frame).toContain('Customer feedback');
  expect(frame).not.toContain('Weekly plan');
  expect(frame).not.toContain('Deploy checklist');
  // The chip now names the computer.
  expect(all('button', new RegExp(`^${strings['filter.computer']}\\b.*borealis`))).toHaveLength(1);
  clean(s);
}, 180_000);
