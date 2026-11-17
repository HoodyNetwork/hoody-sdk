// AI › Models, "Sign in with ChatGPT" (6 ai shots never settled). The connect flow re-renders while it waits, and
// its table's rows array is new on each render; the table took each new array for a new row set, cleared its measured
// widths and made every cell measure again: a 0 ms timer re-armed for ever (TableClip `check`), so the page never
// settled. The row set is now its row ids (DataTable.term.tsx), so the page settles while the sign-in waits.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { replay, shotSteps } from '../../../scripts/term/shot-replay';
import { semanticsOf } from '../../term/prim/semantics';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

test('80x24: Sign in with ChatGPT, then the page settles (no measure timer re-armed for ever)', async () => {
  s = await renderPage({ page: 'ai', path: '/ai/models?connect=openai', cols: 80, rows: 24 });
  await s.settle();
  const r0 = (s as unknown as { renderer: { root: unknown; stdin?: unknown } }).renderer;
  const tree = () => semanticsOf({ root: r0.root, stdin: r0.stdin } as never) as never;
  expect(await replay(s, shotSteps({ click: 'Sign in with ChatGPT' }), { tree, cols: 80, rows: 24 })).toBeNull();
  await s.settle();
  expect(s.pendingText).not.toContain('TableClip');
}, 240_000);

// The device sign-in polls its job every 3 s until it ends; a fixture job never ends. Fixtures at instant latency
// scaled that wait to 3 ms, a short timer re-armed for ever (`sleep`, providers/env.ts), so a later settle never came.
// The poll now keeps its real step in fixtures (view.tsx); only the read-back waits are shortened.
test('80x24: Sign in with ChatGPT, a later settle still settles (the job poll is not a short timer)', async () => {
  s = await renderPage({ page: 'ai', path: '/ai/models?connect=openai', cols: 80, rows: 24 });
  await s.settle();
  const r0 = (s as unknown as { renderer: { root: unknown; stdin?: unknown } }).renderer;
  const tree = () => semanticsOf({ root: r0.root, stdin: r0.stdin } as never) as never;
  expect(await replay(s, shotSteps({ click: 'Sign in with ChatGPT' }), { tree, cols: 80, rows: 24 })).toBeNull();
  await s.settle();
  await s.settle();
  expect(s.pendingText).not.toContain('sleep');
  expect(s.pendingText).not.toContain('providers/env');
  expect(s.frame).toContain('Waiting for you to finish signing in');
}, 240_000);
