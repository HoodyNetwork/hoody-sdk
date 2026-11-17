// Vitest: a refused New script create says why in words that fit a create. The write route is
// secret (its content), so core rebuilds a refusal from safe fields and keeps a code only when the route lists it: exec's
// ROUTE_EFFECT_CHANGED must be listed to reach the page. A create is sent with ifRevision null, so a revision refusal means a
// script was saved at that path after the check, never "changed while you were editing".
import { CoreQueryProvider, queryClient } from '@core';
import { act, render, renderHook, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { setTarget } from '@core/ctx';
import { boot, calls, onFetch, R1, settle, TARGET, type Call, type Reply } from '@core/test/env';
import { useWrite } from './data';
import { ChangeBanner } from './parts/Bits';
import strings from './strings.en.json';

// exec's error envelope (openapi errorEnvelopeSchema): { error: message, code, timestamp, details }
const reply = (c: Call): Reply => {
  if (c.url.includes('/exec/scripts/write')) return { status: 409, body: { error: 'refused', code: 'ROUTE_EFFECT_CHANGED', timestamp: '2026-10-27T12:00:00Z', details: { route: '/probe', expected: 'default/1/probe.ts', answeredBy: 'default/1/[x].ts' } } };
  return { status: 200, body: { data: {} } };
};

beforeEach(() => {
  boot({ realm: R1 });
  queryClient.clear();
  calls.length = 0;
  onFetch(reply);
  setTarget(TARGET);
});

describe('the write route keeps the route refusal code', () => {
  it('a create refused with ROUTE_EFFECT_CHANGED reaches the page as that code, nothing else of the answer', async () => {
    const { result } = renderHook(() => useWrite(), { wrapper: CoreQueryProvider });
    let r: { outcome: string; code?: string } | undefined;
    await act(async () => {
      r = await result.current.mutateAsync({ compId: TARGET.container.id, path: 'default/1/probe.ts', content: 'export default 1;\n', ifRevision: null, opId: 'op-live-1b-0001', expectRoute: { route: '/probe', answeredBy: 'default/1/probe.ts' } }) as never;
      for (let i = 0; i < 20; i++) await settle();
    });
    expect(calls.filter((c) => c.url.includes('/exec/scripts/write'))).toHaveLength(1);
    expect(r).toMatchObject({ outcome: 'failed', code: 'ROUTE_EFFECT_CHANGED' });
    expect(JSON.stringify(r)).not.toContain('[x]');
  });
});

describe('a refused create says it was refused, in a create\'s words (the words come from new/liveErrors.ts)', () => {
  const show = (what: 'create' | 'save', code: string, words?: { title: string; body: string; extra?: string }) => render(<ChangeBanner out={{ kind: 'failed', code }} what={what} onDismiss={() => undefined} words={words ?? null} />);
  it('a create\'s own words replace the generic title and body, with the fresh-read line after the body', () => {
    show('create', 'ROUTE_EFFECT_CHANGED', { title: 'T-own', body: 'B-own.', extra: 'X-line.' });
    expect(screen.getByText('T-own')).toBeTruthy();
    expect(screen.getByText('B-own. X-line.')).toBeTruthy();
    expect(screen.queryByText(strings['outcome.failed.create'])).toBeNull();
  });
  for (const code of ['REVISION_MISMATCH', 'BAD_REVISION', 'ROUTE_EFFECT_CHANGED']) {
    it(`${code} on a create without its own words never borrows an edit's words: the generic refusal`, () => {
      show('create', code);
      expect(screen.getByText(strings['err.generic'])).toBeTruthy();
      expect(screen.queryByText(strings['err.REVISION_MISMATCH'])).toBeNull();
      expect(screen.queryByText(strings['err.BAD_REVISION'])).toBeNull();
    });
  }
  it('a save keeps its own words for a revision refusal', () => {
    show('save', 'REVISION_MISMATCH');
    expect(screen.getByText(strings['err.REVISION_MISMATCH'])).toBeTruthy();
  });
});
