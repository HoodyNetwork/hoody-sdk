// A fact whose value is a part and words (VMs "Memory for VMs": a Meter, then "7.8 GB of 16 GB in use"). The value's
// row squeezed both: beside a second column the ten-block meter broke over two lines and the words drew over it
// (layout fault `overdraw … FactRow > Text ⨯ Text`). Now the part stays whole: one line while the column holds both,
// else the words go under the part, at the value's column.
import type { ReactNode } from 'react';
import { expect, test } from 'bun:test';
import { drawTest } from '../../term/prim/testing';
import { Box, FocusRoot } from '../../term/prim';
import { OverlayHost } from '../../term/prim/Overlay';
import { layoutFaults } from '../../term/prim/layoutcheck';
import { Meter } from '../widgets/Widgets';
import { Facts, StatusPill } from './Display';

const WORDS = '7.8 GB of 16 GB in use';
const items = () => [
  { label: 'Memory for VMs', value: <><Meter size="sm" value={49} label="Memory for VMs, 49% in use" /> {WORDS}</> },
  { label: 'Largest VM that can start', value: '8 GB' },
  { label: 'Free disk', value: '410 GB' },
  { label: 'Running VMs', value: '3 of 16' },
  { label: 'VM CPUs in use', value: '8 of 64' },
];
const METER = '█████░░░░░';

async function draw(width: number): Promise<{ lines: string[]; faults: number }> {
  const t = await drawTest(<FocusRoot><OverlayHost><Box dir="column" width={width}><Facts label="Room for VMs" items={items()} columns={3} /></Box></OverlayHost></FocusRoot>, { width: 112, height: 10 });
  const lines = (await t.settle()).split('\n').map((l) => l.trimEnd());
  const faults = layoutFaults((t.renderer as unknown as { root: never }).root, { cols: 112, rows: 10 }).length;
  t.renderer.destroy();
  return { lines, faults };
}

test('one column with room: the meter and its words share the line', async () => {
  const { lines, faults } = await draw(60);
  expect(lines[0]).toBe(`Memory for VMs          ${METER} ${WORDS}`);
  expect(faults).toBe(0);
});

test('two columns: the meter stays whole and the words sit under it, at the value column', async () => {
  const { lines, faults } = await draw(110);
  expect(lines[0]!.startsWith(`Memory for VMs          ${METER} `)).toBe(true);
  expect(lines[0]).toContain('Running VMs             3 of 16');
  expect(lines[1]!.startsWith(`                        ${WORDS}`)).toBe(true);
  expect(lines[1]).toContain('VM CPUs in use          8 of 64');
  expect(faults).toBe(0);
});

test('a narrow column: the words wrap under the whole meter', async () => {
  const { lines, faults } = await draw(40);
  expect(lines[0]).toBe(`Memory for VMs          ${METER}`);
  expect(lines[1]).toBe('                        7.8 GB of 16 GB');
  expect(lines[2]).toBe('                        in use');
  expect(faults).toBe(0);
});

// A free server's panel: "Allowed to run VMs  · No Free servers are shared, so they can't run VMs." The
// reason is a span after the pill, not bare text, so the value was not laid out as mixed: pill and reason ran on as one
// sentence and the reason was cut at the column's edge at 80 cells.
const REASON = "Free servers are shared, so they can't run VMs.";
async function drawReason(width: number): Promise<{ lines: string[]; faults: number }> {
  const list = [{ label: 'Allowed to run VMs', value: <><StatusPill>No</StatusPill><span> {REASON}</span></>, wide: true }];
  const t = await drawTest(<FocusRoot><OverlayHost><Box dir="column" width={width}><Facts label="About" items={list} /></Box></OverlayHost></FocusRoot>, { width: 112, height: 10 });
  const lines = (await t.settle()).split('\n').map((l) => l.trimEnd()).filter((l) => l !== '');
  const faults = layoutFaults((t.renderer as unknown as { root: never }).root, { cols: 112, rows: 10 }).length;
  t.renderer.destroy();
  return { lines, faults };
}

test('a pill and a span of words, with room: one line', async () => {
  const { lines, faults } = await drawReason(100);
  expect(lines).toEqual([`Allowed to run VMs  · No ${REASON}`]);
  expect(faults).toBe(0);
});

test('a pill and a span of words, narrow: the reason goes under the pill and wraps whole, nothing cut', async () => {
  const { lines, faults } = await drawReason(60);
  expect(lines[0]).toBe('Allowed to run VMs  · No');
  expect(lines.slice(1).map((l) => l.trim()).join(' ')).toBe(REASON);
  expect(lines.slice(1).every((l) => l.startsWith('                    '))).toBe(true);
  expect(faults).toBe(0);
});

async function drawValue(value: ReactNode): Promise<{ lines: string[]; faults: number }> {
  const t = await drawTest(<FocusRoot><OverlayHost><Box dir="column" width={60}><Facts label="About" items={[{ label: 'Size', value }]} /></Box></OverlayHost></FocusRoot>, { width: 112, height: 10 });
  const lines = (await t.settle()).split('\n').map((l) => l.trimEnd()).filter((l) => l !== '');
  const faults = layoutFaults((t.renderer as unknown as { root: never }).root, { cols: 112, rows: 10 }).length;
  t.renderer.destroy();
  return { lines, faults };
}

test('bare text beside a span of words is still a mixed value: both drawn as words on the line', async () => {
  const { lines, faults } = await drawValue(<>8<span> GB</span></>);
  expect(lines).toEqual(['Size  8 GB']);
  expect(faults).toBe(0);
});

test('a blank span beside a pill adds no gap', async () => {
  const { lines, faults } = await drawValue(<><StatusPill>No</StatusPill><span> </span> why</>);
  expect(lines).toEqual(['Size  · No why']);
  expect(faults).toBe(0);
});

test('a hidden span beside a pill is not turned into words', async () => {
  const { lines } = await drawValue(<><StatusPill>No</StatusPill><span hidden>secret words</span> why</>);
  expect(lines.join('\n')).not.toContain('secret words');
  expect(lines[0]).toContain('· No');
  expect(lines[0]).toContain('why');
});
