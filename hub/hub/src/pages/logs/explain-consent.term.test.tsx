// Logs, Explain: the drawer's consent box ("Your AI helper will read exactly this", a `<textarea readOnly rows={10}>`
// in parts/ExplainDrawer.tsx) and the instructions under "Instructions sent with it" (rows={4}) drew as ONE cut line in
// the terminal ("og entry, newest first:" in the shot-explain golden): every read-only field took the one-line field
// (src/term/prim/FieldInput.ts), so the person could not read what is sent before pressing Ask. The "explain" shot is
// replayed as the golden gate replays it (More actions, Explain); the frame must hold the sent text from its first
// line, line by line on rows of their own, and the instructions from their start.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { rendererHitAt, replay, shotSteps, type Node } from '../../../scripts/term/shot-replay';
import { act, semanticsOf, type SemNode } from '../../term/prim/semantics';
import shots from './shots';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

const flat = (ns: readonly SemNode[], out: SemNode[] = []): SemNode[] => { for (const n of ns) { out.push(n); flat(n.children, out); } return out; };
/** The first line explain.ts build() puts in every text the AI helper reads. */
const FIRST = 'What I am looking at:';
/** The start of explain.ts system(): the instructions sent with it. */
const SYSTEM = 'You explain log entries from one computer';

/** The frame rows holding the start (up to 20 characters) of each line of `value` that has at least 4. */
function rowsHolding(frame: string, value: string): number[] {
  const rows = frame.split('\n');
  const at = new Set<number>();
  for (const line of value.split('\n')) {
    const head = line.trim().slice(0, 20);
    if (head.length < 4) continue;
    const i = rows.findIndex((r) => r.includes(head));
    if (i >= 0) at.add(i);
  }
  return [...at];
}

const readOnlyArea = (n: SemNode, start: string): boolean => n.role === 'textbox' && n.states.readonly === true && n.states.multiline === true && (n.value ?? '').startsWith(start);

for (const [cols, rows] of [[120, 40], [80, 24]] as const) {
  test(`${cols}x${rows}: Explain shows what it sends line by line from its first line, and the instructions from their start`, async () => {
    const shot = shots.find((x) => x.name === 'explain')!;
    s = await renderPage({ page: 'logs', cols, rows, path: `/logs${shot.path ?? ''}` });
    const r = s.renderer as unknown as { root: unknown; stdin: never };
    const tree = (): SemNode[] => flat(semanticsOf({ root: r.root as never, stdin: r.stdin }));
    const hitAt = rendererHitAt(s.renderer);
    const why = await replay(s, shotSteps(shot), { tree: () => semanticsOf({ root: r.root as never, stdin: r.stdin }) as unknown as Node[], cols, rows, ...(hitAt ? { hitAt } : {}) });
    expect(why).toBeNull();
    let frame = await s.settle();
    const sent = tree().find((n) => readOnlyArea(n, FIRST));
    expect(sent).toBeDefined();
    // Never one row showing only the end of one line ("og entry, newest first:") without the first line.
    expect(frame).toContain(FIRST);
    expect(rowsHolding(frame, sent!.value!).length).toBeGreaterThanOrEqual(3);
    // The instructions: open their disclosure, bring the box into view by focusing it, read them from their start.
    const open = tree().find((n) => n.role === 'button' && n.name === 'Instructions sent with it');
    expect(open).toBeDefined();
    act(open!, 'press');
    await s.settle();
    const sys = tree().find((n) => readOnlyArea(n, SYSTEM));
    expect(sys).toBeDefined();
    act(sys!, 'focus');
    frame = await s.settle();
    expect(frame.replace(/\s+/g, ' ')).toContain(SYSTEM);
    expect(s.failures).toEqual([]);
  }, 240_000);
}
