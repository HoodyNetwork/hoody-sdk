// The terminal scenario driver's idle signal (app/idle.ts): a case whose component is still working when the settle
// deadline passes fails with `unsettled: <what>`, and a held long timer fires only on a `releaseHeld` step.
import { describe, expect, test } from 'bun:test';
import { createElement, useEffect, useState, type ReactElement } from 'react';
import { runScenarioFile } from './run';
import { scenarios } from './types';
import { termDriver } from './term-driver';
import { Text } from '../prim/Text';

/** Sets a short timer forever: never idle. */
function Busy(): ReactElement {
  const [n, setN] = useState(0);
  useEffect(() => { const id = setTimeout(() => setN((x) => x + 1), 50); return () => clearTimeout(id); }, [n]);
  return createElement(Text, null, 'working');
}

describe('term driver idle signal', () => {
  test('a component still working at the deadline fails the case as unsettled, naming the timer', async () => {
    process.env.SCENARIO_SETTLE_MS = '400';
    try {
      const file = scenarios('IdleBusy', Busy as never, { cases: [{ name: 'busy', props: {}, steps: [], expect: { nodes: [{ target: { text: 'working' } }] } }] });
      const r = await runScenarioFile(file as never, termDriver());
      expect(r.cases[0]!.ok).toBe(false);
      expect(r.cases[0]!.error).toMatch(/^unsettled: timers .*src\/term\/scenario\/run\.term\.test\.tsx:\d+/);
    } finally { delete process.env.SCENARIO_SETTLE_MS; }
  });

  test('a still component settles', async () => {
    const Still = (): ReactElement => createElement(Text, null, 'done');
    const file = scenarios('IdleStill', Still as never, { cases: [{ name: 'still', props: {}, steps: [], expect: { nodes: [{ target: { text: 'done' } }] } }] });
    const r = await runScenarioFile(file as never, termDriver());
    expect(r.cases[0]).toMatchObject({ ok: true });
  });
});
