// The fake agent's `hostile` script (fake.scripts.json, which the registry reads without importing any fixture file) says
// exactly what kit/agent/hostile.fixture.ts proves inert (hostile.term.test.tsx), so the shot and the proof never drift.
import { expect, test } from 'bun:test';
import { scripts } from './fake';
import { HOSTILE_PROSE, HOSTILE_STEP } from '../kit/agent/hostile.fixture';

test('the hostile script carries the fixture text and step, then a real approval', () => {
  const s = scripts.hostile as unknown as { k: string; text?: string; summary?: string }[];
  expect(s[0]).toMatchObject({ k: 'text', text: HOSTILE_PROSE });
  expect(s[1]).toMatchObject({ k: 'tool', summary: HOSTILE_STEP });
  expect(s[2]!.k).toBe('confirm');
  expect(HOSTILE_PROSE).toContain('\u001b]52;c;');
});
