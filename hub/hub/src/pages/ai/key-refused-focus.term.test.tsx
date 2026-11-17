// AI › Models, Connect an account, API key refused: the key field has the focus afterwards, so the person retypes
// there. The field is disabled while the key is sent (KeyStep.tsx isDisabled={busy …}), which drops the focus
// (focus.ts dropDisabled); nothing gave it back, so the frame after a refusal depended on whether a commit with the
// field disabled happened before the answer (ai shot-connect-key-failed flipped between runs). focusOnError puts the
// focus back when the refusal's message appears, on the web and in the terminal.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { replay, shotSteps } from '../../../scripts/term/shot-replay';
import { focusedNode, semanticsOf } from '../../term/prim/semantics';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

const TYPE_KEY = ['s', 'k', '-', 'f', 'i', 'x', 't', 'u', 'r', 'e', '-', '1', 'Enter'];

test('80x24 then 120x40: a refused key leaves the focus in the key field, before and after a resize', async () => {
  s = await renderPage({ page: 'ai', fx: 'failed', path: '/ai/models?connect=google', cols: 80, rows: 24 });
  await s.settle();
  const r0 = (s as unknown as { renderer: { root: unknown; stdin?: unknown } }).renderer;
  const tree = () => semanticsOf({ root: r0.root, stdin: r0.stdin } as never) as never;
  expect(await replay(s, shotSteps({ click: 'role=textbox[name=/API key/]', keys: TYPE_KEY }), { tree, cols: 80, rows: 24 })).toBeNull();
  await s.settle();
  expect(s.frame).toContain('did not accept this key');
  const at = (): { role?: string; name?: string } | null => focusedNode(semanticsOf({ root: r0.root, stdin: r0.stdin } as never)) as never;
  expect(at()?.role).toBe('textbox');
  expect(at()?.name ?? '').toMatch(/API key/);
  await s.resize(120, 40);
  await s.settle();
  expect(at()?.role).toBe('textbox');
  expect(at()?.name ?? '').toMatch(/API key/);
}, 240_000);
