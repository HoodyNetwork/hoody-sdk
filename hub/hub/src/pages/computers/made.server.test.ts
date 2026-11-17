// A held create, copy or computer made from a snapshot is proved only by a new computer on the server it was sent to
// (data.ts listMadeNew `server`). The list leaves out computers the API's name check still sees, such as one on a
// pooled server the person is not admitted to, which a later read shows once they are. That server is one the person
// could not have sent the change to: a same-name row on another server never proves the change. A hold recorded
// before `server` was kept (no `server` in its identity) is proved by no server, never by "any server": it stays held
// until the person's warned Dismiss.
import { describe, expect, it } from 'vitest';
import { computersTable, listMadeNew, sentServer } from './data';
import { snapshotsTable } from './snapshots/data';

const P = 'p'.repeat(24);
const X = 'x'.repeat(24);
const Y = 'y'.repeat(24);
const S1 = '1'.repeat(24);
const S2 = '2'.repeat(24);
/** A new computer of the sent name in the sent project (not in `before`), on `server` (none when undefined). */
const made = (server?: string) => ({ id: Y, name: 'web', project_id: P, realm_ids: [], ...(server === undefined ? {} : { server_id: server }) });

const changes = {
  create: { identity: () => computersTable.changes!.create!.identity!({ project: P, body: { name: 'web', server_id: S1 }, before: [], realm: 'all' } as never), proves: computersTable.changes!.create!.proves! },
  copy: { identity: () => computersTable.changes!.copy!.identity!({ id: X, name: 'web', project: P, server: S1, before: [], realm: 'all' } as never), proves: computersTable.changes!.copy!.proves! },
  copyFrom: {
    identity: () => snapshotsTable.changes!.copyFrom!.identity!({ id: X, snapshot: 's', name: 'web', project: P, server: S1, before: [], realm: 'all' } as never),
    proves: snapshotsTable.changes!.copyFrom!.proves!,
  },
};

describe.each(Object.keys(changes) as Array<keyof typeof changes>)('%s: proved only on the server it was sent to', (k) => {
  const { identity, proves } = changes[k];
  const judge = (id: unknown, row: Record<string, unknown>) => proves(id, [[row]] as never);

  it('the held identity keeps the server sent', () => {
    expect(identity()).toMatchObject({ server: S1 });
  });

  it('a same-name computer on another server proves nothing', () => {
    expect(judge(identity(), made(S2))).toBeUndefined();
  });

  it('a row that names no server proves nothing', () => {
    expect(judge(identity(), made())).toBeUndefined();
  });

  it('the same computer on the sent server proves it', () => {
    expect(judge(identity(), made(S1))).toBe('applied');
  });

  it('a hold recorded before `server` was kept is proved by no server', () => {
    const { server, ...legacy } = identity() as Record<string, unknown>;
    expect(server).toBe(S1);
    for (const row of [made(S1), made(S2), made()]) expect(judge(legacy, row)).toBeUndefined();
  });
});

describe('listMadeNew: only a server id counts as a server', () => {
  it('an empty or non-string `server` is none', () => {
    for (const server of ['', 1, null, ['x']]) {
      expect(listMadeNew({ project: P, name: 'web', before: [], realm: 'all', server }, [[made(S1)]])).toBeUndefined();
    }
  });

  it('a create whose body names no server keeps no `server`, and nothing proves it', () => {
    const id = computersTable.changes!.create!.identity!({ project: P, body: { name: 'web' }, before: [], realm: 'all' } as never);
    expect(id).not.toHaveProperty('server');
    expect(listMadeNew(id, [[made(S1)]])).toBeUndefined();
    expect(sentServer('')).toEqual({});
    expect(sentServer(S1)).toEqual({ server: S1 });
  });
});
