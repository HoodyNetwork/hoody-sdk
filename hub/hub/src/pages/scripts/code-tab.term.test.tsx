// Scripts, the Code tab in the terminal:
//   - The toolbar offers Copy code and no Download: the download saves through an object URL and `document` (core
//     save()), a strict global in the terminal, so the press trapped; a terminal has no file save.
//   - A person who can write sees the code in a field (CodeEditor.term), and a save whose check fails shows the check's
//     problem under it (the editable editor was a one-line hand-off that dropped `problems`, so the failed check said
//     nothing).
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { act, focusedNode, queryAllByRole, semanticsOf, type Role } from '../../term/prim/semantics';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });
const CODE = '/scripts?sel=atlas.00a1~weather.ts&tab=code';

const nodes = (role: Role, name: string | RegExp) => {
  const r = s!.renderer as unknown as { root: never; stdin: never };
  return queryAllByRole(semanticsOf({ root: r.root, stdin: r.stdin }), role, { name });
};
async function until(ok: (f: string) => boolean, ms = 20_000): Promise<string> {
  const end = performance.now() + ms;
  while (!ok(s!.frame) && performance.now() < end) { await new Promise((r) => setTimeout(r, 250)); await s!.settle(); }
  return s!.frame;
}
function clean(): void {
  expect(s!.trapsAt).toEqual([]);
  expect(s!.failures).toEqual([]);
  expect(s!.frame).not.toContain('could not be drawn');
}

test('the Code tab toolbar offers Copy code and no Download', async () => {
  s = await renderPage({ page: 'scripts', path: CODE, cols: 120, rows: 40, settleMs: 3000 });
  await until(() => nodes('button', 'Copy code').length > 0);
  expect(nodes('button', 'Copy code').length).toBeGreaterThan(0);
  expect(nodes('button', 'Download')).toEqual([]);
  clean();
}, 180_000);

test('a writer edits the code in the terminal; a save whose check fails shows the problem', async () => {
  s = await renderPage({ page: 'scripts', fx: 'invalid', path: CODE, cols: 120, rows: 40, settleMs: 3000 });
  await until(() => nodes('textbox', 'Script code').length > 0);
  const [field] = nodes('textbox', 'Script code');
  expect(field, s.frame).toBeDefined();
  expect(field!.states.readonly ?? false).toBe(false);
  // Ctrl+S saves only while the field has the keyboard (CodeEditor.term): focus it first and prove it holds the focus
  // before and after the typing. (weather.ts has LF line ends and space indents, so the terminal edits it: a tab or
  // CR LF would make it read-only, see CodeEditor.term.)
  const focusedName = (): string => { const r = s!.renderer as unknown as { root: never; stdin: never }; return focusedNode(semanticsOf({ root: r.root, stdin: r.stdin }))?.name ?? '(nothing focused)'; };
  act(field!, 'focus');
  await s.settle();
  expect(focusedName()).toBe('Script code');
  act(field!, 'type', 'x');
  await s.settle();
  expect(focusedName()).toBe('Script code');
  await s.keys.press('s', { ctrl: true });
  const f = await until((x) => x.includes('Unexpected token'));
  expect(f).toContain('Unexpected token');
  clean();
}, 180_000);
