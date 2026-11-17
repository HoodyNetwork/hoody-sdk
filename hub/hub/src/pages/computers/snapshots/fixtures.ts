// Fake-API rules for the snapshots routes, added to the computers page's fixture states (fixtures.ts spreads them
// into its reads; the pending state passes `pending`). Every computer of the fixture world starts with two snapshots,
// except those listed in `none`; a take adds to that computer's list (with the days asked for as its expiry), a delete
// takes from it, a restore moves the snapshot's last_used_at and a rename changes its alias. A computer made from a snapshot is answered
// but not added to the page's computers list (the page's own rules serve that list, as for its copy).
import { answers, fixtureWorld, reply, type FixtureAnswer, type FixtureRequest, type FixtureRule } from '@core';
import { snapshotRoutes } from './routes';

const cidOf = (r: FixtureRequest): string => /\/computers\/([^/?]+)/.exec(r.path)?.[1] ?? '';
const GB = 1024 ** 3;

export const snapshotRows = [
  { name: 'before-upgrade', alias: 'before-upgrade', created_at: '2026-10-20T09:12:00.000Z', last_used_at: null, expires_at: null, stateful: false, size: 3.2 * GB },
  { name: 'snap-20261018-2140', alias: null, created_at: '2026-10-18T21:40:00.000Z', last_used_at: '2026-10-21T10:00:00.000Z', expires_at: '2026-11-17T21:40:00.000Z', stateful: true, size: 2.9 * GB },
];

/** Tests: every take as it was sent (the body), whatever the answer. */
export const snapshotTakes: unknown[] = [];
/** A new session starts: the takes of the last one are forgotten (computers/fixtures.ts resetFixtureServer). */
export function resetSnapshotTakes(): void {
  snapshotTakes.length = 0;
}

export interface SnapshotRuleOpts {
  /** Take, Delete, Restore, Rename and New computer answer "may have gone through". */
  pending?: boolean;
  /** Computers with no snapshot (default: the world's third computer). */
  none?: readonly string[];
  /** The take refusal to answer instead (an API code), e.g. COMPUTER_SNAPSHOT_LIMIT. */
  refuse?: string;
  /** The list read fails. */
  listFails?: boolean;
  /** The list answers with a row the page cannot read (no name), so it is listed but not complete. */
  partial?: boolean;
}

export function snapshotRules(o: SnapshotRuleOpts = {}): FixtureRule[] {
  const none = new Set(o.none ?? [fixtureWorld.computers[2]?.id ?? '']);
  const unknown = answers.pending5xx(502);
  // Each computer's kept snapshots, so a preview take shows in the list read after it (one store per rule set).
  const kept = new Map<string, Array<Record<string, unknown>>>();
  const rowsOf = (id: string) => {
    let rows = kept.get(id);
    if (!rows) kept.set(id, (rows = none.has(id) ? [] : snapshotRows.map((x) => ({ ...x }))));
    return rows;
  };
  const list = (r: FixtureRequest): FixtureAnswer => {
    const id = cidOf(r);
    const rows = rowsOf(id);
    const sent = o.partial ? [...rows, { alias: null, created_at: '2026-10-01T00:00:00.000Z' }] : rows;
    return answers.ok({ statusCode: 200, data: { computer_id: id, project_id: '', snapshot_count: sent.length, max_snapshots: 10, snapshots: sent } });
  };
  const taken = (r: FixtureRequest): FixtureAnswer => {
    const alias = String((r.body as { alias?: unknown } | undefined)?.alias ?? '');
    const days = Number((r.body as { expiry?: unknown } | undefined)?.expiry);
    const expires = Number.isInteger(days) && days > 0 ? new Date(Date.now() + days * 86_400_000).toISOString() : null;
    const snap = { name: alias, alias, created_at: new Date().toISOString(), last_used_at: null, expires_at: expires, stateful: false, size: 3 * GB };
    rowsOf(cidOf(r)).unshift(snap);
    return answers.ok({ statusCode: 201, data: { computer_id: cidOf(r), snapshot: snap } });
  };
  return [
    reply(snapshotRoutes.list, o.listFails ? answers.refused(500, 'SERVER_ERROR') : list),
    reply(snapshotRoutes.create, (r: FixtureRequest): FixtureAnswer => (snapshotTakes.push(r.body), o.pending ? unknown : o.refuse ? answers.refused(400, o.refuse) : taken(r))),
    reply(snapshotRoutes.remove, o.pending ? unknown : (r: FixtureRequest): FixtureAnswer => {
      const name = decodeURIComponent(r.path.split('?')[0]?.split('/').pop() ?? '');
      const rows = rowsOf(cidOf(r));
      const at = rows.findIndex((x) => x.name === name);
      if (at < 0) return answers.refused(404, 'NOT_FOUND');
      rows.splice(at, 1);
      return answers.ok({ statusCode: 200, data: { snapshot_name: name } });
    }),
    reply(snapshotRoutes.restore, o.pending ? unknown : (r: FixtureRequest): FixtureAnswer => {
      const name = decodeURIComponent(r.path.split('?')[0]?.split('/').pop() ?? '');
      const snap = rowsOf(cidOf(r)).find((x) => x.name === name);
      if (!snap) return answers.refused(404, 'NOT_FOUND');
      snap.last_used_at = new Date().toISOString();
      return answers.ok({ statusCode: 200, data: { success: true, snapshot: snap } });
    }),
    reply(snapshotRoutes.rename, o.pending ? unknown : (r: FixtureRequest): FixtureAnswer => {
      const name = decodeURIComponent(r.path.split('?')[0]?.split('/').slice(-2, -1)[0] ?? '');
      const snap = rowsOf(cidOf(r)).find((x) => x.name === name);
      if (!snap) return answers.refused(404, 'NOT_FOUND');
      snap.alias = (r.body as { alias?: string | null } | undefined)?.alias ?? null;
      return answers.ok({ statusCode: 200, data: { computer_id: cidOf(r), snapshot: snap } });
    }),
    reply(snapshotRoutes.copyFrom, o.pending ? unknown : answers.ok({ statusCode: 201, data: { id: 'f'.repeat(24), status: 'copying' } })),
  ];
}
