// Every request the page declares must be an operation the files program documents (its openapi.json),
// or the kit answers 404: the top folder is listRootDirectory (GET /?json), never the bare files path.
import { describe, expect, it } from 'vitest';
import * as routes from './routes';

// The files program's openapi.json: method + path template of the operations this page may use.
const DOCUMENTED = [
  'GET /', // listRootDirectory (?json: the listing as JSON)
  'GET /api/v1/files/{path}', 'POST /api/v1/files/{path}', 'PATCH /api/v1/files/{path}', 'DELETE /api/v1/files/{path}',
  'PUT /api/v1/files/{path}', // putFile (an upload, create only)
  'GET /api/v1/files/realpath/{path}',
  'GET /api/v1/mounts',
];
type R = { method: string; path: string; query: readonly string[] };
const all = (): R[] => Object.values(routes).flatMap((v): unknown[] => (Array.isArray(v) ? v : [v])).filter((v): v is R => typeof v === 'object' && v !== null && 'path' in v);
const template = (r: R) => `${r.method} ${r.path.replace(/\/\*parts$/, '/{path}')}`;

describe('files routes', () => {
  it('declares only documented operations', () => {
    const rs = all();
    expect(rs.length).toBeGreaterThan(0);
    for (const r of rs) expect(DOCUMENTED, template(r)).toContain(template(r));
  });
  it('lists the top folder through listRootDirectory as JSON', () => {
    expect(template(routes.rootRoute)).toBe('GET /');
    expect(routes.rootRoute.query).toContain('json');
  });
  // One route per operation, the item as one multi-part path that core writes (an alias first part as %XX).
  it('takes every item as one multi-part path: one route per operation, no per-depth routes', () => {
    for (const r of all()) expect(r.path, template(r)).not.toMatch(/:p\d/);
    for (const k of Object.keys(routes)) expect(k).not.toMatch(/Routes$/);
    for (const r of [routes.folderRoute, routes.mkdirRoute, routes.renameRoute, routes.deleteRoute, routes.copyRoute, routes.moveRoute, routes.hashRoute, routes.putRoute, routes.archiveListRoute, routes.extractRoute])
      expect(r.path).toBe('/api/v1/files/*parts');
    expect(routes.realpathRoute.path).toBe('/api/v1/files/realpath/*parts');
  });
  it('gives a recursive delete a 6 h timeout, never a short cut that loses its outcome', () => {
    expect((routes.deleteRoute as unknown as { timeoutMs?: number }).timeoutMs).toBe(6 * 60 * 60 * 1000);
  });
  it('upload: a file body with a 6 h timeout (a 10 GiB file)', () => {
    const x = routes.putRoute as unknown as { method: string; file?: boolean; timeoutMs?: number };
    expect([x.method, x.file, x.timeoutMs]).toEqual(['PUT', true, 6 * 60 * 60 * 1000]);
  });
  it('copy, move and the SHA-256 read: a 6 h timeout, a partly done folder copy unknown', () => {
    const six = 6 * 60 * 60 * 1000;
    const t = (r: unknown) => (r as { timeoutMs?: number }).timeoutMs;
    for (const [r, method, q] of [[routes.copyRoute, 'POST', 'copy_to'], [routes.moveRoute, 'POST', 'move_to'], [routes.hashRoute, 'GET', 'hash']] as const) {
      expect([r.method, r.query, t(r)]).toEqual([method, [q], six]);
    }
    // 409 COPY_INCOMPLETE: a folder copy stopped after it changed its destination (the kit's own answer).
    expect((routes.copyRoute as unknown as { unknownCodes?: readonly string[] }).unknownCodes).toEqual(['COPY_INCOMPLETE']);
    expect((routes.moveRoute as unknown as { unknownCodes?: readonly string[] }).unknownCodes ?? []).toEqual([]);
  });
  it('archives: look inside and extract, extract with a 6 h timeout; history at its documented path', () => {
    expect([routes.archiveListRoute.method, routes.archiveListRoute.query]).toEqual(['GET', ['preview']]);
    expect([routes.extractRoute.method, routes.extractRoute.query]).toEqual(['POST', ['extract', 'dest']]);
    expect((routes.extractRoute as unknown as { timeoutMs?: number }).timeoutMs).toBe(6 * 60 * 60 * 1000);
    expect(template(routes.extractHistoryRoute)).toBe('GET /');
    expect(routes.extractHistoryRoute.query).toEqual(['extraction_history']);
  });
});
