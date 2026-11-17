// Open in AI in the terminal dock: the header holds the action beside Recent, New and Close. Before a message it is
// there, disabled; once the conversation has settled it opens the same conversation on the AI page and the dock closes.
// The thread says who wrote what.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../scripts/term/render';
import { focusedNode, getByRole, queryByRole, semanticsOf } from '../term/prim/semantics';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

const tree = (p: PageSession) => { const r = p.renderer as unknown as { root: never; stdin: never }; return semanticsOf({ root: r.root, stdin: r.stdin }); };
const focused = (p: PageSession): string => focusedNode(tree(p))?.name ?? '';
async function tabTo(p: PageSession, name: RegExp): Promise<void> {
  for (let i = 0; i < 160 && !name.test(focused(p)); i++) await p.keys.press('tab');
  expect(focused(p) || '(nothing focused)').toMatch(name);
}

test('the dock header offers Open in AI; a settled conversation opens on the AI page and the dock closes', async () => {
  s = await renderPage({ page: 'home', cols: 140, rows: 44 });
  await s.settle();
  await tabTo(s, /^Ask$/);
  await s.keys.press('enter');
  let f = await s.settle();
  expect(f).toContain('Open in AI');
  expect(getByRole(tree(s), 'button', { name: 'Open in AI' }).states.disabled).toBe(true);

  await tabTo(s, /^Message to your agent$/);
  await s.keys.type('Build me a dashboard');
  await s.keys.press('enter');
  for (let i = 0; i < 80 && getByRole(tree(s), 'button', { name: 'Open in AI' }).states.disabled; i++) { await new Promise((r) => setTimeout(r, 250)); await s.settle(); }
  for (let i = 0; i < 80 && getByRole(tree(s), 'button', { name: 'New conversation' }).states.disabled; i++) { await new Promise((r) => setTimeout(r, 250)); await s.settle(); }
  f = await s.settle();
  expect(f).toContain('You');
  expect(f).toContain('✦ Agent');
  expect(f).toContain('Build me a dashboard');

  await tabTo(s, /^Open in AI$/);
  await s.keys.press('enter');
  for (let i = 0; i < 40 && queryByRole(tree(s), 'button', { name: 'Close Agent' }); i++) { await new Promise((r) => setTimeout(r, 250)); await s.settle(); }
  f = await s.settle();
  expect(queryByRole(tree(s), 'button', { name: 'Close Agent' })).toBeNull();
  expect(f).toContain('Build me a dashboard');
  expect(s.errors.filter((e) => e.includes('TERM_GLOBAL'))).toEqual([]);
}, 240_000);
