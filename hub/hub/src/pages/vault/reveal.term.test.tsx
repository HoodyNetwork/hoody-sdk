// The vault's reveal, covered by a test instead of a golden: the shot "value-shown" draws a fixture
// value on purpose, and the golden runner never stores a frame holding one (shot-replay skips it, "frame holds a
// revealed fixture secret"). Here: no value is drawn before Show; Show draws it; Hide takes it off the screen again.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { focusedNode, semanticsOf } from '../../term/prim/semantics';

const VALUE = 'Deploy on Fridays only after the backup ran.'; // fixtures.ts deploy.notes
const shown = (frame: string): boolean => frame.replace(/\s+/g, ' ').includes('Deploy on Fridays');

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

const focused = (p: PageSession): string => {
  const r = p.renderer as unknown as { root: never; stdin: never };
  return focusedNode(semanticsOf({ root: r.root, stdin: r.stdin }))?.name ?? '';
};
const tabTo = async (p: PageSession, name: string): Promise<void> => {
  for (let i = 0; i < 160 && focused(p) !== name; i++) await p.keys.press('tab');
  expect(focused(p)).toBe(name);
};

for (const [cols, rows] of [[120, 40], [80, 24]] as const) {
  test(`${cols}x${rows}: no value before Show; Show reveals it; Hide hides it again`, async () => {
    s = await renderPage({ page: 'vault', cols, rows, path: '/vault?sel=deploy.notes' });
    expect(shown(await s.settle())).toBe(false);
    // The kit SecretField is one Tab stop on the value box, the focused group "Value" (Secret.term.tsx); Enter shows and hides there.
    await tabTo(s, 'Value');
    await s.keys.press('enter');
    expect(shown(await s.settle())).toBe(true);
    await s.keys.press('enter');
    expect(shown(await s.settle())).toBe(false);
    expect(VALUE.length).toBeGreaterThan(0);
    expect(s.trapsAt).toEqual([]);
    expect(s.failures).toEqual([]);
  }, 240_000);
}
