// Vitest: the Apps store (parts/ops.ts) ends with the session, as Programs' held operations do. Core's auth purge (a
// sign-out, the next account) drops this session's launches, notes, removed rows and confirmed notes, and moves the
// epoch, so a request begun before writes nothing after and the next session of the same process (a terminal goes on
// drawing) never shows a note for a press nobody there made.
import { describe, expect, it } from 'vitest';
import { runAuthPurge } from '@core/realm';
import type { OpenApp } from './logic';
import { ops } from './parts/ops';

describe('apps ops: the end of the session', () => {
  it('an auth purge drops launches, notes, removed rows and acks, and moves the epoch', () => {
    ops.reset();
    const ep = ops.get().epoch;
    ops.addLaunch({ key: 'k0', name: 'htop' } as unknown as OpenApp);
    ops.patch('k1', { note: 'stopFailed' });
    ops.forget('k2');
    ops.ack('s1');
    expect(ops.get().launches).toHaveLength(1);
    runAuthPurge();
    const s = ops.get();
    expect(s.launches).toHaveLength(0);
    expect(s.patches.size).toBe(0);
    expect(s.forgotten.size).toBe(0);
    expect(s.acked.size).toBe(0);
    expect(s.epoch).toBeGreaterThan(ep);
  });
});
