// @vitest-environment node
// What one share row shows: one state, one action, total over every stored state.
import { describe, expect, it } from 'vitest';
import { shareStates, shareWire } from './fixtures';
import { reasonOf, SHARE_SENTENCES, shareState, type ShareContext, type ShareReason, type ShareStateKind } from './state';
import { shareRowOf, type ShareRow } from './wire';

const NOW = 1_800_000_000;
const ctx: ShareContext = { now: NOW };
const rowOf = (wire: unknown): ShareRow => {
  const r = shareRowOf(wire);
  if (!r) throw new Error('fixture row did not read');
  return r;
};
const row = (over: Readonly<Record<string, unknown>> = {}): ShareRow => rowOf(shareWire(over));

// The API's keys (its table of status sentences): 24 sentences. A key
// added or dropped there shows here as a failing list, with the sentence to copy.
const API_KEYS = [
  'SETUP_FAILED', 'DEFERRED', 'TEARDOWN_INCOMPLETE', 'CROSS_SERVER_UNAVAILABLE', 'UNREACHABLE_CONSUMER', 'SWITCHED_OFF_DRAINING',
  'SOURCE_MISSING', 'RW_PAUSED_OWNER_QUOTA_UNSUPPORTED', 'RW_PAUSED_NESTED_SUBVOLUME', 'RW_PAUSED_NO_QUOTA',
  'RW_REFUSED_NESTED_SUBVOLUME', 'RW_REFUSED_NO_QUOTA', 'RW_PAUSED_SQUASH_ACL', 'RW_SQUASH_ACL_FAILED',
  'RO_PAUSED_SQUASH_ACL', 'RO_SQUASH_ACL_FAILED', 'OWNER_UNREACHABLE_NOTHING_HELD', 'OWNER_UNREACHABLE_RELEASED',
  'OWNER_UNREACHABLE_UNCONFIRMED', 'OWNER_HOST_NOT_READY', 'RECEIVER_HOST_NOT_READY', 'CROSS_SERVER_NOT_AVAILABLE_HERE',
  'CONSUMER_STILL_HELD', 'GENERIC',
] as const;

describe('the sentence table', () => {
  it('holds exactly the API keys, each sentence once', () => {
    expect(Object.keys(SHARE_SENTENCES)).toEqual([...API_KEYS]);
    expect(new Set(Object.values(SHARE_SENTENCES)).size).toBe(API_KEYS.length);
  });
  it('every sentence reads back as its own key', () => {
    for (const k of API_KEYS) expect(reasonOf(SHARE_SENTENCES[k]), k).toBe(k);
  });
  it('no message is no reason; any other sentence is GENERIC, the way the API reads its own unknowns', () => {
    expect(reasonOf(null)).toBeNull();
    expect(reasonOf('')).toBeNull();
    expect(reasonOf('This share reaches many containers, so it is being set up in the background. It becomes available within a few minutes.')).toBe('GENERIC');
    expect(reasonOf(SHARE_SENTENCES.DEFERRED + ' ')).toBe('GENERIC');
  });
});

