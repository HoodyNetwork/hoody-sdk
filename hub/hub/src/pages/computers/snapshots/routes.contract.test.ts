// @vitest-environment node
// The snapshot routes against the Hoody API's published OpenAPI (the API's openapi.json). The fixtures answer
// any route they are given, so a route with the wrong method, path or body key passed every tab test. Contract:
//   - every snapshot route is an operation of the spec (method and path, ids as {id} and {name});
//   - every body key a route declares is a property of that operation's request body (a body-less operation declares
//     none, or an empty list);
//   - the snapshot fields the list read keeps (last_used_at, expires_at, stateful ...) are published fields of a snapshot.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { monorepoPath } from '@core/test/monorepo';
import { snapshotRoutes } from './routes';
import { snapshotsOf } from './logic';

interface Schema { properties?: Record<string, Schema>; items?: Schema }
interface Op { requestBody?: { content?: Record<string, { schema?: Schema }> }; responses?: Record<string, { content?: Record<string, { schema?: Schema }> }> }
// The Hoody API's published spec is read from the monorepo this Hub sits in (HUB_API_OPENAPI names another file).
// Outside the monorepo there is no spec and the tests that need it are skipped; inside it a missing file fails.
const SPEC_AT = monorepoPath(process.env.HUB_API_OPENAPI, 'hoody-api', 'openapi.json');
const spec = (SPEC_AT === null ? { paths: {} } : JSON.parse(readFileSync(SPEC_AT, 'utf8'))) as { paths: Record<string, Record<string, Op>> };

const apiPath = (p: string) => '/api/v1' + p.replace(/:(\w+)/g, '{$1}');
const opOf = (r: { method: string; path: string }): Op | undefined => spec.paths[apiPath(r.path)]?.[r.method.toLowerCase()];

describe.skipIf(SPEC_AT === null)('snapshot routes are operations of the published API', () => {
  for (const [name, route] of Object.entries(snapshotRoutes)) {
    it(`${name}: ${route.method} ${route.path}`, () => {
      const op = opOf(route);
      expect(op, `${route.method} ${apiPath(route.path)} is not in openapi.json`).toBeDefined();
      const props = Object.keys(op?.requestBody?.content?.['application/json']?.schema?.properties ?? {});
      for (const k of route.body ?? []) expect(props, `body key ${k}`).toContain(k);
    });
  }
  it('pins the shape of the three routes added for restore, rename and keep-for', () => {
    expect(snapshotRoutes.restore).toMatchObject({ method: 'PATCH', path: '/computers/:id/snapshots/:name' });
    expect(snapshotRoutes.rename).toMatchObject({ method: 'PATCH', path: '/computers/:id/snapshots/:name/alias' });
    expect(snapshotRoutes.rename.body).toEqual(['alias']);
    expect(snapshotRoutes.create.body).toEqual(['alias', 'expiry']);
  });
});

describe.skipIf(SPEC_AT === null)('the snapshot fields the list read keeps are published', () => {
  it('last_used_at, expires_at, stateful, size, created_at, alias and name are fields of a listed snapshot', () => {
    const list = spec.paths['/api/v1/computers/{id}/snapshots']?.get?.responses?.['200']?.content?.['application/json']?.schema;
    const item = list?.properties?.data?.properties?.snapshots?.items?.properties ?? {};
    for (const k of ['name', 'alias', 'created_at', 'last_used_at', 'expires_at', 'stateful', 'size']) expect(Object.keys(item), k).toContain(k);
    const read = snapshotsOf({ data: { snapshots: [{ name: 'a', alias: 'b', created_at: 'c', last_used_at: 'd', expires_at: 'e', stateful: true, size: 5 }] } }, 'x').items[0];
    expect(read).toEqual({ name: 'a', alias: 'b', createdAt: 'c', lastUsedAt: 'd', expiresAt: 'e', stateful: true, size: 5 });
  });
});
