// Which row actions a conversation row offers, in ONE place. The rule (C9): Send again, Retry and Edit only on a DEFINITE
// outcome (a message the agent did not take; the prompt of a failed turn). A row that is sending, queued, unknown, sent, refused
// or superseded offers none. The dock's column and the kit block read the same predicates (a pin below keeps Column from growing
// its own copy again).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as C from './conv';
import { actionsOf, canEdit, canResend, fileCount, requestOf, retryFor, retryWaits, RETRY_NEVER } from './rowActions';
import { blocksOf } from './source';

const STATES: C.SendState[] = ['sending', 'queued', 'sent', 'unknown', 'notSent', 'refused', 'superseded'];
const user = (over: Partial<C.UserMsg> = {}): C.UserMsg => ({
  id: 'u1', text: 'fix the build', at: 1000, key: 'k1', via: 'turn', state: 'notSent', turnId: null, commandId: null, reason: '', ...over,
});
const img = { id: 'i1', name: 'a.png', url: 'blob:x' } as unknown as NonNullable<C.UserMsg['imgs']>[number];
type Outcome = Extract<C.Block, { k: 'outcome' }>;
const outcome = (over: Partial<Outcome> = {}): Outcome => ({ k: 'outcome', key: 'o0', state: 'failed', code: 'turn_failed', retryAt: null, effects: false, retry: 'u1', ...over });

describe('Send again and Edit are offered only on a Not sent row', () => {
  it.each(STATES)('state %s', (state) => {
    const u = user({ state, files: [{ id: 'f', name: 'n.txt', lines: 1 }] as never });
    expect(canResend(u), `${state} resend`).toBe(state === 'notSent');
    expect(canEdit(u), `${state} edit`).toBe(state === 'notSent');
    expect(actionsOf(u, null), `${state} actions`).toEqual(state === 'notSent' ? ['resend', 'takeBack'] : []);
  });
  it('a row without text offers neither (nothing to send again or give back)', () => {
    expect(canResend(user({ text: '' }))).toBe(false);
    expect(canEdit(user({ text: '', reason: 'ask.handedOff' }))).toBe(false);
  });
  it('a refusal about the attachments is not fixed by sending again', () => {
    expect(canResend(user({ reason: 'ask.attRefused' }))).toBe(false);
    expect(canResend(user({ reason: 'ask.busy' }))).toBe(true);
    expect(canResend(user({ reason: 'ask.autoTurnStrict' })), 'an auto-approve pick on a Strict chat is refused again the same way').toBe(false);
  });
  it('Edit: a message with files, or one handed off or taken by another tab; a plain refusal only resends', () => {
    expect(canEdit(user())).toBe(false);
    expect(canEdit(user({ imgs: [img] }))).toBe(true);
    expect(canEdit(user({ reason: 'ask.handedOff' }))).toBe(true);
    expect(canEdit(user({ reason: 'ask.takenElsewhere' }))).toBe(true);
    expect(actionsOf(user(), null)).toEqual(['resend']);
  });
  it('counts files', () => {
    expect(fileCount(user())).toBe(0);
    expect(fileCount(user({ imgs: [img], files: [{ id: 'f', name: 'n', lines: 1 }] as never }))).toBe(2);
  });
});

describe('Retry', () => {
  it('belongs to the prompt of the NEWEST failed turn only', () => {
    expect(retryFor(outcome(), true)).toBe('u1');
    expect(retryFor(outcome(), false), 'not the newest block').toBeNull();
    expect(retryFor(outcome({ retry: null }), true), 'a turn read from history has none').toBeNull();
    expect(retryFor(outcome({ state: 'cancelled' as never }), true), 'only a failed turn').toBeNull();
  });
  it.each([['no_credentials', 'ask.noModel'], ['model_unavailable', 'ask.noModel'], ['approval_policy_unsatisfiable', 'ask.policyChanged'], ['context_overflow', 'ask.tooLong']])(
    'never after %s (%s): the same prompt cannot be helped by sending it again', (code, key) => {
      expect(RETRY_NEVER.has(key as string)).toBe(true);
      expect(retryFor(outcome({ code: code as string }), true)).toBeNull();
    });
  it('an ordinary or unknown failure code, and a rate limit, may be retried', () => {
    expect(retryFor(outcome({ code: 'turn_failed' }), true)).toBe('u1');
    expect(retryFor(outcome({ code: '' }), true)).toBe('u1');
    expect(retryFor(outcome({ code: 'rate_limit' }), true)).toBe('u1');
  });
  it('a rate limit says wait until its time', () => {
    const at = new Date(10_000).toISOString();
    const b = outcome({ code: 'rate_limit', retryAt: at });
    expect(retryWaits(b, 5_000)).toBe(true);
    expect(retryWaits(b, 20_000)).toBe(false);
    expect(retryWaits(outcome({ code: 'turn_failed', retryAt: at }), 5_000), 'only a rate limit waits').toBe(false);
    expect(retryWaits(outcome({ code: 'rate_limit', retryAt: null }), 5_000)).toBe(false);
  });
  it('is on the prompt row, only when it has text', () => {
    expect(actionsOf(user({ state: 'sent' }), 'u1')).toEqual(['retry']);
    expect(actionsOf(user({ state: 'sent' }), 'u2')).toEqual([]);
    expect(actionsOf(user({ state: 'sent', text: '' }), 'u1')).toEqual([]);
  });
});

