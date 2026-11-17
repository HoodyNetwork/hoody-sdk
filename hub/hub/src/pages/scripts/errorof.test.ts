// hoody-exec's write refusals name their cause only in details.code (top-level ERROR_409). The write
// route is secret (its rejection is rebuilt from the route's listed codes), so the cause reaches the page only through
// errorOf: REVISION_MISMATCH and ROUTE_EFFECT_CHANGED arrive as themselves, still with no details or data. A read's raw
// "Script not found" (ERROR_404, details.path only) keeps its meaning for execSaysAbsent.
import { api, type HubError } from '@core';
import { boot, onFetch, R1, TARGET } from '@core/test/env';
import { describe, expect, it } from 'vitest';
import { execSaysAbsent } from './data';
import { routes } from './routes';

const outcome = (p: Promise<unknown>) => p.then((v) => ({ ok: v }), (e: HubError) => e);
const body = { path: 'default/1/notes.ts', content: 'export default 1', ifRevision: null, opId: 'a'.repeat(32), expectRoute: { route: '/notes', answeredBy: 'default/1/notes.ts' } };

describe('scripts write: the kit\'s nested refusal code', () => {
  for (const code of ['REVISION_MISMATCH', 'ROUTE_EFFECT_CHANGED']) {
    it(`${code} in details reaches the page as the code, without details`, async () => {
      boot({ realm: R1 });
      onFetch(() => ({ status: 409, body: { error: 'nothing was changed', code: 'ERROR_409', details: { code, path: body.path, answeredBy: 'default/1/x.ts' } } }));
      const e = (await outcome(api(routes.write, { index: 1, target: TARGET, body }))) as HubError;
      expect(e).toMatchObject({ code, kind: 'refused', status: 409 });
      expect((e as unknown as { details?: unknown }).details).toBeUndefined();
      expect((e as unknown as { data?: unknown }).data).toBeUndefined();
    });
  }
  it('a nested code the route does not list is dropped, as any unlisted code', async () => {
    boot({ realm: R1 });
    onFetch(() => ({ status: 409, body: { code: 'ERROR_409', details: { code: 'SOMETHING_ELSE' } } }));
    expect(await outcome(api(routes.write, { index: 1, target: TARGET, body }))).toMatchObject({ code: null, status: 409 });
  });
  it('a read\'s "Script not found" keeps ERROR_404 in its data: execSaysAbsent unchanged', async () => {
    boot({ realm: R1 });
    onFetch(() => ({ status: 404, body: { error: 'Script not found', code: 'ERROR_404', details: { path: body.path } } }));
    const e = await outcome(api(routes.read, { index: 1, target: TARGET, query: { path: body.path } }));
    expect(e).toMatchObject({ code: 'ERROR_404', status: 404 });
    expect(execSaysAbsent(e, body.path)).toBe(true);
  });
});

// hoody-exec's journal answers a repeated op it has not settled as 409 with the
// cause only in details.code (OP_IN_PROGRESS, OP_OUTCOME_UNKNOWN; top-level ERROR_409). Through errorOf the write route
// reads them as its unknownCodes: pending, never a definite refusal (which would free the hold for a second save).
const journal = (code: string) => ({ status: 409, body: { error: 'not settled yet', code: 'ERROR_409', timestamp: '2026-11-09T00:00:00Z', details: { code, opId: 'a'.repeat(32) } } });

describe('scripts write: the journal\'s unknown outcomes in the real envelope are pending', () => {
  for (const code of ['OP_IN_PROGRESS', 'OP_OUTCOME_UNKNOWN']) {
    it(`409 ERROR_409 with details.code ${code} is pending, never refused`, async () => {
      boot({ realm: R1 });
      onFetch(() => journal(code));
      const e = (await outcome(api(routes.write, { index: 1, target: TARGET, body }))) as HubError;
      expect(e).toMatchObject({ code, kind: 'pending', pending: true, status: 409 });
      expect((e as unknown as { details?: unknown }).details).toBeUndefined();
    });
  }
});

// Every other change route that carries an opId goes through the same journal (hoody-exec's history restore,
// script delete, env, magic comments and script tests), so its repeated op's unknown outcome is pending too.
const OP = 'b'.repeat(32);
const opRoutes: Array<[string, Record<string, unknown>, Parameters<typeof api>[0]]> = [
  ['restore', { index: 1, target: TARGET, body: { path: 'default/1/notes.ts', version: 'v1', ifRevision: 'r1', opId: OP } }, routes.restore],
  ['remove', { index: 1, target: TARGET, query: { path: 'default/1/notes.ts', confirm: 'true', ifRevision: 'r1', opId: OP } }, routes.remove],
  ['envUpdate', { index: 1, target: TARGET, body: { scriptPath: 'default/1/notes.ts', scope: 'script', set: { A: '1' }, ifRevision: 'r1', opId: OP } }, routes.envUpdate],
  ['comments', { index: 1, target: TARGET, body: { path: 'default/1/notes.ts', ifRevision: 'r1', opId: OP, comments: { schedule: null } } }, routes.comments],
  ['testsPut', { index: 1, target: TARGET, body: { scriptPath: 'default/1/notes.ts', cases: [], ifRevision: 'r1', opId: OP } }, routes.testsPut],
  ['testsDelete', { index: 1, target: TARGET, query: { scriptPath: 'default/1/notes.ts', ifRevision: 'r1', opId: OP } }, routes.testsDelete],
];

describe('scripts op routes: the journal\'s unknown outcomes are pending on every change route with an opId', () => {
  for (const [name, args, route] of opRoutes) {
    for (const code of ['OP_IN_PROGRESS', 'OP_OUTCOME_UNKNOWN']) {
      it(`${name}: 409 ERROR_409 with details.code ${code} is pending, never refused`, async () => {
        boot({ realm: R1 });
        onFetch(() => journal(code));
        const e = (await outcome(api(route, args))) as HubError;
        expect(e).toMatchObject({ code, kind: 'pending', pending: true, status: 409 });
      });
    }
    it(`${name}: a listed refusal (409 REVISION_MISMATCH) stays a definite refusal`, async () => {
      boot({ realm: R1 });
      onFetch(() => ({ status: 409, body: { error: 'x', code: 'ERROR_409', details: { code: 'REVISION_MISMATCH' } } }));
      const e = (await outcome(api(route, args))) as HubError;
      expect(e.status).toBe(409);
      expect((e as { pending?: boolean }).pending).not.toBe(true);
      expect(e.kind).not.toBe('pending');
    });
  }
});

