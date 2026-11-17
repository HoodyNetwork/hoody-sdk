// The Toaster's place among the lifted ones: the one that covers no control of the
// open drawer (static text such as numbered steps may be covered), else the web's place. The case: the model chooser's
// sign-in step at 120x40, where the web's place covered "[← Back to models]", the step's heading and both radios.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { closeToast, toastQueue } from './Toast.store';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; for (const x of [...toastQueue().visibleToasts]) closeToast(x.key); });

test('sign-in step at 120x40: after Open the toast leaves Back, the heading and both radios whole', async () => {
  s = await renderPage({ page: 'ai', path: '/ai/models?pick=helper', cols: 120, rows: 40 });
  await s.settle();
  const sem = await import('../../term/prim/semantics');
  const tree = () => { const r = s!.renderer as unknown as { root: never; stdin: never }; return sem.semanticsOf({ root: r.root, stdin: r.stdin }); };
  const press = async (role: 'button' | 'link' | 'menuitemradio' | 'option', name: string | RegExp) => { sem.act(sem.getByRole(tree(), role, { name }), 'press'); await new Promise((r) => setTimeout(r, 150)); return s!.settle(); };
  // The chooser opens on the ready models: Show: All lists the providers that need setup, and such a model's row opens
  // its provider's setup step.
  await press('button', 'Show Ready');
  await press('menuitemradio', 'All');
  const before = await press('option', 'OpenRouter Auto');
  const lines = before.split('\n');
  // What must stay readable: each such line of the drawer, as drawn before the toast (right-trimmed).
  const back = lines.find((l) => l.includes('[← Back to models]'));
  const heading = lines.filter((l) => l.includes('Set up OpenRouter')).at(-1);
  const radios = lines.filter((l) => /\((•| )\) \S/.test(l));
  expect(back).toBeDefined();
  expect(heading).toBeDefined();
  expect(radios.length).toBe(2);
  const open = sem.queryAllByRole(tree(), 'link').concat(sem.queryAllByRole(tree(), 'button')).find((n) => /^Open OpenRouter/.test(n.name))!;
  sem.act(open, 'press');
  await new Promise((r) => setTimeout(r, 300));
  await s.releaseHeld();
  const after = await s.settle();
  expect(after).toContain('Open this address in your');
  const afterLines = after.split('\n').map((l) => l.trimEnd());
  for (const want of [back!, heading!, ...radios]) expect(afterLines, want.trim()).toContain(want.trimEnd());
}, 240_000);

// The stack's "F6" sat on a row of its own above the stack, over page content (Referrals at 120x40, it
// replaced the links card's right border). It is now in the top toast's frame: nothing outside the box is drawn over.
test('Referrals at 120x40: the F6 hint is in the toast frame, the row above the stack keeps the page', async () => {
  s = await renderPage({ page: 'referrals', cols: 120, rows: 40 });
  await s.settle();
  const sem = await import('../../term/prim/semantics');
  const focused = () => { const r = s!.renderer as unknown as { root: never; stdin: never }; return sem.focusedNode(sem.semanticsOf({ root: r.root, stdin: r.stdin })); };
  for (let i = 0; i < 160 && !/^Program rules$/.test(focused()?.name ?? ''); i++) await s.keys.press('tab');
  expect(focused()?.name).toBe('Program rules');
  const before = (await s.settle()).split('\n');
  await s.keys.press('enter');
  const after = (await s.settle()).split('\n');
  expect(after.join('\n')).toContain('Open this address in your');
  const rows = after.map((l, i) => (l.includes('F6') ? i : -1)).filter((i) => i >= 0);
  expect(rows.length).toBe(1);
  const top = rows[0]!;
  // The hint sits between the frame's corners, and the row above the frame is the page's as before.
  expect(after[top]).toMatch(/┌─*\s*F6\s*─*┐/);
  expect(after[top - 1]).toBe(before[top - 1]);
}, 240_000);
