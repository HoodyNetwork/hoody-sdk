// @vitest-environment node
// What a fresh share list proves about a change whose answer was lost (changes.ts), and which refusals stay unknown.
import { describe, expect, it } from 'vitest';
import { beforeOf, changeHolds, createHolds, createProved, enabledProved, modeProved, refusalOf, retryProved, stopProved } from './changes';
import { ATLAS_ID, CEDAR_ID, GRANITE_ID, listAnswer, shareWire } from './fixtures';
import { shareListOf, type ShareList } from './wire';

const list = (of: string, ...items: Record<string, unknown>[]): ShareList => ({ ...shareListOf(listAnswer(...items))!, of });
const row = (over: Record<string, unknown> = {}) => shareWire({ target_computer_id: CEDAR_ID, ...over });
const create = { source: ATLAS_ID, path: '/home/ada/projects', target: CEDAR_ID, mode: 'readonly', before: [] as string[] };

describe('a new share', () => {
  it('is proved by a fresh list holding that folder from that computer to that computer', () => {
    expect(createProved(create, [[list(`given:${ATLAS_ID}`, row())]])).toBe('applied');
    expect(createProved(create, [[], [list('allGiven', row())]])).toBe('applied');
  });
  it('is not proved by another folder, another target, another source, or an empty list', () => {
    expect(createProved(create, [[list(`given:${ATLAS_ID}`, row({ source_path: '/home/ada/other' }))]])).toBeUndefined();
    expect(createProved(create, [[list(`given:${ATLAS_ID}`, row({ target_computer_id: GRANITE_ID }))]])).toBeUndefined();
    expect(createProved(create, [[list(`given:${ATLAS_ID}`, row({ source_computer_id: GRANITE_ID }))]])).toBeUndefined();
    expect(createProved(create, [[list(`given:${ATLAS_ID}`)]])).toBeUndefined();
    expect(createProved(create, [])).toBeUndefined();
    expect(createProved({ ...create, target: '' }, [[list(`given:${ATLAS_ID}`, row())]])).toBeUndefined();
  });
  it('is proved only by a share that was not there before the send and has the access that was asked', () => {
    // The share the fresh read before the send already held is not this send's, whatever its access.
    expect(createProved({ ...create, before: ['sh_0001'] }, [[list(`given:${ATLAS_ID}`, row())]])).toBeUndefined();
    expect(createProved({ ...create, mode: 'readwrite', before: ['sh_0001'] }, [[list(`given:${ATLAS_ID}`, row({ mode: 'readwrite' }))]])).toBeUndefined();
    // A new share with other access than was asked is not this send's either.
    expect(createProved({ ...create, mode: 'readwrite' }, [[list(`given:${ATLAS_ID}`, row())]])).toBeUndefined();
    expect(createProved({ ...create, mode: 'readwrite', before: ['sh_0001'] }, [[list(`given:${ATLAS_ID}`, row(), row({ id: 'sh_new', mode: 'readwrite' }))]])).toBe('applied');
    // An attempt whose earlier state was not read (no list, or not a list of ids) never proves anything.
    const { before: _b, ...unread } = create;
    expect(createProved(unread, [[list(`given:${ATLAS_ID}`, row({ id: 'sh_new' }))]])).toBeUndefined();
    expect(createProved({ ...create, before: [7] }, [[list(`given:${ATLAS_ID}`, row({ id: 'sh_new' }))]])).toBeUndefined();
    expect(createProved({ ...create, mode: 'both' }, [[list(`given:${ATLAS_ID}`, row({ id: 'sh_new' }))]])).toBeUndefined();
  });
  it('a 409 is held, and a fresh list holding only the shares there before proves nothing', () => {
    expect(createHolds({ status: 409 })).toBe(true);
    // The old read-only share a stale list left out is in the fresh read before the send: a read-write ask stays unknown.
    expect(createProved({ ...create, mode: 'readwrite', before: ['sh_0001'] }, [[list(`given:${ATLAS_ID}`, row())], [list('allGiven', row())]])).toBeUndefined();
  });
  it('what was there before is read only from a whole list of what that computer gives', () => {
    expect(beforeOf(list(`given:${ATLAS_ID}`, row(), row({ id: 'sh_2', source_path: '/other' }), row({ id: 'sh_3', target_computer_id: GRANITE_ID })), create)).toEqual(['sh_0001']);
    expect(beforeOf(list('allGiven', row()), create)).toEqual(['sh_0001']);
    expect(beforeOf(list(`given:${ATLAS_ID}`), create)).toEqual([]);
    expect(beforeOf({ ...list(`given:${ATLAS_ID}`, row()), dropped: 1 }, create)).toBeNull();
    expect(beforeOf(list(`given:${GRANITE_ID}`), create)).toBeNull();
    expect(beforeOf(list(`received:${ATLAS_ID}`), create)).toBeNull();
    expect(beforeOf({ rows: [], dropped: 0 }, create)).toBeNull();
    expect(beforeOf(undefined, create)).toBeNull();
  });
  it('a 409 stays unknown unless the API named the refusal that writes nothing', () => {
    expect(createHolds({ status: 409 })).toBe(true);
    expect(createHolds({ status: 409, code: 'SHARE_MOUNT_PATH_COLLISION' })).toBe(false);
    expect(createHolds({ status: 400, code: 'SERVER_STORAGE_SHARE_LIMIT' })).toBe(false);
    expect(createHolds({ status: 403 })).toBe(false);
  });
});

