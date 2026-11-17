// @vitest-environment node
// The storage share routes against the Hoody API's published OpenAPI (the API's openapi.json). The fixtures
// answer any route they are given, so a route with the wrong method, path or key would pass every section test.
// Contract:
//   - every share route is an operation of the spec (method and path, ids as {id} and {shareId});
//   - every body key a route declares is a property of that operation's request body, every query key one of its
//     query parameters;
//   - every field wire.ts reads is a published field of a share (source list, incoming list, create answer), with the
//     enums it relies on. mount_path is the one field an older copy of the spec may still lack (it predates the
//     field; the API tip publishes it): allowed missing, never required missing, so a refreshed spec passes as is.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { monorepoPath } from '@core/test/monorepo';
import { shareRoutes } from './routes';

interface Schema { properties?: Record<string, Schema>; items?: Schema; enum?: readonly string[] }
interface Param { name: string; in: string }
interface Op {
  parameters?: readonly Param[];
  requestBody?: { content?: Record<string, { schema?: Schema }> };
  responses?: Record<string, { content?: Record<string, { schema?: Schema }> }>;
}
// The Hoody API's published spec is read from the monorepo this Hub sits in (HUB_API_OPENAPI names another file).
// Outside the monorepo there is no spec and the tests that need it are skipped; inside it a missing file fails.
const SPEC_AT = monorepoPath(process.env.HUB_API_OPENAPI, 'hoody-api', 'openapi.json');
const spec = (SPEC_AT === null ? { paths: {} } : JSON.parse(readFileSync(SPEC_AT, 'utf8'))) as { paths: Record<string, Record<string, Op>> };

const apiPath = (p: string) => '/api/v1' + p.replace(/:(\w+)/g, '{$1}');
const opOf = (r: { method: string; path: string }): Op | undefined => spec.paths[apiPath(r.path)]?.[r.method.toLowerCase()];
const answerOf = (op: Op | undefined, status: string): Schema | undefined => op?.responses?.[status]?.content?.['application/json']?.schema?.properties?.data;

// The fields wire.ts shareRowOf reads.
const READ = ['id', 'source_computer_id', 'source_path', 'mount_path', 'target_type', 'target_computer_id', 'target_project_id', 'mode', 'enabled', 'status', 'status_message', 'expires_at'];
const NOT_YET_IN_STAGE_SPEC = new Set(['mount_path']);

function missingFrom(item: Schema | undefined): string[] {
  const props = Object.keys(item?.properties ?? {});
  return READ.filter((k) => !props.includes(k) && !NOT_YET_IN_STAGE_SPEC.has(k));
}

describe.skipIf(SPEC_AT === null)('share routes are operations of the published API', () => {
  for (const [name, route] of Object.entries(shareRoutes)) {
    it(`${name}: ${route.method} ${route.path}`, () => {
      const op = opOf(route);
      expect(op, `${route.method} ${apiPath(route.path)} is not in openapi.json`).toBeDefined();
      const props = Object.keys(op?.requestBody?.content?.['application/json']?.schema?.properties ?? {});
      for (const k of route.body ?? []) expect(props, `body key ${k}`).toContain(k);
      const query = (op?.parameters ?? []).filter((p) => p.in === 'query').map((p) => p.name);
      for (const k of route.query) expect(query, `query key ${k}`).toContain(k);
    });
  }
  it('pins the nine routes: one per published tenant operation, the delete on the account path', () => {
    expect(Object.values(shareRoutes).map((r) => `${r.method} ${r.path}`).sort()).toEqual([
      'DELETE /storage/shares/:shareId',
      'GET /computers/:id/storage/incoming',
      'GET /computers/:id/storage/shares',
      'GET /computers/:id/storage/shares/:shareId',
      'GET /storage/incoming',
      'GET /storage/shares',
      'PATCH /computers/:id/storage/incoming/:shareId/mount',
      'PATCH /computers/:id/storage/shares/:shareId',
      'POST /computers/:id/storage/shares',
    ]);
    for (const r of Object.values(shareRoutes)) expect(r.scope, `${r.method} ${r.path}`).toBe('realm');
  });
  it('a create names one computer, never a project (a project target is refused under a realm)', () => {
    expect(shareRoutes.create.body).toEqual(['source_path', 'mode', 'target_computer_id', 'expires_at']);
    expect(shareRoutes.create.body).not.toContain('target_project_id');
    expect(shareRoutes.update.body).toEqual(['mode', 'enabled', 'expires_at']);
  });
});

describe.skipIf(SPEC_AT === null)('the share fields the Hub reads are published', () => {
  it('a listed share (source side) carries every field read', () => {
    const item = answerOf(opOf(shareRoutes.list), '200')?.items;
    expect(item?.properties, 'list item schema').toBeDefined();
    expect(missingFrom(item)).toEqual([]);
  });
  it('a received share carries every field read', () => {
    for (const r of [shareRoutes.incoming, shareRoutes.allIncoming]) {
      const item = answerOf(opOf(r), '200')?.items;
      expect(item?.properties, `${r.path} item schema`).toBeDefined();
      expect(missingFrom(item), r.path).toEqual([]);
    }
  });
  it('a created share and an updated one carry every field read', () => {
    expect(missingFrom(answerOf(opOf(shareRoutes.create), '201'))).toEqual([]);
    expect(missingFrom(answerOf(opOf(shareRoutes.update), '200'))).toEqual([]);
  });
  it('mode, status and target_type are the enums the Hub reads, nothing more', () => {
    const p = answerOf(opOf(shareRoutes.list), '200')?.items?.properties ?? {};
    expect([...(p.mode?.enum ?? [])].sort()).toEqual(['readonly', 'readwrite']);
    expect([...(p.status?.enum ?? [])].sort()).toEqual(['active', 'failed']);
    expect([...(p.target_type?.enum ?? [])].sort()).toEqual(['computer', 'project']);
  });
});
