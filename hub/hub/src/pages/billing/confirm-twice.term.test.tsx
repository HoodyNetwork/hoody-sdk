// Two Enters in ONE terminal read (a key held down, a paste, a slow host: "\r\r" in a single stdin chunk) reach the
// drawer's Confirm before React draws again. The terminal runs the fixture checkout hook (useCheckoutFx): its confirm
// moves stateRef at once (data.ts, the latch beside dispatch 'confirmed'), so the second Enter finds the drawer posting
// and sends nothing. Without it both Enters passed confirmGate on the last render's review and the fixture sent twice
// (two Enters can arrive together in one terminal read).
// Driven by the keyboard and the focused node only, never by where things are drawn: the consent box may sit below the
// drawer's fold (it does in some assemblies), and Tab reaches it wherever it is.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { semanticsOf, type SemNode } from '../../term/prim/semantics';
import { queryClient } from '../../core';

let s: PageSession | null = null;
let unsubscribe: (() => void) | null = null;
afterEach(() => { unsubscribe?.(); unsubscribe = null; s?.close(); s = null; });

function focused(p: PageSession): SemNode | null {
  const r = p.renderer as unknown as { root: never; stdin?: never };
  const find = (ns: readonly SemNode[]): SemNode | null => {
    for (const n of ns) { if (n.states?.focused) return n; const c = find(n.children ?? []); if (c) return c; }
    return null;
  };
  return find(semanticsOf({ root: r.root, stdin: r.stdin }));
}

/** Tabs until the focused node is `role` (and its name matches), at most 60 presses. */
async function tabTo(p: PageSession, role: string, name?: RegExp): Promise<SemNode> {
  for (let i = 0; i < 60; i++) {
    const f = focused(p);
    if (f && f.role === role && (!name || name.test(f.name))) return f;
    await p.keys.press('tab');
  }
  throw new Error(`no ${role} ${name ?? ''} reached by Tab (last: ${JSON.stringify(focused(p)?.role)} ${JSON.stringify(focused(p)?.name)})`);
}

for (const [fx, kind, path] of [
  ['send-unknown', 'buy', '/billing?checkout=buy&plan=fam-plus'],
  ['send-unknown', 'reserve', '/billing?checkout=reserve&item=mkt_sin_m&days=30'],
] as const) {
  test(`${kind}: "\\r\\r" in one read on Confirm sends once`, async () => {
    s = await renderPage({ page: 'billing', path, fx, cols: 120, rows: 40 });
    const p = s;
    await p.settle();
    // Consent first (Space on the box), then the focus on Confirm.
    await tabTo(p, 'checkbox');
    await p.keys.press('space');
    expect(focused(p)?.states.checked).toBe(true);
    await tabTo(p, 'button', /^Confirm/);
    // Every send of the fixture source is one mutation in the app's query client.
    let sends = 0;
    unsubscribe = queryClient.getMutationCache().subscribe((e) => { if (e.type === 'added') sends++; });
    // One stdin chunk, as the engine's mock keyboard delivers a key (renderer.stdin 'data'), holding two Enters.
    (p.renderer as unknown as { stdin: { emit(ev: string, b: Buffer): boolean } }).stdin.emit('data', Buffer.from('\r\r'));
    const frame = (await p.settle()).replace(/\s+/g, ' ');
    expect(sends).toBe(1);
    // The one send settled the drawer on its fixture answer (unknown), never "not sent" (strings notSent).
    expect(frame).not.toContain('nothing was charged');
  }, 240_000);
}
