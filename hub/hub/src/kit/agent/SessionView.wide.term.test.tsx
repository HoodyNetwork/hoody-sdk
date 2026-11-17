// SessionView.term on wide panes (FX-WIDE): the transcript and the approval cards keep the web's reading width (760 px =
// 95 cells; xl 100, xxl 110), centred, at every size class; under the cap nothing moves.
import { afterEach, expect, test } from 'bun:test';
import { drawTest } from '../../term/prim/testing';
import { Box, FocusRoot } from '../../term/prim';
import { SessionView } from './SessionView';
import { DEMO_SCRIPT, scriptedSource } from './scriptedSource.fixture';
import { withGateArm } from './gateArm';
import { sizeClassOf } from './useSizeClass.pure';

let restore: (() => void) | null = null;
afterEach(() => { restore?.(); restore = null; });

async function frame(width: number): Promise<string[]> {
  restore = withGateArm(0);
  const src = scriptedSource(DEMO_SCRIPT);
  const t = await drawTest(<FocusRoot><Box dir="column" width={width} height={40}><SessionView source={src} size={sizeClassOf(width * 8)} typing={false} /></Box></FocusRoot>, { width, height: 40 });
  src.drain();
  const rows = (await t.settle()).split('\n');
  t.renderer.destroy(); restore(); restore = null;
  return rows;
}
/** [first column, last column] of the approval card's top border row. */
const card = (rows: string[]): [number, number] => {
  const top = rows.find((r) => r.includes('! Needs you'))!;
  return [top.indexOf('┌'), top.trimEnd().length - 1];
};
/** First column of the user's message mark in the transcript. */
const said = (rows: string[]): number => Math.min(...rows.filter((r) => /^\s*│ You\b/.test(r)).map((r) => r.indexOf('│')));

test('wide panes: the approval card and the transcript are at most the reading width, centred', async () => {
  for (const [width, cap] of [[160, 95], [200, 100], [240, 100], [320, 110]] as const) {
    const rows = await frame(width);
    const [from, to] = card(rows);
    expect(to - from + 1, `card width at ${width}`).toBeLessThanOrEqual(cap);
    expect(to - from + 1, `card width at ${width}`).toBeGreaterThanOrEqual(cap - 2);
    expect(Math.abs(from - (width - 1 - to)), `card centred at ${width}`).toBeLessThanOrEqual(1);
    expect(Math.abs(said(rows) - from), `transcript starts with the card at ${width}`).toBeLessThanOrEqual(1);
  }
}, 120_000);

test('under the cap nothing moves: at 80 and 95 cells the card and the transcript start at the pane edge', async () => {
  for (const width of [80, 95]) {
    const rows = await frame(width);
    const [from, to] = card(rows);
    expect(from, `card start at ${width}`).toBe(1);
    expect(to, `card end at ${width}`).toBe(width - 2);
    expect(said(rows), `transcript start at ${width}`).toBe(1);
  }
}, 120_000);
