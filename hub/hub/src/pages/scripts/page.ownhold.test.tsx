// Vitest on core's real change source: the hold a send just made is named by the path and the computer the send was made on,
// never by what the shell shows when the answer arrives. A lock keyed by path alone makes holdOf(vars) after an await name the
// shown computer's hold of the same path; the Dismiss that follows would free a hold nothing showed.
import { CoreQueryProvider, queryClient } from '@core';
import { act, render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { setTarget } from '@core/ctx';
import { defineRoute } from '@core/routes';
import { coreSource } from '@core/source';
import { boot, onFetch, R1, settle, TARGET } from '@core/test/env';
import { ownHoldOf } from './parts/ops';

const A = TARGET;
const B = { ...TARGET, container: { id: 'c2', server_name: 'sv1' } };
const agent = defineRoute<unknown, { name: string }>({ method: 'POST', path: '/links12/w', scope: 'agent', body: ['name'] });
const table = { reads: {}, changes: { write: { route: agent, input: (v: { path: string }) => ({ body: { name: v.path } }), lockKey: (v: { path: string }) => ({ path: v.path }) } } };
const flush = async () => { for (let i = 0; i < 20; i++) await settle(); };

function setup() {
  boot({ realm: R1 });
  queryClient.clear();
  onFetch(() => ({ status: 502, body: {} }));
  const src = coreSource('scripts', table as never);
  const cur: { m?: ReturnType<typeof src.useMutation<unknown, { path: string }>> } = {};
  function Probe() {
    cur.m = src.useMutation<unknown, { path: string }>('write');
    return null;
  }
  const send = async (target: typeof A) => {
    setTarget(target);
    let answer: { hold?: string } = {};
    await act(async () => { answer = (await cur.m!.mutateAsync({ path: 'a.ts' })) as { hold?: string }; await flush(); });
    return answer;
  };
  render(<Probe />, { wrapper: CoreQueryProvider });
  return { cur, send };
}

describe('the hold of the send just made', () => {
  it("is the press computer's hold, even when the shell shows another computer holding the same path", async () => {
    const { cur, send } = setup();
    const ansB = await send(B);
    const ansA = await send(A);
    const rows = cur.m!.held();
    const holdOn = (id: string) => rows.find((r) => r.target?.container.id === id)?.hold;
    expect(holdOn('c1') && holdOn('c2') && holdOn('c1') !== holdOn('c2')).toBeTruthy();
    // Core names the hold of the pending send in its own answer; it is the held row of that send.
    expect(ansA.hold).toBe(holdOn('c1'));
    expect(ansB.hold).toBe(holdOn('c2'));
    expect(ownHoldOf(cur.m!, 'a.ts', 'c1', ansA.hold)).toBe(ansA.hold);
    // The shell has moved on to B by the time the answer is read.
    setTarget(B);
    expect(ownHoldOf(cur.m!, 'a.ts', 'c1')).toBe(holdOn('c1'));
    expect(ownHoldOf(cur.m!, 'a.ts', 'c2')).toBe(holdOn('c2'));
    // What the lookup by the shown computer names (the flaw): B's hold, though the send was on A.
    expect(await cur.m!.holdOf({ path: 'a.ts' })).toBe(holdOn('c2'));
  });

  it('is none when the press computer holds nothing, and none when a hold records no computer', async () => {
    const { cur, send } = setup();
    await send(B);
    setTarget(A);
    expect(ownHoldOf(cur.m!, 'a.ts', 'c1')).toBeUndefined();
    expect(ownHoldOf(cur.m!, 'b.ts', 'c2')).toBeUndefined();
    expect(ownHoldOf({ held: () => [] }, 'a.ts', 'c1')).toBeUndefined();
    expect(ownHoldOf({}, 'a.ts', 'c1')).toBeUndefined();
  });

  it('is what the row run takes: it never asks holdOf after an await', () => {
    // The row run lives in parts/runScript.ts, shared by the list and the Overview's Run now.
    for (const f of ['parts/runScript.ts']) {
      const src = readFileSync(new URL(f, import.meta.url), 'utf8');
      expect(src, f).not.toMatch(/\.holdOf\(/);
      expect(src, f).toMatch(/ownHoldOf\(/);
    }
  });
});
