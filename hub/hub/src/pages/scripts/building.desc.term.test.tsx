// "Being built in this browser": every build row names what is being built. The row's buttons and the step text
// ("Running a code check") must not take the whole row, or the third build draws with no description at all
// ("● Building Running a code c… atlas 3 minutes ago"): a row that says nothing about which script it is. On the
// wide grid the description has a floor in the terminal and the buttons take the line under the row
// (scripts/term/css-translate/term-decls.ts, Building.module.css#row and #actions), so the step text stays whole; on a
// narrow pane the row stacks (Building.module.css @container rule: description, then pill, computer, age and actions on
// their own lines). Either way each build draws its description, in order, followed by its own computer, age and
// whole buttons, and no row of the section is cut or drawn over its neighbour.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { layoutFaults } from '../../term/prim/layoutcheck';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

const BUILDS = [
  { start: 'Turn the store', computer: 'borealis', age: '40 minutes ago', actions: '[Open] [Discard]' },
  { start: 'Warn me when', computer: 'atlas', age: '12 minutes ago', actions: '[Open] [Discard]' },
  { start: 'Every Monday', computer: 'atlas', age: '3 minutes ago', actions: '[Open] [Stop] [Discard]', step: 'Running a code check' },
] as const;

for (const [cols, rows] of [[80, 24], [120, 40]] as const) {
  test(`each build row draws its description (${cols}x${rows})`, async () => {
    s = await renderPage({ page: 'scripts', fx: 'builds', cols, rows });
    const frame = await s.settle();
    const lines = frame.split('\n');
    // The section names where the builds are kept: this device (termWords.json), never a browser the terminal has not.
    const top = lines.findIndex((l) => l.includes('Being built on this device'));
    expect(top).toBeGreaterThanOrEqual(0);
    expect(frame).not.toContain('in this browser');
    const at = BUILDS.map((b) => lines.findIndex((l, i) => i > top && l.includes(b.start)));
    expect(at.map((i, k) => ({ start: BUILDS[k]!.start, drawn: i > top }))).toEqual(BUILDS.map((b) => ({ start: b.start, drawn: true })));
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    BUILDS.forEach((b, k) => {
      const row = lines.slice(at[k]!, at[k + 1] ?? at[k]! + 5).join('\n');
      expect({ start: b.start, computer: row.includes(b.computer), age: row.includes(b.age) }).toEqual({ start: b.start, computer: true, age: true });
      // The buttons and the step text are drawn whole (at 120 columns the one-line row cut its step to "Running a code…").
      const step = 'step' in b ? b.step : undefined;
      expect({ start: b.start, actions: row.includes(b.actions), step: step === undefined || row.includes(step) }).toEqual({ start: b.start, actions: true, step: true });
    });
    const faults = layoutFaults((s.renderer as unknown as { root: never }).root, { cols, rows });
    expect(faults.map((f) => `${f.kind} ${f.path} ${f.detail}`)).toEqual([]);
  }, 180_000);
}
