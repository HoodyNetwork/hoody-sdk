// Shared access in a terminal: a share this page cannot manage says why in its row and still shows Stop sharing on that
// one line. A whole reason must never wrap above the row's line (only its tail drawn) or push Stop sharing out of the
// cell, so the row's one action was gone. ShareNote.term.tsx draws the reason's short words ("Not managed here.")
// before Stop sharing, and keeps the whole sentence as the row's name.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { semanticsOf, type SemNode } from '../../term/prim/semantics';
import strings from './strings.en.json';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

const STOP = `[${strings['share.stop']}]`;
const SHORT = strings['share.notManagedShort'];
const FULL = strings['share.notManaged'];

for (const [cols, rows] of [[120, 40], [80, 24]] as const) {
  test(`${cols}x${rows}: each unmanaged share's line says Not managed here, then Stop sharing; its row is named with the whole reason`, async () => {
    s = await renderPage({ page: 'keys', fx: 'sharedManaged', path: '/keys/shared', cols, rows });
    const frame = await s.settle();
    expect(s.failures).toEqual([]);
    const lines = frame.split('\n').filter((l) => l.includes(SHORT));
    // sharedManaged holds two shares with settings the page does not manage.
    expect(lines.length).toBe(2);
    for (const l of lines) expect(l.indexOf(STOP)).toBeGreaterThan(l.indexOf(SHORT));
    // No line carries the sentence's tail alone (the wrapped sentence's last line).
    expect(frame.split('\n').filter((l) => l.includes("doesn't manage"))).toEqual([]);
    // The whole reason stays reachable: each of those rows is named with the sentence (once), the short words not added.
    const named: string[] = [];
    const walk = (n: SemNode): void => { if (n.role === 'row' && (n.name ?? '').includes(FULL)) named.push(n.name ?? ''); n.children?.forEach(walk); };
    semanticsOf(s!.renderer as never).forEach(walk);
    expect(named.length).toBe(2);
    for (const r of named) expect(r).not.toContain(SHORT);
  }, 120_000);
}
