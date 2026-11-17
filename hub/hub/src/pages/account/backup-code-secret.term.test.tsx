// Account > Turn off two-step sign-in, and Stop asking for a code, in the terminal: the "6-digit code or backup code"
// field is secret entry, as the drawer's password field is (term/docs/forms.md, secrets rules 2 and 3): a typed code is
// masked (one bullet per character) and the semantics tree (agent export, snapshots, diagnostics) says only that
// something is typed. A plain-text field (kit/forms/fields.term.tsx) would let the frame draw the code and
// the tree carry it as the textbox's value (`="zq7x-41mv"`). Nothing is sent: the code is typed, never submitted.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { focusedNode, semanticsOf, semJson, semText } from '../../term/prim/semantics';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

const LABEL = '6-digit code or backup code';
// Made up (not a fixture code): any text, nothing checks it before a send.
const CODE = 'zq7x-41mv';
const tree = () => { const r = s!.renderer as unknown as { root: never; stdin: never }; return semanticsOf({ root: r.root, stdin: r.stdin }); };

const CASES = [
  { sheet: 'off', title: 'Turn off two-step sign-in?', cols: 120, rows: 40 },
  { sheet: 'off', title: 'Turn off two-step sign-in?', cols: 80, rows: 24 },
  { sheet: 'gate-off', title: 'Stop asking for a code?', cols: 120, rows: 40 },
] as const;

for (const c of CASES) test(`?sheet=${c.sheet} at ${c.cols}x${c.rows}: a typed backup code is masked and never in the tree`, async () => {
  s = await renderPage({ page: 'account', cols: c.cols, rows: c.rows, path: `/account?sheet=${c.sheet}` });
  await s.settle();
  expect(s.frame).toContain(c.title);
  for (let i = 0; i < 20 && focusedNode(tree())?.name !== LABEL; i++) await s.keys.press('tab');
  expect(focusedNode(tree())?.name).toBe(LABEL);
  await s.keys.type(CODE);
  // Positive controls: every character reached the field (one bullet each), and the tree holds the field, filled.
  expect(s.frame).toContain('•'.repeat(CODE.length));
  const t = tree();
  const text = semText(t);
  expect(text).toContain('Current password');
  expect(text).toMatch(new RegExp(`textbox "${LABEL}" .*=<secret>`));
  // The code itself: not drawn, and in neither form of the tree.
  expect(s.frame).not.toContain(CODE);
  expect(text).not.toContain(CODE);
  expect(JSON.stringify(semJson(t))).not.toContain(CODE);
  expect(s.failures).toEqual([]);
}, 240_000);
