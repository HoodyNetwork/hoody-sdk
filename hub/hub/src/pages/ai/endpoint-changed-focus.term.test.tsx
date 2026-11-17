// AI › Models, Connect your own endpoint, key sent but the endpoint changed since the step opened: the key field has the
// focus afterwards, as it had when the person pressed Enter. The send locks the field (KeyStep.tsx isDisabled={busy …}),
// which drops the focus (focus.ts dropDisabled); a 'changed' answer is no field error, so focusOnError never gave it
// back and ai shot-connect-endpoint-key-changed lost the focus. Secret.term.tsx gives it back at the unlock when the
// field held it at the lock and nothing holds it now.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { replay, shotSteps } from '../../../scripts/term/shot-replay';
import { focusedNode, semanticsOf } from '../../term/prim/semantics';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

for (const [cols, rows] of [[80, 24], [120, 40]] as const) {
  test(`${cols}x${rows}: a changed endpoint leaves the focus in the key field`, async () => {
    s = await renderPage({ page: 'ai', fx: 'endpointChanged', path: '/ai/models?connect=my-endpoint', cols, rows });
    await s.settle();
    const r0 = (s as unknown as { renderer: { root: unknown; stdin?: unknown } }).renderer;
    const tree = () => semanticsOf({ root: r0.root, stdin: r0.stdin } as never) as never;
    const steps = shotSteps({ act: [{ waitFor: 'role=button[name="Check and save"]' }, { fill: 'role=textbox[name=/API key/]', text: 'sk-fixture-1' }, { press: 'Enter' }, { waitFor: 'text=changed since this step opened' }] });
    expect(await replay(s, steps, { tree, cols, rows })).toBeNull();
    await s.settle();
    const at = (): { role?: string; name?: string } | null => focusedNode(semanticsOf({ root: r0.root, stdin: r0.stdin } as never)) as never;
    expect(at()?.role).toBe('textbox');
    expect(at()?.name ?? '').toMatch(/API key/);
  }, 240_000);
}
