// Schedules, New schedule in the terminal (a flow read as correct and pinned here): the editor's focus
// follows its step (parts/Editor.tsx :107-119). Choosing Command puts the keyboard in Name (TextField's inputRef: the
// terminal field's element-like handle, kit/forms/fields.term.tsx :51); the drawer's Back ("‹ New schedule") returns it
// to the Command card the person came from (PickCard.term's ref, standalone card). Nothing is sent on the way.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { act, focusedNode, queryAllByRole, semanticsOf } from '../../term/prim/semantics';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

const tree = () => { const r = s!.renderer as unknown as { root: never; stdin: never }; return semanticsOf({ root: r.root, stdin: r.stdin }); };
const focused = (): string => focusedNode(tree())?.name ?? '(nothing focused)';
async function until(ok: (f: string) => boolean, ms = 20_000): Promise<string> {
  const end = performance.now() + ms;
  while (!ok(s!.frame) && performance.now() < end) { await new Promise((r) => setTimeout(r, 250)); await s!.settle(); }
  return s!.frame;
}

for (const [cols, rows] of [[80, 24], [120, 40]] as const) {
  test(`${cols}x${rows}: Command puts the keyboard in Name; Back hands it to the Command card`, async () => {
    s = await renderPage({ page: 'schedules', path: '/schedules?edit=new', cols, rows, settleMs: 2000 });
    await until((f) => f.includes('What should run?'));
    const [command] = queryAllByRole(tree(), 'button', { name: /^Command Run a command/ });
    expect(command, s.frame).toBeDefined();
    act(command!, 'press');
    await s.settle();
    await until(() => focused() === 'Name');
    expect(focused()).toBe('Name');
    // The drawer's Back sits before Name in its head: Shift-Tab reaches it inside the drawer (a modal layer).
    for (let i = 0; i < 12 && focused() !== 'New schedule'; i++) await s.keys.press('tab', { shift: true });
    expect(focused()).toBe('New schedule');
    await s.keys.press('return');
    await s.settle();
    await until((f) => f.includes('What should run?'));
    expect(focused()).toMatch(/^Command Run a command/);
    expect(s.trapsAt).toEqual([]);
    expect(s.failures).toEqual([]);
    expect(s.frame).not.toContain('could not be drawn');
  }, 180_000);
}
