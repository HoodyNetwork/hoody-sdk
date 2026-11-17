// Settle waits for a box size React has not drawn yet (Computers detail at 120x40 was
// captured at size null; the pane's 93 columns came a frame later). useBoxSize owes the reported size until the commit
// that draws it; idleState is not idle meanwhile, so every settle (render.ts, shots' idle reporter) waits.
import { expect, test } from 'bun:test';
import { createElement } from 'react';
import { QueryClient } from '@tanstack/react-query';
import { drawTest } from './testing';
import { Box, FocusRoot, Text } from './index';
import { useBoxSize } from './size';
import { MEASURE_DEBT_MAX_MS, __measuringSeams, measurementsPending, oweMeasurement, paidMeasurement } from './measuring';
import { idleState, pendingText } from '../app/idle';

let report: (w: number, h: number) => void = () => {};
function Sized() {
  const [size, onSize] = useBoxSize();
  report = onSize;
  return createElement(Box, { grow: 1, onSize }, createElement(Text, null, size ? `size ${size.width}x${size.height}` : 'size none'));
}

test('a reported size is owed until React draws it; idleState waits for it', async () => {
  const t = await drawTest(createElement(FocusRoot, null, createElement(Sized)), { width: 40, height: 6 });
  try {
    expect(await t.settle()).toContain('size 40x6');
    expect(measurementsPending()).toBe(0);
    report(31, 4); // the engine reports a new size; React has not rendered it yet
    expect(measurementsPending()).toBe(1);
    const st = idleState(new QueryClient());
    expect(st.idle).toBe(false);
    expect(pendingText(st)).toContain('1 box size(s) measured, not yet drawn');
    for (let i = 0; i < 50 && measurementsPending() > 0; i++) { await t.renderOnce(); await new Promise((r) => setTimeout(r, 10)); }
    expect(measurementsPending()).toBe(0);
    expect(await t.settle()).toContain('size 31x4');
    // Back to the size on screen before React drew the other one: nothing is owed (React may never commit).
    report(12, 3);
    expect(measurementsPending()).toBe(1);
    report(31, 4);
    expect(measurementsPending()).toBe(0);
  } finally { t.renderer.destroy(); }
  expect(measurementsPending()).toBe(0);
});

// Never a hang: a box whose onSize does not set state (or sets the same value) owes nothing, so its
// settle returns; a debt nothing pays (a component that never commits again) stops counting after MEASURE_DEBT_MAX_MS.
function Ignores() {
  return createElement(Box, { grow: 1, onSize: () => {} }, createElement(Text, null, 'ignores its size'));
}

test('an onSize that ignores the size owes nothing: settle returns', async () => {
  const t = await drawTest(createElement(FocusRoot, null, createElement(Ignores)), { width: 30, height: 4 });
  try {
    expect(await t.settle()).toContain('ignores its size');
    t.resize(20, 3);
    expect(await t.settle()).toContain('ignores its size');
    expect(measurementsPending()).toBe(0);
    expect(idleState(new QueryClient()).measuring).toBe(0);
  } finally { t.renderer.destroy(); }
});

test('a debt nothing pays stops counting after MEASURE_DEBT_MAX_MS', () => {
  let clock = 1000;
  __measuringSeams.setClock(() => clock);
  try {
    const id = oweMeasurement();
    expect(measurementsPending()).toBe(1);
    clock += MEASURE_DEBT_MAX_MS - 1;
    expect(measurementsPending()).toBe(1);
    clock += 2;
    expect(measurementsPending()).toBe(0);
    paidMeasurement(id); // a late payment is harmless
    expect(measurementsPending()).toBe(0);
  } finally { __measuringSeams.setClock(null); }
});
