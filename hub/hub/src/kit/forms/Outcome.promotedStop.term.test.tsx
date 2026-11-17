// Stop tracking belongs to a pending outcome the page tracks (the web's rule: Outcome.tsx, Outcome.promotedStop.test.tsx).
// A failed outcome whose error facts say pending is drawn as the pending line (C9), but the page never tracked it: the
// line offers Check again and no Stop tracking. Pressing Stop tracking there would let the page clear the line and bring
// its action back while the change may have gone through.
// Fails if Outcome.term.tsx draws the Stop tracking button without `!promoted`.
import { expect, test } from 'bun:test';
import type { ReactNode } from 'react';
import { errorInfo } from '@core';
import { drawTest } from '../../term/prim/testing';
import { FocusRoot } from '../../term/prim';
import { Outcome } from './Outcome';

async function frame(node: ReactNode): Promise<string> {
  const t = await drawTest(<FocusRoot>{node}</FocusRoot>, { width: 120, height: 6 });
  const f = await t.settle();
  t.renderer.destroy();
  return f;
}

test('a failed outcome promoted to pending by its facts: the pending line with Check again, no Stop tracking', async () => {
  const f = await frame(<Outcome outcome="failed" error={errorInfo({ pending: true, status: 502 })} onCheck={() => true} onStop={() => {}} />);
  expect(f).toContain('◷ May have gone through');
  expect(f).not.toContain("Didn't go through");
  expect(f).toContain('Check again');
  expect(f).not.toContain('Stop tracking');
});

test('a pending outcome the page tracks keeps Stop tracking beside Check again', async () => {
  const f = await frame(<Outcome outcome="pending" onCheck={() => true} onStop={() => {}} />);
  expect(f).toContain('◷ May have gone through');
  expect(f).toContain('Check again');
  expect(f).toContain('Stop tracking');
});
