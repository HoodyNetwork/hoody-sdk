import { expect, test } from 'bun:test';
import { useEffect, useState } from 'react';
import { drawTest } from '../../term/prim/testing';
import { Box, FocusRoot } from '../../term/prim';
import { layoutFaults } from '../../term/prim/layoutcheck';
import { TextField } from './fields';

// A field whose value is wider than the field, shown unfocused, draws the value's start and "…". The input
// itself must not sit on that text: on the Bots settings tab at 80x24 (the role line of a Bot) it was laid
// out 1x1 over the cut value and the layout check reported an overdraw.
const LONG = 'Runs the team day: triage, approvals and summaries';
function Narrowing({ from, to }: { from: number; to: number }) {
  const [w, setW] = useState(from);
  useEffect(() => { const id = setTimeout(() => setW(to), 20); return () => clearTimeout(id); }, [to]);
  return <Box dir="column" width={w}><TextField aria-label="Role" value={LONG} onChange={() => {}} /></Box>;
}
for (const [name, el] of [
  ['static 40', <Box key="s" dir="column" width={40}><TextField aria-label="Role" value={LONG} onChange={() => {}} /></Box>],
  ['70 -> 40 after mount', <Narrowing key="n" from={70} to={40} />],
] as const) {
  test(`an unfocused field holding a long value (${name}) draws no overdraw`, async () => {
    const t = await drawTest(<FocusRoot>{el}</FocusRoot>, { width: 80, height: 6 });
    let f = await t.settle();
    for (let i = 0; i < 4; i++) { await new Promise((r) => setTimeout(r, 30)); f = await t.settle(); }
    const faults = layoutFaults(t.renderer.root as never, { cols: 80, rows: 6 }).map((x) => `${x.kind} ${x.path}: ${x.detail}`);
    expect(f.split('\n')[0]).toContain('…');
    t.renderer.destroy();
    expect(faults).toEqual([]);
  }, 30_000);
}
