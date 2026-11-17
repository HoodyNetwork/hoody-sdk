// The Desktop tab in the terminal: the frame's place is a hand-off (parts/DesktopFrame.term.tsx), never a frame that
// waits for a load event the terminal cannot give ("Loading…" for ever). The hand-off names the Computers page (its
// address is the web Hub's Computers page, not the desktop); the toolbar stays, and the desktop's own address stays one
// control: the toolbar's "Open outside the Hub", which opens it whole.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { act, queryAllByRole, semanticsOf, type Role } from '../../term/prim/semantics';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

function all(role: Role, name: string | RegExp) {
  const r = s!.renderer as unknown as { root: never; stdin: never };
  return queryAllByRole(semanticsOf({ root: r.root, stdin: r.stdin }), role, { name });
}

for (const [cols, rows] of [[120, 40], [80, 24]] as const) {
  test(`the Desktop tab is a hand-off, not a frame that never loads (${cols}x${rows})`, async () => {
    const opened: string[] = [];
    s = await renderPage({ page: 'computers', path: '/computers?sel=atlas.00a1&tab=desktop', cols, rows, openExternal: (u) => { opened.push(u); } });
    const frame = await s.settle();
    expect(frame).toContain('Reload desktop');
    expect(frame).not.toContain('Loading');
    expect(frame).not.toContain('▁▁▁');
    expect(frame).not.toContain('Leave desktop');
    expect(frame).toContain('A desktop is a live picture');
    expect(frame).toContain('Open the Computers page on the web:');
    expect(all('group', 'Continue on the web').length).toBe(1);
    // One link to the desktop's own address: the toolbar's (the body adds no second one). It opens it whole.
    const links = all('link', 'Open outside the Hub');
    expect(links.length).toBe(1);
    act(links[0]!, 'press');
    await s.settle();
    expect(opened.length).toBe(1);
    expect(opened[0]).toMatch(/^https:\/\/[0-9a-f]{24}-c0a7150000000000000000a1-/);
  }, 180_000);
}
