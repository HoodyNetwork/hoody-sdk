// The Agent dock takes the keyboard when it opens, at every width: Alt+J,
// then letters, and the letters are in the composer. Below 100 columns the dock is a full-screen sheet drawn by the
// overlay layer a turn after the open, so the one-shot focus found nothing and the letters went nowhere.
// A first-use suggestion then leaves the keyboard in the composer too (ask/AskPanel.tsx `fill`).
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { focusedNode, semanticsOf } from '../prim/semantics';

// Alt: the mock input takes `meta`; the session's key type names only shift and ctrl.
const ALT = { meta: true } as never;
let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

const focused = (p: PageSession): string => {
  const r = p.renderer as unknown as { root: never; stdin: never };
  return focusedNode(semanticsOf({ root: r.root, stdin: r.stdin }))?.name ?? '';
};

for (const [cols, rows] of [[80, 24], [160, 45]] as const) {
  test(`${cols}x${rows}: Alt+J, type; a suggestion, type: both land in the composer`, async () => {
    s = await renderPage({ page: 'home', cols, rows });
    await s.settle();
    await s.keys.press('j', ALT);
    await s.settle();
    await s.keys.type('hello');
    expect(await s.settle()).toContain('hello');
    expect(focused(s)).toBe('Message to your agent');
    for (let i = 0; i < 5; i++) await s.keys.press('backspace');
    for (let i = 0; i < 60 && !focused(s).startsWith("What's running here?"); i++) await s.keys.press('tab');
    expect(focused(s)).toMatch(/^What's running here\?/);
    await s.keys.press('enter');
    await s.settle();
    expect(focused(s)).toBe('Message to your agent');
    await s.keys.type(' now');
    expect(await s.settle()).toContain('. now');
    expect(s.trapsAt).toEqual([]);
    // The dock's open state outlives the render: close it for the next test file.
    await s.keys.press('j', ALT);
    await s.settle();
    expect(focused(s)).not.toBe('Message to your agent');
  }, 240_000);
}
