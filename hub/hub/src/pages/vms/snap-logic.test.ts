// Vitest: the Snapshots tab's pure rules. Every field of the two wire shapes has a malformed case; a snapshot that is
// restorable and says why not (or the reverse) is unreadable; the proofs are bound to the VM's own id.
import { describe, expect, it } from 'vitest';
// fixtures.ts first: it imports this fixture file and calls its rules, so it must start the cycle.
import './fixtures';
import { SNAPSHOTS } from './fixtures.snap';
import { freshList, labelCheck, parseSnapshots, parseSnapshotTaken, removeCheck, restoreCheck, snapBlock, snapErrKey, snapGoneProved, snapReasonKey, snapTakenProved, SNAP_CODES, suggestLabel, vmReadDisagrees } from './snap-logic';
import strings from './strings.en.json';

type Row = Record<string, unknown>;
const snap: Row = { label: 'a1', created_unix: 100, disk_bytes: 50, nvram_bytes: 1, tpm_bytes: 2, restorable: true };
const without = (r: Row, k: string): Row => Object.fromEntries(Object.entries(r).filter(([x]) => x !== k));

describe('parseSnapshots', () => {
  it('reads the fixture lists', () => {
    expect(parseSnapshots(SNAPSHOTS.win11)?.map((s) => [s.label, s.restorable, s.blockedReason])).toEqual([
      ['clean-install', true, null],
      ['before-drivers', true, null],
      ['old-layout', false, 'the snapshot holds no boot settings and this VM starts with UEFI'],
    ]);
    expect(parseSnapshots([])).toEqual([]);
    expect(parseSnapshots([snap])).toEqual([{ label: 'a1', createdUnix: 100, diskBytes: 50, restorable: true, blockedReason: null }]);
  });
  it.each([
    ['not a list', { label: 'a1' }],
    ['row not an object', ['a1']],
    ['label breaks the name rule', [{ ...snap, label: 'Has_Upper' }]],
    ['label missing', [without(snap, 'label')]],
    ['created_unix a string', [{ ...snap, created_unix: '100' }]],
    ['disk_bytes negative', [{ ...snap, disk_bytes: -1 }]],
    ['nvram_bytes a string', [{ ...snap, nvram_bytes: 'x' }]],
    ['tpm_bytes fractional', [{ ...snap, tpm_bytes: 0.5 }]],
    ['restorable not a flag', [{ ...snap, restorable: 'yes' }]],
    ['blocked_reason a number', [{ ...snap, restorable: false, blocked_reason: 3 }]],
    // Contradictions.
    ['restorable and a reason why not', [{ ...snap, blocked_reason: 'no' }]],
    ['not restorable and no reason', [{ ...snap, restorable: false }]],
    ['one label twice', [snap, snap]],
  ])('unreadable: %s', (_n, wire) => {
    expect(parseSnapshots(wire)).toBeNull();
  });
});

describe('parseSnapshotTaken', () => {
  const ok: Row = { name: 'win11', label: 'a1', disk_bytes: 5, reflinked: true };
  it('reads the answer and its notes', () => {
    expect(parseSnapshotTaken(ok, 'win11', 'a1')).toEqual({ label: 'a1', warnings: [] });
    expect(parseSnapshotTaken({ ...ok, warnings: ['slow copy', ' '] }, 'win11', 'a1')).toEqual({ label: 'a1', warnings: ['slow copy'] });
  });
  it.each([
    ['not an object', null],
    ['another VM', { ...ok, name: 'web-1' }],
    ['another label', { ...ok, label: 'b2' }],
    ['disk_bytes missing', without(ok, 'disk_bytes')],
    ['reflinked not a flag', { ...ok, reflinked: 1 }],
    ['warnings not a list', { ...ok, warnings: 'x' }],
    ['a warning that is not text', { ...ok, warnings: [3] }],
  ])('unreadable: %s', (_n, wire) => {
    expect(parseSnapshotTaken(wire, 'win11', 'a1')).toBeNull();
  });
});