describe('shareState order', () => {
  it('a change the Hub is sending wins over everything stored', () => {
    const s = shareState(row({ status: 'failed', status_message: SHARE_SENTENCES.SETUP_FAILED }), { ...ctx, hold: 'stopping', unsure: true });
    expect(s).toMatchObject({ kind: 'sending', hold: 'stopping', action: null, poll: 'fast' });
  });
  it('a lost answer reads as not sure, with Check again, before the stored state', () => {
    expect(shareState(row({ enabled: false }), { ...ctx, unsure: true })).toMatchObject({ kind: 'unsure', action: 'checkAgain', poll: 'fast' });
  });
  it('an expired share reads as expired (being removed), with no action, before failed or off', () => {
    expect(shareState(row({ expires_at: NOW, status: 'failed', enabled: false }), ctx)).toMatchObject({ kind: 'expired', action: null });
    expect(shareState(row({ expires_at: NOW + 1 }), ctx).kind).toBe('on');
  });
  it('a stored mount path the current rule never makes is legacy, with Share again, even when failed', () => {
    expect(shareState(row({ mount_path: '/home/ada/projects', status: 'failed' }), ctx)).toMatchObject({ kind: 'legacy', action: 'shareAgain' });
  });
  it('no mount path in the answer is not legacy, and never on: the share may be an old one that never mounts', () => {
    expect(shareState(row({ mount_path: undefined }), ctx)).toMatchObject({ kind: 'unclear', action: null, unknown: ['mountPath'] });
    expect(shareState(row({ mount_path: null }), ctx).kind).toBe('unclear');
  });
  it('an end the answer does not say clearly is never on: the share may already have expired', () => {
    expect(shareState(row({ expires_at: 'soon' }), ctx)).toMatchObject({ kind: 'unclear', unknown: ['expiry'] });
    expect(shareState(row({ expires_at: undefined, mount_path: undefined }), ctx)).toMatchObject({ kind: 'unclear', unknown: ['mountPath', 'expiry'] });
  });
  it('what is not known does not hide what is: failed, off and a stopped computer still show', () => {
    expect(shareState(row({ mount_path: undefined, status: 'failed' }), ctx).kind).toBe('failed');
    expect(shareState(row({ expires_at: 'soon', enabled: false }), ctx).kind).toBe('off');
    expect(shareState(row({ mount_path: undefined }), { ...ctx, targetRunning: false }).kind).toBe('targetStopped');
  });
  it('a status the Hub does not know is unreadable, never on', () => {
    expect(shareState(row({ status: 'pending' }), ctx)).toMatchObject({ kind: 'unreadable', action: null });
  });
  it('failed wins over off: a failed share that is also off offers Try again', () => {
    expect(shareState(row({ status: 'failed', enabled: false, status_message: SHARE_SENTENCES.RO_SQUASH_ACL_FAILED }), ctx))
      .toMatchObject({ kind: 'failed', reason: 'RO_SQUASH_ACL_FAILED', action: 'tryAgain' });
  });
  it('a failed share whose fix is read only offers Read only while it is read and write, else Try again', () => {
    const msg = SHARE_SENTENCES.RW_SQUASH_ACL_FAILED;
    expect(shareState(row({ status: 'failed', mode: 'readwrite', status_message: msg }), ctx).action).toBe('readOnly');
    expect(shareState(row({ status: 'failed', mode: 'readonly', status_message: msg }), ctx).action).toBe('tryAgain');
  });
  it('failed with no message is failed with no reason', () => {
    expect(shareState(row({ status: 'failed' }), ctx)).toMatchObject({ kind: 'failed', reason: null, action: 'tryAgain' });
  });
  it('off offers Turn on; draining after off reads again soon', () => {
    expect(shareState(row({ enabled: false }), ctx)).toMatchObject({ kind: 'off', action: 'turnOn', poll: 'slow' });
    expect(shareState(row({ enabled: false, status_message: SHARE_SENTENCES.SWITCHED_OFF_DRAINING }), ctx).poll).toBe('fast');
  });
  it('off wins over a stopped computer', () => {
    expect(shareState(row({ enabled: false }), { ...ctx, sourceRunning: false, targetRunning: false }).kind).toBe('off');
  });
  it('a stored sentence wins over a stopped computer', () => {
    expect(shareState(row({ status_message: SHARE_SENTENCES.DEFERRED }), { ...ctx, sourceRunning: false }).kind).toBe('waiting');
  });
  it('the source stopped wins over the target stopped; each offers its own start', () => {
    expect(shareState(row(), { ...ctx, sourceRunning: false, targetRunning: false })).toMatchObject({ kind: 'sourceStopped', action: 'startSource' });
    expect(shareState(row(), { ...ctx, targetRunning: false })).toMatchObject({ kind: 'targetStopped', action: 'startTarget' });
  });
  it('a computer whose state is not known (null) is not called stopped', () => {
    expect(shareState(row(), { ...ctx, sourceRunning: null, targetRunning: null }).kind).toBe('on');
  });
  it('a project share has no target computer to be stopped', () => {
    expect(shareState(row({ target_type: 'project', target_computer_id: null, target_project_id: 'p1' }), { ...ctx, targetRunning: false }).kind).toBe('on');
  });
  it('on: active, enabled, no sentence, both running; read again slowly, no action', () => {
    expect(shareState(row(), { ...ctx, sourceRunning: true, targetRunning: true }))
      .toEqual({ kind: 'on', hold: null, reason: null, action: null, mayHaveLost: false, poll: 'slow', unknown: [] });
  });
});

