// Account > End all other sessions in the terminal when the answer is a refusal (fixture end-rate): the dialog stays
// open and shows the refusal UNDER its sentence, as the web's dialog body stacks its blocks. A bare sentence beside the
// refusal banner was laid out as one row, the banner squeezed to the right of the words.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { focusedNode, semanticsOf, type SemNode } from '../../term/prim/semantics';
import overlay from '../../kit/overlays/strings.en.json';
import strings from './strings.en.json';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

const tree = (): SemNode[] => { const r = s!.renderer as unknown as { root: never; stdin: never }; return semanticsOf({ root: r.root, stdin: r.stdin }); };
const focused = (): string | undefined => focusedNode(tree())?.name;
function find(nodes: readonly SemNode[], pred: (n: SemNode) => boolean): SemNode | undefined {
  for (const n of nodes) {
    if (pred(n)) return n;
    const c = find(n.children, pred);
    if (c) return c;
  }
  return undefined;
}
// A ConfirmDialog is an alertdialog (kit/overlays/Dialog.term.tsx ConfirmDialog), as on the web.
const dialog = (): SemNode | undefined => find(tree(), (n) => n.role === 'alertdialog' && n.name === strings['s.endOthersTitle']);
// The sentence by its words (a text run, or a paragraph named by its text); the refusal is the kit banner's alert.
const sentence = (d: SemNode): SemNode | undefined => find([d], (n) => n.name === strings['s.endOthersBody']);
const refusal = (d: SemNode): SemNode | undefined => find([d], (n) => n.role === 'alert' && n.name.includes(strings['err.tooMany']));

for (const [cols, rows] of [[120, 40], [80, 24]] as const) {
  test(`end all other sessions refused at ${cols}x${rows}: the refusal sits under the sentence, not beside it`, async () => {
    s = await renderPage({ page: 'account', fx: 'end-rate', cols, rows, path: '/account?end=others' });
    await s.settle();
    let d = dialog();
    expect(d, s.frame).toBeDefined();
    expect(focused()).toBe(overlay.cancel);
    // Before the press: the sentence is drawn and no refusal is (the control for the check after it).
    expect(sentence(d!), s.frame).toBeDefined();
    expect(refusal(d!), s.frame).toBeUndefined();

    for (let i = 0; i < 10 && focused() !== strings['s.endOthers']; i++) await s.keys.press('tab');
    expect(focused()).toBe(strings['s.endOthers']);
    await s.keys.press('enter');
    await s.releaseHeld();

    // A refusal keeps the dialog open and says why.
    d = dialog();
    expect(d, s.frame).toBeDefined();
    const said = sentence(d!);
    const banner = refusal(d!);
    expect(said, s.frame).toBeDefined();
    expect(banner, s.frame).toBeDefined();
    // Both were laid out with real cells (a zero box would let the checks below pass on any layout).
    const [sx, sy, sw, sh] = said!.box;
    const [bx, by, bw, bh] = banner!.box;
    expect(Math.min(sw, sh, bw, bh), s.frame).toBeGreaterThan(0);
    // Stacked: the banner starts on a line below the sentence's last line, at the same left edge.
    expect(by, s.frame).toBeGreaterThanOrEqual(sy + sh);
    expect(Math.abs(bx - sx), s.frame).toBeLessThanOrEqual(1);
    expect(s.failures).toEqual([]);
  }, 240_000);
}
