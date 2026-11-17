// The upload gates in data.ts on their own, core's registries played: what refuses an upload (a Files
// change held or out on the computer, from this tab or merged from another, or changes off) and what an upload
// batch holds back.
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type * as Core from '@core';

const held: { lock: string; meta: unknown; inFlight: false | 'here' | 'elsewhere' }[] = [];
const changes: { identity: unknown }[] = [];
const sending: { attributed: boolean; identity: unknown }[] = [];
const off = { on: false };
vi.mock('@core', async (orig) => ({
  ...(await orig<typeof Core>()),
  can: (cap: string) => !(off.on && cap === 'computers.actions.exec'),
  heldAttempts: (lock: string) => held.filter((h) => h.lock === lock).map((h) => ({ id: h.lock, meta: h.meta, inFlight: h.inFlight, metaVersion: 1 })),
  heldChanges: () => changes,
  sendingChanges: () => sending,
}));
const { blockingUploadsOn, uploadGate, uploadLock, uploadsOn, uploadCall } = await import('./data');
const meta = (files: number, left = 0) => ({ v: 1, batch: 'b', computer: 'c1', computerName: 'atlas', folder: '/tmp', left, files: Array.from({ length: files }, (_, k) => ({ id: `e${k}`, path: `/tmp/f${k}`, size: 1, sha256: 'a'.repeat(64), phase: 'unknown' })) });

beforeEach(() => { held.length = 0; changes.length = 0; sending.length = 0; off.on = false; });

describe('uploadGate (what refuses an upload on a computer)', () => {
  it('nothing held or out: none', () => {
    expect(uploadGate('c1')).toBeNull();
  });
  it('changes off for this session (read live): CHANGES_OFF, before anything else', () => {
    off.on = true;
    expect(uploadGate('c1')).toBe('CHANGES_OFF');
    changes.push({ identity: { computer: 'c1', kind: 'mkdir' } });
    expect(uploadGate('c1')).toBe('CHANGES_OFF');
    off.on = false;
    expect(uploadGate('c1')).toBe('HELD_OVERLAP');
  });
  it('a Files change held there (may have gone through): HELD_OVERLAP; on another computer: none', () => {
    changes.push({ identity: { computer: 'c2', kind: 'mkdir' } });
    expect(uploadGate('c1')).toBeNull();
    changes.push({ identity: { computer: 'c1', kind: 'mkdir' } });
    expect(uploadGate('c1')).toBe('HELD_OVERLAP');
  });
  it('a Files change out now (this tab, or merged from another): HELD_OVERLAP; one not attributed counts everywhere', () => {
    sending.push({ attributed: true, identity: { computer: 'c2' } });
    expect(uploadGate('c1')).toBeNull();
    sending.push({ attributed: true, identity: { computer: 'c1' } });
    expect(uploadGate('c1')).toBe('HELD_OVERLAP');
    sending.length = 0;
    sending.push({ attributed: false, identity: null });
    expect(uploadGate('c1')).toBe('HELD_OVERLAP');
  });
});

describe('blockingUploadsOn (what an upload batch holds back)', () => {
  it('unknown files, a send out (any tab) or an unreadable meta hold back; files only left do not', () => {
    expect(uploadLock('c1')).toBe('files.upload:c1');
    held.push({ lock: 'files.upload:c1', meta: meta(0, 3), inFlight: false });
    expect(uploadsOn('c1')).toHaveLength(1);
    expect(blockingUploadsOn('c1')).toEqual([]);
    held[0]!.inFlight = 'elsewhere';
    expect(blockingUploadsOn('c1')).toHaveLength(1);
    held[0]!.inFlight = false;
    held[0]!.meta = meta(1);
    expect(blockingUploadsOn('c1')).toHaveLength(1);
    held[0]!.meta = { v: 2 };
    expect(uploadsOn('c1')[0]!.meta).toBeNull();
    expect(blockingUploadsOn('c1')).toHaveLength(1);
    expect(blockingUploadsOn('c2')).toEqual([]);
  });
});

describe('uploadCall', () => {
  const C = { id: 'c1', name: 'atlas', project: 'p1', server: 'sv1' } as never;
  it('one route per depth; a path core refuses (or too deep) has none', () => {
    expect(uploadCall(C, '/tmp/a.txt')).not.toBeNull();
    expect(uploadCall(C, '/a/b/c/d/e/f/g/h/i')).toBeNull();
    expect(uploadCall(C, '/')).toBeNull();
    // within depth, but a name core refuses in a path param, or a lossy one
    expect(uploadCall(C, '/tmp/50%.txt')).toBeNull();
    expect(uploadCall(C, '/tmp/caf\ufffd.txt')).toBeNull();
  });
});
