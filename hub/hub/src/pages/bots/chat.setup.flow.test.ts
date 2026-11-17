// Vitest: the Setup track's steps and the one step it opens, per the
// app's state: a set webhook blocks first, a refused token is its own open step, the owner is the next blocking step, then
// Telegram's privacy (limited when on, unknown when nothing says), then the optional group and home chat.
import { describe, expect, it } from 'vitest';
import { PRIVACY_NOTE, nextStep, setupSteps } from './chatFlow';
import type { Channel } from './data';

const base = (over: Partial<Channel> = {}): Channel =>
  ({
    id: 'c1',
    kind: 'telegram',
    label: 'T Main',
    state: 'running',
    reason: null,
    notes: [],
    needsOwner: false,
    principals: [{ id: 'p1', name: 'Ana', platformUser: 'ana', owner: true }],
    chatRows: [],
    homeChat: null,
    view: {},
    identity: { username: 'shop_bot' },
    ...over,
  }) as unknown as Channel;
const ids = (c: Channel) => setupSteps(c).map((x) => `${x.id}:${x.state}:${x.segment}`);

describe('setupSteps', () => {
  it('a running Telegram app with an owner: token and owner done, privacy unknown, group and home optional', () => {
    expect(ids(base())).toEqual(['token:done:done', 'owner:done:done', 'privacy:unknown:unknown', 'group:later:optional', 'home:later:optional']);
  });
  it('privacy on is limited and warn-toned, never a blocking step', () => {
    const p = setupSteps(base({ notes: [{ code: PRIVACY_NOTE, field: 'group_mode' }] as Channel['notes'] })).find((x) => x.id === 'privacy');
    expect(p).toMatchObject({ state: 'now', tone: 'warn', optional: true, segment: 'limited' });
  });
  it('a set webhook is the first step and blocks; the token waits behind it', () => {
    const s = setupSteps(base({ state: 'starting', reason: 'webhook_set' } as Partial<Channel>));
    expect(s[0]).toMatchObject({ id: 'webhook', state: 'now', tone: 'danger', segment: 'blocking' });
    expect(s[1]).toMatchObject({ id: 'token', state: 'later' });
  });
  it('a refused token is an open danger step', () => {
    expect(setupSteps(base({ state: 'auth_failed' })).find((x) => x.id === 'token')).toMatchObject({ state: 'now', tone: 'danger', segment: 'blocking' });
  });
  it('a paused app keeps its accepted token, but the owner step does not open (a paused app reads no code)', () => {
    const s = setupSteps(base({ state: 'paused', needsOwner: true, principals: [] }));
    expect(s.find((x) => x.id === 'token')).toMatchObject({ state: 'done', segment: 'done' });
    expect(s.find((x) => x.id === 'owner')).toMatchObject({ state: 'later', segment: 'blocking' });
  });
  it('only starting waits on a connection; stopped, standby, conflict, realm-unserved, stopping and degraded are unknown, never done', () => {
    expect(setupSteps(base({ state: 'starting' } as Partial<Channel>)).find((x) => x.id === 'token')).toMatchObject({ state: 'wait', segment: 'todo' });
    for (const state of ['stopped', 'standby', 'conflict', 'realm_unserved', 'stopping', 'degraded'] as const) {
      const s = setupSteps(base({ state, needsOwner: true, principals: [] } as Partial<Channel>));
      expect(s.find((x) => x.id === 'token'), state).toMatchObject({ state: 'unknown', segment: 'unknown' });
      expect(s.find((x) => x.id === 'owner'), state).toMatchObject({ state: 'later' });
    }
  });
  it('Slack and Discord have no privacy step', () => {
    expect(setupSteps(base({ kind: 'slack' })).map((x) => x.id)).toEqual(['token', 'owner', 'group', 'home']);
  });
  it('an approved group and a home chat are done', () => {
    const s = setupSteps(base({ chatRows: [{ kind: 'group', state: 'approved' }] as unknown as Channel['chatRows'], homeChat: { id: 'h' } as unknown as Channel['homeChat'] }));
    expect(s.filter((x) => x.state === 'done').map((x) => x.id)).toEqual(['token', 'owner', 'group', 'home']);
  });
});

describe('nextStep', () => {
  it('opens the webhook first', () => expect(nextStep(setupSteps(base({ state: 'starting', reason: 'webhook_set' } as Partial<Channel>)))).toBe('webhook'));
  it('opens the refused token', () => expect(nextStep(setupSteps(base({ state: 'auth_failed' })))).toBe('token'));
  it('opens the owner when connected and ownerless', () => expect(nextStep(setupSteps(base({ state: 'needs_owner', needsOwner: true, principals: [] })))).toBe('owner'));
  it('opens nothing while the agent is still connecting', () => expect(nextStep(setupSteps(base({ state: 'starting', needsOwner: true, principals: [] })))).toBeNull());
  it('opens nothing while the connection is unknown (an optional step is no next action then)', () => {
    for (const state of ['stopped', 'conflict', 'degraded'] as const) expect(nextStep(setupSteps(base({ state } as Partial<Channel>))), state).toBeNull();
  });
  it('opens limited privacy before the optional steps', () => expect(nextStep(setupSteps(base({ notes: [{ code: PRIVACY_NOTE, field: 'group_mode' }] as Channel['notes'] })))).toBe('privacy'));
  it('with privacy unknown, opens the first optional step (a group), never the unknown one', () => expect(nextStep(setupSteps(base()))).toBe('group'));
  it('all done: opens nothing', () =>
    expect(nextStep(setupSteps(base({ kind: 'slack', chatRows: [{ kind: 'group', state: 'approved' }] as unknown as Channel['chatRows'], homeChat: { id: 'h' } as unknown as Channel['homeChat'] })))).toBeNull());
});
