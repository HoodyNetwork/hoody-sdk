// containerRowOf: one computer as every list shows it. Only what the answer carries is shown;
// anything not proved is 'unknown' (state, realms, image, region) or absent, and an unknown status is never stopped.
import { describe, expect, it } from 'vitest';
import { containerRowOf, type ContainerRowView } from './computer';
import { displayName, tint } from './realm';
import type { RealmRow } from './realms';

const R1 = 'aaaaaaaaaaaaaaaaaaaa1111';
const R2 = 'bbbbbbbbbbbbbbbbbbbb2222';
const ID = 'cccccccccccccccccccc9f3e';
const full = {
  id: ID, name: 'glad-silver-falcon', status: 'running', project_id: 'p1', project_alias: 'Main', color: '#3366ff',
  realm_ids: [R1, R2], computer_image: 'ubuntu/24.04', ssh_hostname: 'glad.ssh.example', created_at: '2026-10-01T08:00:00Z',
  server: { name: 'sg-2', city: 'Singapore', country: 'SG' },
};
const realms: RealmRow[] = [{ id: R1, name: { kind: 'alias', text: 'Personal' }, tint: '', computers: 1 }];

describe('containerRowOf: a whole answer', () => {
  const row = containerRowOf(full, realms)!;
  it('keeps every field the answer carries', () => {
    expect(row.id).toBe(ID);
    expect(row.name).toBe('glad-silver-falcon');
    expect(row.state).toBe('running');
    expect(row.image).toEqual({ label: 'Ubuntu 24.04', distro: 'ubuntu' });
    expect(row.region).toEqual({ flag: 'SG', city: 'Singapore', server: 'sg-2' });
    expect(row.project).toBe('Main');
    expect(row.color).toBe('#3366ff');
    expect(row.sshHost).toBe('glad.ssh.example');
    expect(row.createdAt).toBe(Date.parse('2026-10-01T08:00:00Z'));
  });
  it('shows the handle, never the full id, as the name form', () => {
    expect(row.handle).toBe('glad-silver-falcon.9f3e');
    expect(row.handle).not.toContain(ID);
  });
  it('names a listed realm from the realm list, an unlisted one by its short id', () => {
    expect(row.realms).not.toBe('unknown');
    const refs = row.realms as Exclude<ContainerRowView['realms'], 'unknown'>;
    expect(refs.map((r) => r.id)).toEqual([R1, R2]);
    expect(refs[0]!.name).toBe('Personal');
    // The listed row's tint is '' (no colour known), so the ref carries none; the unlisted one takes core's helpers.
    expect('color' in refs[0]!).toBe(false);
    const short = displayName(R2);
    expect(short.kind).toBe('short');
    expect(refs[1]!.name).toBe((short as { text: string }).text);
    expect(refs[1]!.name).not.toBe(R2);
    expect(tint(R2)).not.toBe('');
    expect(refs[1]!.color).toBe(tint(R2));
  });
  it('takes a listed realm\'s own tint over the default colour', () => {
    const own = tint(R1) === 'teal' ? 'pink' : 'teal';
    const listed: RealmRow[] = [{ id: R1, name: { kind: 'alias', text: 'Personal' }, tint: own, computers: 1 }];
    const refs = containerRowOf(full, listed)!.realms as Exclude<ContainerRowView['realms'], 'unknown'>;
    expect(refs[0]).toEqual({ id: R1, name: 'Personal', color: own });
  });
  it('is frozen', () => {
    expect(Object.isFrozen(row)).toBe(true);
  });
});

describe('containerRowOf: what it cannot prove', () => {
  const bare = containerRowOf({ id: ID, name: 'x' }, null)!;
  it('an answer with no status is unknown, never stopped', () => {
    expect(bare.state).toBe('unknown');
    expect(containerRowOf({ id: ID, name: 'x', status: 42 }, null)!.state).toBe('unknown');
    expect(containerRowOf({ id: ID, name: 'x', status: '' }, null)!.state).toBe('unknown');
  });
  it('a paused computer is stopped and an odd status needs attention (computerState)', () => {
    expect(containerRowOf({ id: ID, name: 'x', status: 'paused' }, null)!.state).toBe('stopped');
    expect(containerRowOf({ id: ID, name: 'x', status: 'exploded' }, null)!.state).toBe('attention');
  });
  it('realm_ids absent or malformed is unknown; [] is proven none', () => {
    expect(bare.realms).toBe('unknown');
    expect(containerRowOf({ id: ID, name: 'x', realm_ids: 'r' }, null)!.realms).toBe('unknown');
    expect(containerRowOf({ id: ID, name: 'x', realm_ids: [R1, 'nope'] }, null)!.realms).toBe('unknown');
    expect(containerRowOf({ id: ID, name: 'x', realm_ids: [] }, null)!.realms).toEqual([]);
    expect(containerRowOf({ id: ID, name: 'x', realm_ids: [R1, , R2] }, null)!.realms).toBe('unknown');
  });
  it('a realm id listed twice shows once', () => {
    expect((containerRowOf({ id: ID, name: 'x', realm_ids: [R1, R1] }, realms)!.realms as unknown[]).length).toBe(1);
  });
  it('no image or region is unknown; optional facts are absent, never empty', () => {
    expect(bare.image).toBe('unknown');
    expect(bare.region).toBe('unknown');
    for (const k of ['color', 'project', 'sshHost', 'createdAt'] as const) expect(k in bare).toBe(false);
  });
  it('a server_name alone is a region with only its server', () => {
    expect(containerRowOf({ id: ID, name: 'x', server_name: 'sg-2' }, null)!.region).toEqual({ server: 'sg-2' });
  });
  it('an unreadable created_at is absent', () => {
    expect('createdAt' in containerRowOf({ id: ID, name: 'x', created_at: 'soon' }, null)!).toBe(false);
  });
  it('an impossible calendar date is absent, never rolled over into the next month', () => {
    for (const created_at of ['2026-02-30T08:00:00Z', '2026-13-01T08:00:00Z', '2026-10-01T24:00:00Z', '2026-10-01T08:60:00Z', '2026-10-01', '2026-10-01T08:00:00', 7]) {
      expect('createdAt' in containerRowOf({ id: ID, name: 'x', created_at }, null)!).toBe(false);
    }
  });
  it('keeps a real date-time with fractions or an offset', () => {
    expect(containerRowOf({ id: ID, name: 'x', created_at: '2024-02-29T23:59:59.123456Z' }, null)!.createdAt).toBe(Date.parse('2024-02-29T23:59:59.123Z'));
    expect(containerRowOf({ id: ID, name: 'x', created_at: '2026-10-01T16:00+08:00' }, null)!.createdAt).toBe(Date.parse('2026-10-01T08:00:00Z'));
  });
  it('is not a computer row without a non-empty string id and name', () => {
    for (const raw of [null, undefined, 'x', [], {}, { id: ID }, { name: 'x' }, { id: '', name: 'x' }, { id: ID, name: 7 }]) {
      expect(containerRowOf(raw, null)).toBeNull();
    }
  });
});

describe('ContainerRowView is branded', () => {
  it('a hand-made object is not one', () => {
    // @ts-expect-error a list can show only rows built by containerRowOf
    const forged: ContainerRowView = { id: ID, name: 'x', handle: 'x.9f3e', realms: [], state: 'running' };
    expect(forged.id).toBe(ID);
  });
  it('is exported from core', async () => {
    const core = await import('./index');
    expect(core.containerRowOf).toBe(containerRowOf);
  });
});