describe('what can be done', () => {
  it('take and restore need a stopped VM that exists', () => {
    expect(snapBlock({ state: 'Stopped', spec: {} as never })).toBeNull();
    expect(snapBlock({ state: 'Running', spec: {} as never })).toBe('notStopped');
    expect(snapBlock({ state: 'Paused', spec: {} as never })).toBe('notStopped');
    expect(snapBlock({ state: 'Creating', spec: {} as never })).toBe('notReady');
    expect(snapBlock({ state: 'Stopped', spec: null })).toBe('notReady');
  });
  it('labelCheck', () => {
    const has = [{ label: 'v1' }];
    expect(labelCheck('', has)).toBe('empty');
    expect(labelCheck('Bad Label', has)).toBe('invalid');
    expect(labelCheck('-x', has)).toBe('invalid');
    expect(labelCheck('x'.repeat(64), has)).toBe('invalid');
    expect(labelCheck('v1', has)).toBe('taken');
    expect(labelCheck('v2', has)).toBe('ok');
  });
  it('suggestLabel is the day and time, numbered when taken', () => {
    const at = new Date(2026, 10, 12, 9, 5);
    expect(suggestLabel(at, [])).toBe('snap-20261112-0905');
    expect(suggestLabel(at, [{ label: 'snap-20261112-0905' }, { label: 'snap-20261112-0905-2' }])).toBe('snap-20261112-0905-3');
    expect(labelCheck(suggestLabel(at, []), [])).toBe('ok');
  });
});

