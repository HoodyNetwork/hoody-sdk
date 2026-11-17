// A Bot's Activity reads as turns. An event row ("i Task report · Read deploy log · on atlas") draws its message on the
// line under its label, at the row's width: beside the label a three-line message wrapped in half the row, the label
// centred against it. And one blank row parts a turn from the next (term-decls rows pane.module.css#runtimeText, #log).
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../../scripts/term/render';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

for (const [cols, rows] of [[120, 40], [80, 24]] as const) {
  test(`${cols}x${rows}: an event's message is under its label, and a blank row parts the turns`, async () => {
    s = await renderPage({ page: 'bots', cols, rows });
    await s.settle();
    await s.keys.press('enter');
    let f = await s.settle();
    const at = (x: string) => f.split('\n').findIndex((l) => l.includes(x));
    const whole = () => { const i = at('Task report'); const l = f.split('\n'); return i > 0 && /days? ago/.test(l[i + 3] ?? '') && l[i + 5] !== undefined; };
    // The report row is above the log's end, which is where the log opens.
    for (let i = 0; i < 12 && !whole(); i++) { await s.keys.press('pageup'); f = await s.settle(); }
    const lines = f.split('\n');
    const label = at('Task report');
    expect(label, f).toBeGreaterThan(0);
    // The label's line holds the label only; the message starts on the next line, where the row's mark is.
    expect(lines[label]).not.toContain('deploy failed');
    expect(lines[label + 1]).toContain('The deploy failed because the build step');
    expect(lines[label + 1]!.indexOf('The deploy failed')).toBe(lines[label]!.indexOf('Task report') - 2);
    // The turn ends with its time; the row after it is blank, then the next turn.
    expect(lines[label + 3]).toMatch(/days? ago/);
    expect(lines[label + 4]!.replace(/^.*│/, '').replace(/[█▄▀]/g, '').trim()).toBe('');
    expect(lines[label + 5]!.replace(/^.*│/, '').replace(/[█▄▀]/g, '').trim()).not.toBe('');
    expect(s.trapsAt).toEqual([]);
  }, 240_000);
}