describe('the request a row names', () => {
  it('a first message before its session exists is the CREATE under the create key; otherwise a turn or a message under its own key', () => {
    expect(requestOf(user({ via: 'create' }), { createKey: 'kc' })).toEqual({ key: 'kc', kind: 'create' });
    expect(requestOf(user({ via: 'create' }), {})).toEqual({ key: 'k1', kind: 'turn' });
    expect(requestOf(user({ via: 'turn' }), { createKey: 'kc' })).toEqual({ key: 'k1', kind: 'turn' });
    expect(requestOf(user({ via: 'command' }), {})).toEqual({ key: 'k1', kind: 'message' });
  });
});

describe('the kit block carries the same answer', () => {
  const conv = (users: C.UserMsg[]): C.Conv => ({ ...C.emptyConv('S'), sid: 'S', users: Object.fromEntries(users.map((u) => [u.id, u])), loose: users.map((u) => u.id) });
  it.each(STATES)('a %s row: actions only when Not sent, and always the request it stands for', (state) => {
    const u = user({ state });
    const bs = blocksOf(C.blocks(conv([u]), 0), { createKey: undefined, now: 0 });
    const b = bs.find((x) => x.k === 'user');
    expect(b && b.k === 'user' ? b.req : null).toEqual({ key: 'k1', kind: 'turn' });
    expect(b && b.k === 'user' ? (b.actions ?? []) : null).toEqual(state === 'notSent' ? ['resend'] : []);
  });
  it('Retry is on the prompt of a failed turn only while that failure is the NEWEST block', () => {
    const prompt: C.Block = { k: 'user', key: 'ub', msg: user({ state: 'sent' }) };
    const failed: C.Block = outcome();
    const actionsOfUser = (bs: C.Block[], now = 0) => {
      const b = blocksOf(bs, { now }).find((x) => x.k === 'user');
      return b && b.k === 'user' ? (b.actions ?? []) : null;
    };
    expect(actionsOfUser([prompt, failed])).toEqual(['retry']);
    expect(actionsOfUser([prompt, failed, { k: 'user', key: 'ub2', msg: user({ id: 'u2', key: 'k2', state: 'sent' }) }]), 'a newer message: the old failure is history').toEqual([]);
    expect(actionsOfUser([prompt, outcome({ code: 'context_overflow' })])).toEqual([]);
    const at = new Date(10_000).toISOString();
    expect(actionsOfUser([prompt, outcome({ code: 'rate_limit', retryAt: at })], 5_000), 'the rate limit has not passed').toEqual([]);
    expect(actionsOfUser([prompt, outcome({ code: 'rate_limit', retryAt: at })], 20_000)).toEqual(['retry']);
  });
  it('a history row (no key) names no request and offers nothing', () => {
    const b = blocksOf(C.blocks(conv([user({ key: '', state: 'sent' })]), 0)).find((x) => x.k === 'user');
    expect(b && b.k === 'user' ? b.req : 'x').toBeUndefined();
  });
});

describe('the dock does not keep its own copy', () => {
  const column = readFileSync(join(__dirname, 'Column.tsx'), 'utf8');
  it('Column.tsx reads the shared predicates and carries none of the old inline conditions', () => {
    expect(column).toMatch(/from '\.\/rowActions'/);
    expect(column).toContain('canResend(msg)');
    expect(column).toContain('canEdit(msg)');
    expect(column).toContain('retryFor(b, last)');
    expect(column, 'the attachment-refusal test lives in canResend').not.toContain("msg.reason !== 'ask.attRefused'");
    expect(column, 'the handed-off / taken test lives in canEdit').not.toContain("msg.reason === 'ask.handedOff'");
    expect(column, 'the never-retry list lives in RETRY_NEVER').not.toContain("key !== 'ask.tooLong' && onRetry");
  });
});
