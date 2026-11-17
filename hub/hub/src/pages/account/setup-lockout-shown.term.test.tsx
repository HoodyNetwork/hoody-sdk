// Account > Turn on two-step sign-in, step 2, in the terminal: a refusal the drawer shows in its banner (too many
// tries) must be on screen. The banner sits at the top of the drawer's body and the step is longer than the pane, so
// with the view scrolled down to the code field the banner was drawn off screen: the person saw nothing happen.
//
// | # | Behaviour | Test |
// |---|---|---|
// | 1 | The code is refused as too many tries: the frame shows the banner's title and its sentence, at 80x24 and at 120x40; the drawer stays on step 2; nothing failed | 'lockout is on screen' |
//
// A fixture answer carries an outcome and a code only (no status, no wait), so the sentence here is the one with no
// minutes; the minutes a real lockout names are read by core/lockout.ts (its own test, with the terminal's client).
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { focusedNode, semanticsOf, semText, type SemNode } from '../../term/prim/semantics';
import fixtures from './fixtures';
import strings from './strings.en.json';

let s: PageSession | null = null;
let undo: (() => void) | null = null;
afterEach(() => { s?.close(); s = null; undo?.(); undo = null; });

const tree = (): SemNode[] => { const r = s!.renderer as unknown as { root: never; stdin: never }; return semanticsOf({ root: r.root, stdin: r.stdin }); };
const focused = (): string | undefined => focusedNode(tree())?.name;
async function tabTo(name: string): Promise<void> {
  for (let i = 0; i < 30 && focused() !== name; i++) await s!.keys.press('tab');
  expect(focused()).toBe(name);
}
const WAIT = strings['err.tooMany'];

for (const [cols, rows] of [[80, 24], [120, 40]] as const) {
  test(`lockout is on screen ${cols}x${rows}`, async () => {
    // The wrong-code state, with its refusal made the lockout for this test only (no new fixture state).
    const st = (fixtures.states as unknown as Record<string, Record<string, unknown>>)['code-wrong']!;
    const was = st.verifySetup;
    st.verifySetup = { outcome: 'failed', code: 'RATE_LIMITED' };
    undo = () => { st.verifySetup = was; };
    s = await renderPage({ page: 'account', fx: 'code-wrong', cols, rows, path: '/account?sheet=setup' });
    await s.settle();
    await s.keys.type('pw');
    await s.keys.press('enter');
    await s.releaseHeld();
    expect(s.frame).toContain(strings['2fa.step2of2']);
    await tabTo(strings['2fa.iSaved']);
    await s.keys.press('space');
    await tabTo(strings['2fa.code']);
    await s.keys.type('123456');
    await s.keys.press('enter');
    await s.releaseHeld();
    await s.settle();
    // In the tree either way; the frame is what the person sees.
    expect(semText(tree())).toContain(WAIT);
    expect(s.frame).toContain(strings['sheet.failedTitle']);
    expect(s.frame.replace(/\s+/g, ' ')).toContain(WAIT);
    expect(s.frame).toContain(strings['2fa.step2of2']);
    expect(s.failures).toEqual([]);
  }, 240_000);
}
