// Home's Shortcuts card, "All shortcuts", in a terminal: it opens the shell's `?` sheet, as on the web (AppShell
// registers the opener of kit openShortcutsSheet; the terminal shell did not, so the press did nothing at all).
//  1. The press opens "Keyboard shortcuts" with its key line; Esc closes it; the focus is still on the button.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { act, focusedNode, queryAllByRole, semanticsOf, type Role, type SemNode } from '../../term/prim/semantics';
import shell from '../../shell/strings.en.json';
import termShell from '../../term/shell/strings.en.json';
import strings from './strings.en.json';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

const tree = (): SemNode[] => { const r = s!.renderer as unknown as { root: never; stdin: never }; return semanticsOf({ root: r.root, stdin: r.stdin }); };
const all = (role: Role, name: string): SemNode[] => queryAllByRole(tree(), role, { name });

for (const [cols, rows] of [[80, 24], [120, 40]] as const) {
  test(`${cols}x${rows}: "All shortcuts" opens the shortcuts sheet; Esc closes it and the focus stays on the button`, async () => {
    s = await renderPage({ page: 'home', cols, rows });
    await s.settle();
    const btn = all('button', strings['keys.all'])[0];
    expect(btn, strings['keys.all']).toBeDefined();
    act(btn!, 'press');
    const frame = await s.settle();
    expect(all('dialog', shell['keys.title']).length).toBe(1);
    expect(frame).toContain(termShell['sheet.close']);
    await s.keys.press('escape');
    await s.settle();
    expect(all('dialog', shell['keys.title']).length).toBe(0);
    expect(focusedNode(tree())?.name).toBe(strings['keys.all']);
    expect(s.failures).toEqual([]);
    expect(s.trapsAt).toEqual([]);
  }, 180_000);
}
