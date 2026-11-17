// Bots > Chat apps > People: the invite steps (InviteSteps, a kit StepList named "How an invite works") keep to their box.
// The list once sat in the band's wrapping line at its widest, 80 cells in a 77 box (42 in 39 at 80x24), so each step was
// cut at the right. Checked on the StepList itself: three steps found, each one inside the list's box, the list inside the
// terminal, and no cut fault on a step's words.
import { afterEach, expect, test } from 'bun:test';
import { renderPage } from '../../../../scripts/term/render';
import { layoutFaults } from '../../../term/prim/layoutcheck';
import { getByRole, queryAllByRole, semanticsOf, type SemNode } from '../../../term/prim/semantics';

type S = Awaited<ReturnType<typeof renderPage>>;
let s: S | null = null;
afterEach(() => { s?.close(); s = null; });

const SEL = 'sel=c-atlas~a1b2c3d4e5f60718293a4b5c~chief';
const STEPS_LABEL = 'How an invite works';
// The opening words of each step (bots strings flow.invite.s1, s2, s3.*): a cut fault naming one is a cut step.
const STEP_WORDS = ['Pick their rights', 'Send the code', 'They send it'];
async function until(text: string, ms = 20_000): Promise<void> {
  const end = performance.now() + ms;
  while (!s!.frame.includes(text) && performance.now() < end) { await new Promise((r) => setTimeout(r, 250)); await s!.settle(); }
  expect(s!.frame, s!.frame).toContain(text);
}
const right = (n: SemNode): number => n.box[0] + n.box[2];

for (const [cols, rows] of [[80, 24], [120, 40], [200, 50]] as const)
  test(`chat apps People ${cols}x${rows}: the invite steps keep to their box`, async () => {
    s = await renderPage({ page: 'bots', fx: 'channelPairing', path: `/bots?${SEL}&tab=apps&app=ch-tg`, cols, rows, settleMs: 3000 });
    await until('People');
    const fr = s.frame.split('\n');
    const y = fr.findIndex((l) => /\bPeople\b/.test(l));
    await s.click(fr[y]!.indexOf('People') + 1, y);
    await until('Ana');
    await s.settle();
    const tree = semanticsOf(s.renderer as never);
    const list = getByRole(tree, 'group', { name: STEPS_LABEL });
    const steps = queryAllByRole(list.children, 'listitem');
    expect(steps.length, s.frame).toBe(3);
    expect(right(list), s.frame).toBeLessThanOrEqual(cols);
    for (const st of steps) expect(right(st), `${st.name}\n${s.frame}`).toBeLessThanOrEqual(right(list));
    const r = s.renderer as unknown as { root: Parameters<typeof layoutFaults>[0] };
    const cut = layoutFaults(r.root, { cols, rows }).filter((x) => (x.kind === 'cut' || x.kind === 'text-cut') && STEP_WORDS.some((w) => x.detail.includes(w)));
    expect(cut, s.frame).toEqual([]);
    expect(s.trapsAt).toEqual([]);
  }, 180_000);