describe('a change of one share', () => {
  const id = { share: 'sh_0001', source: ATLAS_ID };
  it('off or on is proved only when the share reads the way it was sent', () => {
    expect(enabledProved({ ...id, enabled: false }, [[list(`given:${ATLAS_ID}`, row({ enabled: false }))]])).toBe('applied');
    expect(enabledProved({ ...id, enabled: false }, [[list(`given:${ATLAS_ID}`, row({ enabled: true }))]])).toBeUndefined();
    expect(enabledProved({ ...id, enabled: true }, [[list(`given:${ATLAS_ID}`, row({ enabled: true }))]])).toBe('applied');
    expect(enabledProved({ ...id, enabled: true }, [[list(`given:${ATLAS_ID}`)]])).toBeUndefined();
    expect(enabledProved({ ...id }, [[list(`given:${ATLAS_ID}`, row())]])).toBeUndefined();
    // Two fresh lists that disagree prove nothing.
    expect(enabledProved({ ...id, enabled: false }, [[list(`given:${ATLAS_ID}`, row({ enabled: false }))], [list('allGiven', row({ enabled: true }))]])).toBeUndefined();
  });
  it('access is proved only by the sent access on that share', () => {
    expect(modeProved({ ...id, mode: 'readwrite' }, [[list(`given:${ATLAS_ID}`, row({ mode: 'readwrite' }))]])).toBe('applied');
    expect(modeProved({ ...id, mode: 'readwrite' }, [[list(`given:${ATLAS_ID}`, row())]])).toBeUndefined();
    expect(modeProved({ ...id, mode: 'readwrite' }, [[list(`given:${ATLAS_ID}`, row({ id: 'sh_other', mode: 'readwrite' }))]])).toBeUndefined();
    expect(modeProved({ ...id, mode: 'both' }, [[list(`given:${ATLAS_ID}`, row())]])).toBeUndefined();
  });
  it('try again is proved only by the share on and no longer failed', () => {
    expect(retryProved(id, [[list(`given:${ATLAS_ID}`, row())]])).toBe('applied');
    expect(retryProved(id, [[list(`given:${ATLAS_ID}`, row({ status: 'failed' }))]])).toBeUndefined();
    expect(retryProved(id, [[list(`given:${ATLAS_ID}`, row({ enabled: false }))]])).toBeUndefined();
  });
  it('a 409 on a change or a stop stays unknown; other refusals are definite', () => {
    expect(changeHolds({ status: 409 })).toBe(true);
    expect(changeHolds({ status: 403 })).toBe(false);
    expect(changeHolds({ status: 404 })).toBe(false);
  });
});

describe('stop sharing', () => {
  const id = { share: 'sh_0001', source: ATLAS_ID, target: CEDAR_ID };
  it('is proved by a fresh whole list of the source, the target or the realm view without the share', () => {
    expect(stopProved(id, [[list(`given:${ATLAS_ID}`)]])).toBe('applied');
    expect(stopProved(id, [[], [list(`received:${CEDAR_ID}`, row({ id: 'sh_other' }))]])).toBe('applied');
    expect(stopProved(id, [[list('allGiven')]])).toBe('applied');
  });
  it('is not proved while any such list still holds it, by another computer\'s list, or by a list with unread rows', () => {
    expect(stopProved(id, [[list(`given:${ATLAS_ID}`, row())]])).toBeUndefined();
    expect(stopProved(id, [[list(`given:${ATLAS_ID}`)], [list('allGiven', row())]])).toBeUndefined();
    expect(stopProved(id, [[list(`given:${GRANITE_ID}`)]])).toBeUndefined();
    expect(stopProved(id, [[list(`received:${ATLAS_ID}`)]])).toBeUndefined();
    expect(stopProved(id, [[list('allReceived')]])).toBeUndefined();
    expect(stopProved(id, [[{ ...list(`given:${ATLAS_ID}`), dropped: 1 }]])).toBeUndefined();
    expect(stopProved(id, [[{ rows: [], dropped: 0 }]])).toBeUndefined();
    expect(stopProved({ share: 'sh_0001' }, [[list(`given:${ATLAS_ID}`)]])).toBeUndefined();
  });
});

describe('refusals the Hub words itself', () => {
  it('maps the codes and statuses it knows, and nothing else', () => {
    expect(refusalOf({ kind: 'failed', code: 'SERVER_STORAGE_SHARE_LIMIT', facts: { status: 400 } })).toBe('limit');
    expect(refusalOf({ kind: 'failed', code: 'SHARE_MOUNT_PATH_COLLISION', facts: { status: 409 } })).toBe('collision');
    expect(refusalOf({ kind: 'failed', code: 'SELF_SHARE' })).toBe('self');
    expect(refusalOf({ kind: 'failed', facts: { status: 403 } })).toBe('owner');
    expect(refusalOf({ kind: 'failed', facts: { status: 400 } })).toBe('path');
    expect(refusalOf({ kind: 'failed', facts: { status: 429 } })).toBeNull();
    expect(refusalOf({ kind: 'pending', facts: { status: 500 } })).toBeNull();
    expect(refusalOf({ kind: 'not_sent' })).toBeNull();
    expect(refusalOf(undefined)).toBeNull();
  });
});
