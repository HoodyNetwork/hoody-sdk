// @vitest-environment node
// Every container field containerRowOf reads (recorded from the implementation)
// is a field of the published containers list answer (the API's openapi.json, GET /api/v1/computers/).
// A row read from a name the API never sends
// shows "unknown" forever with every test green: `image` (the API sends computer_image) and `project_name` (it
// sends project_alias) were two such names.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { monorepoPath } from './test/monorepo';
import { containerRowOf } from './computer';

type Schema = { $ref?: string; properties?: Record<string, Schema>; items?: Schema };
// The Hoody API's published spec is read from the monorepo this Hub sits in (HUB_API_OPENAPI names another file).
// Outside the monorepo there is no spec and the tests that need it are skipped; inside it a missing file fails.
const SPEC_AT = monorepoPath(process.env.HUB_API_OPENAPI, 'hoody-api', 'openapi.json');
const spec = (SPEC_AT === null ? { paths: {} } : JSON.parse(readFileSync(SPEC_AT, 'utf8'))) as Schema & { paths: Record<string, Record<string, { responses: Record<string, { content: Record<string, { schema: Schema }> }> }>> };
const res = (s: Schema | undefined): Schema => {
  let x = s ?? {};
  while (x.$ref) x = x.$ref.split('/').slice(1).reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], spec) as Schema;
  return x;
};
const answer = res(spec.paths['/api/v1/computers/']?.get?.responses['200']?.content['application/json']?.schema);
const item = res(res(res(answer.properties?.data).properties?.computers).items);
const published = new Set(Object.keys(item.properties ?? {}));
const server = new Set(Object.keys(res(item.properties?.server).properties ?? {}));

// The fields containerRowOf actually reads, recorded from the implementation: the raw row (and its server) is a Proxy
// that notes every property read. Two answers, one whole and one empty, so both sides of every `a ?? b` are read.
function readsOf(row: Record<string, unknown>): { top: Set<string>; server: Set<string> } {
  const top = new Set<string>(), server = new Set<string>();
  const spy = <T extends object>(o: T, into: Set<string>): T => new Proxy(o, {
    get: (t, k, r) => { if (typeof k === 'string') into.add(k); return Reflect.get(t, k, r) as unknown; },
    has: (t, k) => { if (typeof k === 'string') into.add(k); return Reflect.has(t, k); },
  });
  const s = row.server && typeof row.server === 'object' ? spy(row.server as object, server) : row.server;
  containerRowOf(spy({ ...row, server: s }, top), null);
  return { top, server };
}
const whole = readsOf({
  id: 'cccccccccccccccccccc9f3e', name: 'n', status: 'running', realm_ids: [], computer_image: 'debian/13', color: '#3366ff',
  project_alias: 'P', ssh_hostname: 'h', created_at: '2026-10-01T08:00:00Z', server: { name: 's', city: 'c', country: 'SG' }, server_name: 's',
});
const empty = readsOf({ id: 'cccccccccccccccccccc9f3e', name: 'n' });
const READS = new Set([...whole.top, ...empty.top]);
const SERVER_READS = new Set([...whole.server, ...empty.server]);

describe.skipIf(SPEC_AT === null)('containerRowOf reads only published container fields', () => {
  it('the spec publishes the containers list answer, and the reads were recorded', () => {
    expect(published.size).toBeGreaterThan(10);
    expect(READS.has('computer_image')).toBe(true);
    expect(SERVER_READS.has('city')).toBe(true);
  });
  it('every field it reads is a published field of a listed container', () => {
    expect([...READS].filter((k) => !published.has(k))).toEqual([]);
  });
  it('every server field it reads is a published field of the container\'s server', () => {
    expect([...SERVER_READS].filter((k) => !server.has(k))).toEqual([]);
  });
  it('image and project_name are not on the wire', () => {
    expect(published.has('image')).toBe(false);
    expect(published.has('project_name')).toBe(false);
  });
});
