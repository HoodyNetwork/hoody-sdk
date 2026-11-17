// Get a computer: the image is fixed and no image or cache option is sent, a
// preselected colour is sent but is not a change, and the server list shows room, full servers and a way to
// get a new server.
import { describe, expect, it } from 'vitest';
import { DEFAULT_FORM, NEW_SERVER, type CreateForm, changed, check, serverOptions } from './create-logic';
import type { Server } from './types';

const SV = (p: Partial<Server> & { id: string }): Server => ({ name: p.id, place: 'Paris, France', cc: 'FR', cpu: 4, ram: 8, disk: 80, free: false, days: null, status: 'active', cap: null, ...p });
const servers = [SV({ id: 's1' })];
const form = (p: Partial<CreateForm> = {}): CreateForm => ({ ...DEFAULT_FORM, name: 'my-box', server: 's1', color: '#4ECDC4', colorStart: '#4ECDC4', ...p });
const t = (k: string, v?: Record<string, unknown>) => (v ? `${k}${JSON.stringify(v)}` : k);

describe('create body', () => {
  it('an untouched form sends the name, the server and the shown colour, nothing else', () => {
    const r = check(form(), servers);
    expect(r.ok && r.body).toEqual({ name: 'my-box', server_id: 's1', color: '#4ECDC4' });
  });
  it('never sends an image, cache or cache_image', () => {
    const stale = { ...form(), image: 'ubuntu/24.04', cache: false, cacheImage: true } as CreateForm;
    const r = check(stale, servers);
    expect(r.ok).toBe(true);
    if (r.ok) for (const k of ['computer_image', 'cache', 'cache_image']) expect(r.body).not.toHaveProperty(k);
  });
  it('a colour is sent normalised; one that is not a colour is refused', () => {
    const a = check(form({ color: '#abc' }), servers);
    expect(a.ok && a.body.color).toBe('#AABBCC');
    const b = check(form({ color: 'teal' }), servers);
    expect(!b.ok && b.errors.color).toBe('color');
  });
  it('no colour sends none', () => {
    const r = check(form({ color: '', colorStart: '' }), servers);
    expect(r.ok && r.body).not.toHaveProperty('color');
  });
  it('the never-picked-a-server marker is never a server', () => {
    const r = check(form({ server: NEW_SERVER }), servers);
    expect(!r.ok && r.errors.server).toBe('server');
  });
});

describe('changed', () => {
  it('the preselected colour is not a change; another one is', () => {
    expect(changed(form())).toEqual([]);
    expect(changed(form({ color: '#abc' }))).toEqual(['color']);
    expect(changed(form({ color: '#4ecdc4' }))).toEqual([]);
  });
  it('has no image or cache entries', () => {
    const stale = { ...form(), image: 'x', cache: false, cacheImage: true } as CreateForm;
    expect(changed(stale)).toEqual([]);
  });
});

describe('serverOptions', () => {
  it('shows used of max where the API gives it, and full servers last and disabled', () => {
    const o = serverOptions([SV({ id: 'full', free: true, cap: { used: 3, max: 3 } }), SV({ id: 'room', free: true, cap: { used: 2, max: 3 } })], { t, computers: undefined, inRealm: false, market: false });
    expect(o.map((x) => x.value)).toEqual(['room', 'full']);
    expect(o[0]?.label).toContain('server.cap{"used":2,"max":3}');
    expect(o[0]?.isDisabled).toBeFalsy();
    expect(o[1]?.isDisabled).toBe(true);
    expect(o[1]?.description).toBe('create.serverFull');
  });
  it('counts computers on a dedicated server outside a realm, and shows no count inside one', () => {
    const computers = [{ server_id: 'd1' }, { server_id: 'd1' }, { server_id: 'other' }];
    const out = serverOptions([SV({ id: 'd1' })], { t, computers, inRealm: false, market: false });
    expect(out[0]?.label).toContain('create.serverCount{"count":2}');
    const inside = serverOptions([SV({ id: 'd1' })], { t, computers, inRealm: true, market: false });
    expect(inside[0]?.label).not.toContain('create.serverCount');
    const free = serverOptions([SV({ id: 'f1', free: true })], { t, computers, inRealm: false, market: false });
    expect(free[0]?.label).not.toContain('create.serverCount');
  });
  it('shows no used of max inside a realm, even when a count is given', () => {
    const o = serverOptions([SV({ id: 'room', free: true, cap: { used: 2, max: 3 } })], { t, computers: undefined, inRealm: true, market: false });
    expect(o[0]?.label).not.toContain('server.cap');
  });
  it('ends with "get a new server" when the market can be reached', () => {
    const o = serverOptions(servers, { t, computers: undefined, inRealm: false, market: true });
    expect(o.at(-1)).toMatchObject({ value: NEW_SERVER, label: 'create.newServer' });
    expect(serverOptions(servers, { t, computers: undefined, inRealm: false, market: false }).some((x) => x.value === NEW_SERVER)).toBe(false);
  });
  it('leaves out servers that are not active', () => {
    const o = serverOptions([SV({ id: 'off', status: 'suspended' }), SV({ id: 'on' })], { t, computers: undefined, inRealm: false, market: false });
    expect(o.map((x) => x.value)).toEqual(['on']);
  });
});