describe('proofs are bound to the VM id', () => {
  const VM = 'id-1';
  const id = { computer: 'c', vm: VM, name: 'win11', op: 'snap.take', label: 'a1', absentBefore: true };
  const vm = (vmId: string | null, name = 'win11') => ({ name, vmId });
  const list = (items: Array<{ label: string; createdUnix: number }>, name = 'win11') => ({ vm: name, items });
  it('take: the label in every fresh list, for a take sent after a fresh list lacked it', () => {
    expect(snapTakenProved(id, [[list([{ label: 'a1', createdUnix: 10_002 }])], [vm(VM)]])).toBe('applied');
    // Not listed (it may still be at work): no verdict, never "not applied".
    expect(snapTakenProved(id, [[list([])], [vm(VM)]])).toBeUndefined();
    expect(snapTakenProved(id, [[list([{ label: 'a1', createdUnix: 10_002 }]), list([])], [vm(VM)]])).toBeUndefined();
  });
  it('take: a listed label proves nothing without the record that it was absent right before the send', () => {
    // Someone else took this label a minute before the press; this take was refused for it and its answer was lost.
    const since = 10_000;
    const theirs = [[list([{ label: 'a1', createdUnix: since - 60 }])], [vm(VM)]];
    expect(snapTakenProved({ computer: 'c', vm: VM, name: 'win11', op: 'snap.take', label: 'a1', since }, theirs)).toBeUndefined();
    expect(snapTakenProved({ ...id, absentBefore: false }, theirs)).toBeUndefined();
    expect(snapTakenProved({ ...id, absentBefore: 'true' }, theirs)).toBeUndefined();
  });
  it('restoreCheck: the same computer, the same VM id and the very same restorable snapshot, judged after the read', () => {
    const ask = { computer: 'c', vm: VM, label: 'a1', createdUnix: 100 };
    const snap = { label: 'a1', createdUnix: 100, diskBytes: 1, restorable: true, blockedReason: null };
    expect(restoreCheck(ask, { computer: 'c', vm: VM }, [snap])).toBe('ok');
    // The VM was replaced under its name while the list was read: the old list still shows the snapshot.
    expect(restoreCheck(ask, { computer: 'c', vm: 'id-2' }, [snap])).toBe('changed');
    expect(restoreCheck(ask, { computer: 'other', vm: VM }, [snap])).toBe('changed');
    expect(restoreCheck({ ...ask, vm: '' }, { computer: 'c', vm: '' }, [snap])).toBe('changed');
    expect(restoreCheck(ask, { computer: 'c', vm: VM }, [])).toBe('changed');
    expect(restoreCheck(ask, { computer: 'c', vm: VM }, [{ ...snap, createdUnix: 101 }])).toBe('changed');
    expect(restoreCheck(ask, { computer: 'c', vm: VM }, [{ ...snap, restorable: false, blockedReason: 'no' }])).toBe('changed');
  });
  it('removeCheck: the same computer, the same VM id and the very same snapshot (restorable or not), judged after the read', () => {
    const ask = { computer: 'c', vm: VM, label: 'a1', createdUnix: 100 };
    const snap = { label: 'a1', createdUnix: 100, diskBytes: 1, restorable: true, blockedReason: null };
    expect(removeCheck(ask, { computer: 'c', vm: VM }, [snap])).toBe('ok');
    expect(removeCheck(ask, { computer: 'c', vm: VM }, [{ ...snap, restorable: false, blockedReason: 'no' }])).toBe('ok');
    // Deleted and taken again under the label since the question opened: another snapshot.
    expect(removeCheck(ask, { computer: 'c', vm: VM }, [{ ...snap, createdUnix: 101 }])).toBe('changed');
    expect(removeCheck(ask, { computer: 'c', vm: VM }, [])).toBe('changed');
    expect(removeCheck(ask, { computer: 'c', vm: 'id-2' }, [snap])).toBe('changed');
    expect(removeCheck(ask, { computer: 'other', vm: VM }, [snap])).toBe('changed');
    expect(removeCheck({ ...ask, vm: '' }, { computer: 'c', vm: '' }, [snap])).toBe('changed');
  });
  it('freshList: only an answer newer than the press counts; a cancelled read resolves with the old list and is none', () => {
    const data = { vm: 'win11', items: [] };
    const press = { at: 5_000, had: 1_000 };
    expect(freshList({ isError: false, data, dataUpdatedAt: 6_000 }, press)).toEqual([]);
    // Answered in the millisecond of the press, and newer than the list held then.
    expect(freshList({ isError: false, data, dataUpdatedAt: 5_000 }, press)).toEqual([]);
    // Left the tab during the read: the kept list comes back, not an error, with its old time.
    expect(freshList({ isError: false, data, dataUpdatedAt: 4_999 }, press)).toBeNull();
    expect(freshList({ isError: true, data, dataUpdatedAt: 6_000 }, press)).toBeNull();
    expect(freshList({ isError: false, data: undefined, dataUpdatedAt: 6_000 }, press)).toBeNull();
    expect(freshList(null, press)).toBeNull();
  });
  it('freshList: a kept list that landed in the very millisecond of the press is not a fresh answer', () => {
    const data = { vm: 'win11', items: [] };
    expect(freshList({ isError: false, data, dataUpdatedAt: 5_000 }, { at: 5_000, had: 5_000 })).toBeNull();
  });
  it('vmReadDisagrees: only two ids that differ', () => {
    expect(vmReadDisagrees('id-a', 'id-b')).toBe(true);
    expect(vmReadDisagrees('id-a', 'id-a')).toBe(false);
    expect(vmReadDisagrees('id-a', undefined)).toBe(false);
    expect(vmReadDisagrees('id-a', null)).toBe(false);
    expect(vmReadDisagrees('', 'id-b')).toBe(false);
  });
  it('remove: the label gone from every fresh list', () => {
    const rm = { ...id, op: 'snap.remove' };
    expect(snapGoneProved(rm, [[list([{ label: 'b2', createdUnix: 1 }])], [vm(VM)]])).toBe('applied');
    expect(snapGoneProved(rm, [[list([{ label: 'a1', createdUnix: 1 }])], [vm(VM)]])).toBeUndefined();
    expect(snapGoneProved(rm, [[list([]), list([{ label: 'a1', createdUnix: 1 }])], [vm(VM)]])).toBeUndefined();
  });
  it.each([
    ['another VM under the same name', [[list([])], [vm('id-2')]]],
    ['a VM whose id is not known', [[list([])], [vm(null)]]],
    ['no fresh detail of the VM', [[list([])], []]],
    ['only another VM\'s detail', [[list([])], [vm(VM, 'web-1')]]],
    ['only another VM\'s list', [[list([], 'web-1')], [vm(VM)]]],
    ['no fresh list', [[], [vm(VM)]]],
    ['no answers', []],
  ])('no verdict: %s', (_n, answers) => {
    const a = answers as unknown as readonly (readonly unknown[])[];
    expect(snapGoneProved({ ...id, op: 'snap.remove' }, a)).toBeUndefined();
    expect(snapTakenProved(id, a)).toBeUndefined();
  });
  it('an identity that names no VM id, label or send time proves nothing', () => {
    const good = [[list([{ label: 'a1', createdUnix: 10_002 }])], [vm(VM)]];
    expect(snapTakenProved({ ...id, vm: '' }, good)).toBeUndefined();
    expect(snapTakenProved({ ...id, label: 5 }, good)).toBeUndefined();
    expect(snapGoneProved({ ...id, label: 5 }, [[list([])], [vm(VM)]])).toBeUndefined();
    expect(snapGoneProved(null, [[list([])], [vm(VM)]])).toBeUndefined();
  });
});

describe('refusals', () => {
  it('every sentence the tab names exists', () => {
    for (const change of ['take', 'restore', 'remove'] as const) for (const code of SNAP_CODES[change]) expect(strings[snapErrKey(change, code)!]).toBeTruthy();
    expect(snapErrKey('remove', 'BadState')).toBeNull();
    expect(snapErrKey('take', 'InsufficientSpace')).toBeNull();
    expect(strings[snapReasonKey('InsufficientSpace')!]).toBeTruthy();
    expect(snapReasonKey('BadState')).toBeNull();
  });
});
