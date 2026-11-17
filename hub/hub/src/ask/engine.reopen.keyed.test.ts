// A chat whose turn answer was lost (the record keeps the turn key, w) and whose turn then ran and ended while the page was gone. The
// chat opened again reads the transcript (which already holds that turn), then reads the key, which names the turn: the turn adopted
// by its key is never rebuilt from the replay beside the transcript's copy. Real journal over the fake storage.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, describe, expect, it } from 'vitest';
import * as C from './conv';
import { world, type World } from './accept/env';

let w: World | null = null;
afterEach(() => { w?.dispose(); w = null; });

const REPLY = 'Hello! How can I help you today?';
const replies = (s: any): string[] => C.blocks(s.conv, 0).filter((b) => b.k === 'reply').map((b: any) => b.text);

describe('a turn adopted by its key after a lost answer', () => {
  it('the turn ended before the chat was opened again: its reply shows once, in every view', async () => {
    w = world({ turnLost: true, pace: 100, script: [[{ k: 'text', text: REPLY }]] });
    const a = await w.dock();
    expect(a.send('hello!')).toBe(true);
    await w.flush(50);
    const sid = a.record?.s;
    expect(sid).toBeTruthy();
    expect(a.record?.w).toBeTruthy();                    // the turn's answer was lost: its key is still owed
    a.end();
    await w.flush(3000);                                  // the turn runs and ends on the agent while nobody watches
    expect((w.agent as any).ss.get(sid).running).toBeNull();
    const b = w.pinned(sid as string);
    let most = 0;
    b.subscribe(() => { most = Math.max(most, replies(b.getSnapshot()).filter((x) => x === REPLY).length); });
    b.open();
    await w.flush(3000);
    expect(w.agent.log.filter((x) => x[0] === 'turn')).toHaveLength(1);
    expect(replies(b.getSnapshot())).toEqual([REPLY]);
    expect(most).toBe(1);
  });
  it('the key read adopts a turn the transcript shown already holds (it ended before the read): one reply, and the turn keeps its id', async () => {
    w = world({ turnLost: true, pace: 100, script: [[{ k: 'text', text: REPLY }]] });
    const a = await w.dock();
    a.send('hello!');
    await w.flush(50);
    const sid = a.record!.s as string;
    a.end();
    await w.flush(3000);
    const b = w.pinned(sid, 'B');
    b.open();
    await w.flush(3000);
    expect(replies(b.getSnapshot())).toEqual([REPLY]);
    // The adoption the owed row's Check runs (adoptTurn): the key names the turn the transcript above already holds.
    let most = 0;
    b.subscribe(() => { most = Math.max(most, replies(b.getSnapshot()).filter((x) => x === REPLY).length); });
    (b as any).adoptTurn((b as any).gen);
    await w.flush(3000);
    expect(w.agent.log.filter((x) => x[0] === 'turnByKey').length).toBeGreaterThan(0);
    expect(most).toBe(1);
    expect(replies(b.getSnapshot())).toEqual([REPLY]);
    expect(b.getSnapshot().conv.turns, 'one turn block for one prompt (never an empty copy beside the transcript\'s)').toHaveLength(1);
    expect(C.current(b.getSnapshot().conv)?.s.turnId).toBe(b.record?.t);
    expect(w.agent.log.filter((x) => x[0] === 'turn')).toHaveLength(1);
  });
});
