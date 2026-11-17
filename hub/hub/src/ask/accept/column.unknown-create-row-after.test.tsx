// Acceptance, group COLUMN: the rows a recovery leaves unknown can be dismissed, and a journaled text-less row does
// not promise that retyping sends under the same key (a reload keeps no text; Check status is the way back).
/* eslint-disable @typescript-eslint/no-explicit-any */
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import strings from '../strings.en.json';
import { Column } from '../Column';
import * as C from '../conv';
import { storedKeys, world, type World } from './env';

let w: World | null = null;
afterEach(() => { w?.dispose(); w = null; });

const show = (eng: any) => render(<Column eng={eng} snap={eng.getSnapshot()} agentUrl="" typing empty={null} />);
const has = (text: string) => screen.queryAllByText(text).length > 0;
const button = (text: string) => screen.queryAllByRole('button').find((b) => b.textContent === text);

describe('an unknown create row after a recovery', () => {
  it('allocated, no session: Check status AND Stop tracking are offered; the retype promise is not', async () => {
    w = world({ createLost: true });
    const a = await w.dock();
    a.send('Build me a dashboard');
    await w.flush(300);
    const k1 = a.record!.k1;
    const sid = (w.agent as any).createdByKey.get(k1) as string;
    w.agent.allocate(k1, false);
    w.agent.dropSession(sid);
    // A reload: tab B has the entry, not the text.
    const { AskEngine } = await import('../engine');
    const { slot, HANDLE } = await import('./env');
    const store: any = { read: (x: string) => w!.jB.dockRead(x, { v: 1, a: {} }), apply: (x: string, op: any) => w!.jB.dockApply(x, op) };
    const b = new AskEngine(slot as any, w.agent, store, w.clock, { journal: { j: w.jB, handle: HANDLE } });
    b.open();
    await w.flush(900);
    const row = Object.values(b.getSnapshot().conv.users)[0] as any;
    b.check(row.id);
    await w.flush(500);
    const u = Object.values(b.getSnapshot().conv.users)[0] as any;
    expect(u).toMatchObject({ state: 'unknown', reason: 'ask.createMayExist', via: 'create' });
    show(b);
    expect(button(strings['ask.checkStatus'])).toBeTruthy();
    expect(button(strings['ask.stopTracking']), 'a row nothing can settle can be dropped').toBeTruthy();
    expect(has(strings['ask.retypeSameKey']), 'a journaled row cannot be retyped under its key').toBe(false);
    expect(C.blocks(b.getSnapshot().conv, 0).length).toBeGreaterThan(0);
    expect(storedKeys(w.fs)).toEqual([k1]);
  });
});
