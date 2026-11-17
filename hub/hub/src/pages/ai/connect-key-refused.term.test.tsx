// A key send that does not go through, as a person sees it. The send disables the key field (busy), and a focused field
// that turns disabled gives its focus up (prim/focus.ts dropDisabled). After a refused key the field takes the focus
// back (SecretInput focusOnError): focused, so no faint "____" fill. After an endpoint that changed there is no field
// error, but the field held the focus when the send locked it, so it takes it back at the unlock (Secret.term.tsx,
// key-field-focus-restore-1): focused too, no fill. The fixture answers after a short send time
// (fixtures.ts SEND_MS) as the network does: an answer quicker than the busy render never disabled the field at all,
// and the shot frames flipped with machine load.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { replay, rendererHitAt, shotSteps } from '../../../scripts/term/shot-replay';
import { focusedNode, semanticsOf } from '../../term/prim/semantics';

const TYPE_KEY = ['s', 'k', '-', 'f', 'i', 'x', 't', 'u', 'r', 'e', '-', '1', 'Enter'];
const KEY_FIELD = 'role=textbox[name=/API key/]';
// The field gutter, then its fill (the gutter is heavy while the field shows an error).
const FILL = /[┃│] _{6,}/;

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

const focused = () => {
  const r = s!.renderer as unknown as { root: unknown; stdin?: unknown };
  return focusedNode(semanticsOf({ root: r.root, stdin: r.stdin } as never) as never);
};

async function sent(fx: string, path: string): Promise<string> {
  s = await renderPage({ page: 'ai', fx, path, cols: 120, rows: 40 });
  await s.settle();
  const r0 = s.renderer as unknown as { root: unknown; stdin?: unknown };
  const hitAt = rendererHitAt(s.renderer);
  const why = await replay(s as never, shotSteps({ click: KEY_FIELD, keys: TYPE_KEY }), {
    tree: () => semanticsOf({ root: r0.root, stdin: r0.stdin } as never) as never, cols: 120, rows: 40, wheel: async () => {}, ...(hitAt ? { hitAt } : {}),
  } as never);
  expect(why).toBeNull();
  return s.settle();
}

test('a refused key: the emptied key field holds the focus again, so it draws no fill and shows nothing of the key', async () => {
  const f = await sent('failed', '/ai/models?connect=google');
  expect(f).toContain('did not accept this key');
  const n = focused();
  expect(n?.role).toBe('textbox');
  expect(String(n?.name)).toMatch(/API key/);
  expect(f).not.toMatch(FILL);
  expect(f).not.toContain('sk-fixture-1');
}, 180_000);

test('an endpoint that changed during the send: the emptied key field takes the focus back and draws no fill', async () => {
  const f = await sent('endpointChanged', '/ai/models?connect=my-endpoint');
  expect(f).toContain('changed since this step opened');
  expect(f).not.toMatch(FILL);
  expect(focused()?.role).toBe('textbox');
  expect(focused()?.name ?? '').toMatch(/API key/);
  expect(f).not.toContain('sk-fixture-1');
}, 180_000);