describe('shareState by sentence on an active, enabled share', () => {
  const expected: Readonly<Record<ShareReason, { kind: ShareStateKind; rw: string | null; ro: string | null; lost?: true }>> = {
    DEFERRED: { kind: 'waiting', rw: null, ro: null },
    OWNER_HOST_NOT_READY: { kind: 'waiting', rw: null, ro: null },
    RECEIVER_HOST_NOT_READY: { kind: 'waiting', rw: null, ro: null },
    CONSUMER_STILL_HELD: { kind: 'waiting', rw: null, ro: null },
    SWITCHED_OFF_DRAINING: { kind: 'waiting', rw: null, ro: null },
    RW_PAUSED_OWNER_QUOTA_UNSUPPORTED: { kind: 'pausedRw', rw: 'readOnly', ro: null },
    RW_PAUSED_NESTED_SUBVOLUME: { kind: 'pausedRw', rw: 'readOnly', ro: null },
    RW_PAUSED_NO_QUOTA: { kind: 'pausedRw', rw: 'readOnly', ro: null },
    RW_PAUSED_SQUASH_ACL: { kind: 'pausedRw', rw: 'readOnly', ro: null },
    OWNER_UNREACHABLE_NOTHING_HELD: { kind: 'ownerDown', rw: null, ro: null },
    OWNER_UNREACHABLE_RELEASED: { kind: 'ownerDown', rw: null, ro: null, lost: true },
    OWNER_UNREACHABLE_UNCONFIRMED: { kind: 'ownerDown', rw: null, ro: null, lost: true },
    SOURCE_MISSING: { kind: 'interrupted', rw: null, ro: null },
    RO_PAUSED_SQUASH_ACL: { kind: 'interrupted', rw: null, ro: null },
    CROSS_SERVER_NOT_AVAILABLE_HERE: { kind: 'interrupted', rw: null, ro: null },
    RW_REFUSED_NESTED_SUBVOLUME: { kind: 'interrupted', rw: 'readOnly', ro: 'tryAgain' },
    RW_REFUSED_NO_QUOTA: { kind: 'interrupted', rw: 'readOnly', ro: 'tryAgain' },
    RW_SQUASH_ACL_FAILED: { kind: 'interrupted', rw: 'readOnly', ro: 'tryAgain' },
    CROSS_SERVER_UNAVAILABLE: { kind: 'interrupted', rw: 'tryAgain', ro: 'tryAgain' },
    UNREACHABLE_CONSUMER: { kind: 'interrupted', rw: 'tryAgain', ro: 'tryAgain' },
    TEARDOWN_INCOMPLETE: { kind: 'interrupted', rw: 'tryAgain', ro: 'tryAgain' },
    SETUP_FAILED: { kind: 'interrupted', rw: 'tryAgain', ro: 'tryAgain' },
    RO_SQUASH_ACL_FAILED: { kind: 'interrupted', rw: 'tryAgain', ro: 'tryAgain' },
    GENERIC: { kind: 'interrupted', rw: 'tryAgain', ro: 'tryAgain' },
  };
  it('names every key', () => {
    expect(Object.keys(expected).sort()).toEqual([...API_KEYS].sort());
  });
  for (const [k, e] of Object.entries(expected) as [ShareReason, (typeof expected)[ShareReason]][]) {
    it(`${k}: ${e.kind}`, () => {
      const rw = shareState(row({ mode: 'readwrite', status_message: SHARE_SENTENCES[k] }), ctx);
      const ro = shareState(row({ mode: 'readonly', status_message: SHARE_SENTENCES[k] }), ctx);
      expect(rw).toMatchObject({ kind: e.kind, reason: k, action: e.rw, mayHaveLost: e.lost === true });
      expect(ro).toMatchObject({ kind: e.kind, reason: k, action: e.ro, mayHaveLost: e.lost === true });
      expect(rw.poll).toBe(e.kind === 'waiting' ? 'fast' : 'slow');
    });
  }
  it('a possible loss is said on every state it reaches, off and failed included', () => {
    const msg = SHARE_SENTENCES.OWNER_UNREACHABLE_UNCONFIRMED;
    expect(shareState(row({ enabled: false, status_message: msg }), ctx)).toMatchObject({ kind: 'off', mayHaveLost: true });
    expect(shareState(row({ status: 'failed', status_message: msg }), ctx)).toMatchObject({ kind: 'failed', mayHaveLost: true });
  });
});

describe('shareState is total', () => {
  it('every stored combination gives one state with an action that fits it', () => {
    const messages = [null, ...Object.values(SHARE_SENTENCES), 'something else'];
    const kinds = new Set<ShareStateKind>();
    for (const status of ['active', 'failed', 'pending'])
      for (const enabled of [true, false])
        for (const expires_at of [null, NOW - 1, NOW + 3600])
          for (const mount_path of ['/hoody/shares/projects-3f9a1c2e', '/home/ada/projects', undefined])
          for (const expiryKnown of [true, false])
            for (const mode of ['readonly', 'readwrite'])
              for (const status_message of messages)
                for (const sourceRunning of [true, false, null])
                  for (const targetRunning of [true, false, null]) {
                    const r = row({ status, enabled, expires_at: expiryKnown ? expires_at : 'later', mount_path, mode, status_message });
                    const s = shareState(r, { now: NOW, sourceRunning, targetRunning });
                    kinds.add(s.kind);
                    if (s.kind === 'on') expect(r.status === 'active' && r.enabled && r.statusMessage === null && r.mountPath !== null && r.expiryKnown).toBe(true);
                    if (s.action === 'readOnly') expect(r.mode).toBe('readwrite');
                    if (s.action === 'turnOn') expect(r.enabled).toBe(false);
                    if (s.kind === 'failed') expect(r.status).toBe('failed');
                    expect(s.hold).toBeNull();
                  }
    expect([...kinds].sort()).toEqual(['expired', 'failed', 'interrupted', 'legacy', 'off', 'on', 'ownerDown', 'pausedRw', 'sourceStopped', 'targetStopped', 'unclear', 'unreadable', 'waiting']);
  });
  it('the fixture states read as their names', () => {
    expect(shareState(rowOf(shareStates.on), ctx).kind).toBe('on');
    expect(shareState(rowOf(shareStates.off), ctx).kind).toBe('off');
    expect(shareState(rowOf(shareStates.failed), ctx).kind).toBe('failed');
    expect(shareState(rowOf(shareStates.waiting), ctx).kind).toBe('waiting');
    expect(shareState(rowOf(shareStates.ownerDown), ctx).kind).toBe('ownerDown');
    expect(shareState(rowOf(shareStates.legacy), ctx).kind).toBe('legacy');
    expect(shareState(rowOf(shareStates.readWrite), ctx).kind).toBe('on');
  });
});
