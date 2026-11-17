// @vitest-environment node
// The access write against the Hoody API's published OpenAPI (the API's openapi.json). The fixtures answer
// any route they are given, so a wrong method, path, body key or a missing If-Match passed every drawer test.
// Contract: the route is an operation of the spec that takes If-Match, its body keys are the operation's
// properties and cover every required one, and each document the drawer writes carries only published keys.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { monorepoPath } from '@core/test/monorepo';
import { accessRoutes } from './data';
import { bodyFor, modeOf, rulesFrom } from './parts/access.logic';

interface Schema { properties?: Record<string, Schema>; required?: string[] }
interface Op { parameters?: { name?: string; in?: string }[]; requestBody?: { content?: Record<string, { schema?: Schema }> } }
// The Hoody API's published spec is read from the monorepo this Hub sits in (HUB_API_OPENAPI names another file).
// Outside the monorepo there is no spec and the tests that need it are skipped; inside it a missing file fails.
const SPEC_AT = monorepoPath(process.env.HUB_API_OPENAPI, 'hoody-api', 'openapi.json');
const spec = (SPEC_AT === null ? { paths: {} } : JSON.parse(readFileSync(SPEC_AT, 'utf8'))) as { paths: Record<string, Record<string, Op>> };
const apiPath = (p: string) => '/api/v1' + p.replace(/:(\w+)/g, '{$1}');
const op = spec.paths[apiPath(accessRoutes.set.path)]?.[accessRoutes.set.method.toLowerCase()];
const schema = op?.requestBody?.content?.['application/json']?.schema;

const PROJECT = 'a1b2c3d4e5f6a1b2c3d4e5f6';
const CONTAINER = 'c0a7150000000000000000c3';

describe.skipIf(SPEC_AT === null)('the access write is an operation of the published API', () => {
  it('PUT /computers/:id/proxy/permissions exists and takes If-Match, which the route sends', () => {
    expect(op, `${accessRoutes.set.method} ${apiPath(accessRoutes.set.path)} is not in openapi.json`).toBeDefined();
    expect(op?.parameters?.some((p) => p.in === 'header' && p.name?.toLowerCase() === 'if-match')).toBe(true);
    expect(accessRoutes.set).toMatchObject({ method: 'PUT', ifMatch: true, secret: true });
  });

  it('every body key is published and every required key is declared', () => {
    const props = Object.keys(schema?.properties ?? {});
    for (const k of accessRoutes.set.body ?? []) expect(props, `body key ${k}`).toContain(k);
    for (const k of schema?.required ?? []) expect(accessRoutes.set.body, `required ${k}`).toContain(k);
  });

  it('each document the drawer writes carries only published keys and every required one', () => {
    const rules = rulesFrom({ data: { project: PROJECT, container: CONTAINER, groups: {}, permissions: {}, default: 'allow', file_version: 3 } })!;
    const mode = modeOf(rules, 'no');
    const props = Object.keys(schema?.properties ?? {});
    for (const want of [{ kind: 'anyone' }, { kind: 'private' }, { kind: 'myIp', ip: '203.0.113.7' }] as const) {
      const body = bodyFor(rules, mode, want, CONTAINER);
      expect(body, want.kind).not.toBeNull();
      for (const k of Object.keys(body ?? {})) expect(props, `${want.kind}: ${k}`).toContain(k);
      for (const k of schema?.required ?? []) expect(body, `${want.kind}: required ${k}`).toHaveProperty(k);
    }
  });

  // "Only people or keys I pick": each step is its own operation, each taking If-Match; the bodies the step changes
  // send (data.ts) carry only published keys and every required one (the token write takes exactly one place).
  const steps = [['person', ['username', 'password', 'salt']], ['key', ['param', 'value']], ['grant', ['program', 'access']], ['deny', ['default']], ['drop', []]] as const;
  for (const [name, sent] of steps) {
    it(`the ${name} step is a published operation that takes If-Match, with the keys it sends`, () => {
      const route = accessRoutes[name];
      const o = spec.paths[apiPath(route.path)]?.[route.method.toLowerCase()];
      expect(o, `${route.method} ${apiPath(route.path)} is not in openapi.json`).toBeDefined();
      expect(o?.parameters?.some((p) => p.in === 'header' && p.name?.toLowerCase() === 'if-match')).toBe(true);
      expect(route).toMatchObject({ ifMatch: true, secret: true });
      expect([...(route.body ?? [])].sort()).toEqual([...sent].sort());
      const sch = o?.requestBody?.content?.['application/json']?.schema as (Schema & { oneOf?: Schema[] }) | undefined;
      // A oneOf body (the token write): the keys sent must be exactly one alternative's properties.
      const alts = sch?.oneOf ?? (sch ? [sch] : []);
      if (sent.length === 0) return;
      expect(alts.some((a) => sent.every((k) => k in (a.properties ?? {})) && (a.required ?? []).every((k) => (sent as readonly string[]).includes(k)))).toBe(true);
    });
  }
});
