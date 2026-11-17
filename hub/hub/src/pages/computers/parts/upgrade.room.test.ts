// The page's room rules for the summary strip, Overview, the computer card and
// the create form, and the join from a computer to its server.
import { describe, expect, it } from 'vitest';
import type { Computer, Server } from '../types';
import { cardUpgrade, computerUpgrade, createUpgrade, serverOf, slotsOf, slotsUpgrade } from './upgrade';

const srv = (x: Partial<Server>): Server => ({ id: 's1', name: 'node-1', place: '', cpu: 4, ram: 8, disk: 100, free: false, days: 30, status: 'active', cap: { used: 1, max: 4 }, kind: 'subserver', ...x });
const comp = (x: Partial<Computer>): Computer => ({ id: 'c'.repeat(24), name: 'atlas', status: 'running', project_id: 'p'.repeat(24), ...x }) as Computer;

describe('serverOf: a computer to its server', () => {
  it('by id first, else by name; nothing when the list is not loaded or does not carry it', () => {
    const a = srv({ id: 's1', name: 'node-1' });
    const b = srv({ id: 's2', name: 'node-2' });
    expect(serverOf(comp({ server_id: 's2', server_name: 'node-1' }), [a, b])).toBe(b);
    expect(serverOf(comp({ server_name: 'node-1' }), [a, b])).toBe(a);
    expect(serverOf(comp({ server_id: 's9' }), [a, b])).toBeUndefined();
    expect(serverOf(comp({ server_id: 's1' }), undefined)).toBeUndefined();
  });
});

describe('computerUpgrade: the size upgrade is the server\'s', () => {
  it('a free slice: quiet, near from a meter at 75 %, full when its room is full', () => {
    expect(computerUpgrade(srv({ free: true, kind: 'free' }))).toEqual({ available: 'plan', prominence: 'quiet' });
    expect(computerUpgrade(srv({ free: true, kind: 'free' }), [80, null])).toEqual({ available: 'plan', prominence: 'near' });
    expect(computerUpgrade(srv({ free: true, kind: 'free', cap: { used: 4, max: 4 } }))).toEqual({ available: 'plan', prominence: 'full' });
  });

  it('a paid slice only near or full; a whole machine and an unknown server never', () => {
    expect(computerUpgrade(srv({}))).toEqual({ available: 'none', prominence: 'quiet' });
    expect(computerUpgrade(srv({}), [74.9])).toEqual({ available: 'none', prominence: 'quiet' });
    expect(computerUpgrade(srv({}), [75])).toEqual({ available: 'plan', prominence: 'near' });
    expect(computerUpgrade(srv({ kind: 'metal', cap: { used: 4, max: 4 } }), [99]).available).toBe('none');
    expect(computerUpgrade(undefined, [99]).available).toBe('none');
  });
});

describe('cardUpgrade: a card only near or full', () => {
  it('near from 75 %, full at 100 %, none below or without a reading; never on a whole machine or an unknown server', () => {
    expect(cardUpgrade(srv({ free: true, kind: 'free' }), [10, 74])).toEqual({ available: 'none', prominence: 'quiet' });
    expect(cardUpgrade(srv({ free: true, kind: 'free' }), [10, 75])).toEqual({ available: 'plan', prominence: 'near' });
    expect(cardUpgrade(srv({}), [100, null])).toEqual({ available: 'plan', prominence: 'full' });
    expect(cardUpgrade(srv({}), [null, Number.NaN]).available).toBe('none');
    expect(cardUpgrade(srv({ kind: 'metal' }), [100]).available).toBe('none');
    expect(cardUpgrade(undefined, [100]).available).toBe('none');
  });
});

describe('slotsUpgrade: the summary strip', () => {
  it('read from the total the strip shows, whole machines included; quiet below 75 % only with a free slice, near/full above', () => {
    expect(slotsUpgrade([srv({ free: true, kind: 'free', cap: { used: 1, max: 4 } })])).toEqual({ available: 'plan', prominence: 'quiet' });
    expect(slotsUpgrade([srv({ cap: { used: 1, max: 4 } })]).available).toBe('none');
    expect(slotsUpgrade([srv({ cap: { used: 3, max: 4 } }), srv({ id: 's2', cap: { used: 2, max: 2 } })])).toEqual({ available: 'plan', prominence: 'near' });
    // A full shared server beside an empty whole machine: 4 of 44 is shown, so the link is not "Full" (paid: none below 75 %).
    expect(slotsOf([srv({ cap: { used: 4, max: 4 } }), srv({ id: 'm', kind: 'metal', cap: { used: 0, max: 40 } })])).toEqual({ used: 4, max: 44 });
    expect(slotsUpgrade([srv({ cap: { used: 4, max: 4 } }), srv({ id: 'm', kind: 'metal', cap: { used: 0, max: 40 } })]).available).toBe('none');
    expect(slotsUpgrade([srv({ free: true, kind: 'free', cap: { used: 4, max: 4 } }), srv({ id: 'm', kind: 'metal', cap: { used: 0, max: 40 } })])).toEqual({ available: 'plan', prominence: 'quiet' });
    expect(slotsUpgrade([srv({ cap: { used: 4, max: 4 } }), srv({ id: 'm', kind: 'metal', cap: { used: 36, max: 40 } })])).toEqual({ available: 'plan', prominence: 'near' });
    expect(slotsUpgrade([srv({ cap: { used: 4, max: 4 } }), srv({ id: 'm', kind: 'metal', cap: { used: 40, max: 40 } })])).toEqual({ available: 'plan', prominence: 'full' });
    expect(slotsUpgrade([srv({ kind: 'metal', cap: { used: 4, max: 4 } })]).available).toBe('none');
    expect(slotsUpgrade(undefined).available).toBe('none');
  });
});

describe('createUpgrade: the create form', () => {
  it('quiet only when a server that can grow is full or no room is left; never for a full whole machine alone', () => {
    expect(createUpgrade([srv({ cap: { used: 1, max: 4 } })], 1).available).toBe('none');
    expect(createUpgrade([srv({ cap: { used: 1, max: 4 } }), srv({ id: 's2', cap: { used: 4, max: 4 } })], 1)).toEqual({ available: 'plan', prominence: 'quiet' });
    expect(createUpgrade([srv({ cap: null })], 0)).toEqual({ available: 'plan', prominence: 'quiet' });
    expect(createUpgrade([srv({ kind: 'metal', cap: { used: 4, max: 4 } })], 0).available).toBe('none');
    expect(createUpgrade([srv({ status: 'expired', cap: { used: 4, max: 4 } })], 1).available).toBe('none');
    expect(createUpgrade(undefined, 0).available).toBe('none');
  });
});
