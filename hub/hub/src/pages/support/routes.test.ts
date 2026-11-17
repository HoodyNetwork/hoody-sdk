// Vitest: member routes only. The Support page declares exactly the six member
// operations of the API's support routes, every one under /support/ and on the account's own base host, none a /staff or
// /admin route; create and reply carry the attempt's client_key, close sends no body, and each route declares exactly
// the codes its schema publishes (the table below is written out here so a route edit cannot move both).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { routes } from './routes';

const ANY403 = ['SUPPORT_NOT_FOR_ACCOUNT', 'INSUFFICIENT_PERMISSIONS'];
const WRITE503 = ['SUPPORT_BUSY', 'SUPPORT_STORAGE_FULL', 'SUPPORT_UNAVAILABLE'];
const CODES: Record<string, string[]> = {
  list: ['SUPPORT_FIELD_INVALID', ...ANY403, 'INVALID_CURSOR', 'RATE_LIMIT_EXCEEDED', 'SUPPORT_UNAVAILABLE'],
  get: ['SUPPORT_FIELD_INVALID', ...ANY403, 'SUPPORT_TICKET_NOT_FOUND', 'RATE_LIMIT_EXCEEDED', 'SUPPORT_UNAVAILABLE'],
  create: ['SUPPORT_FIELD_INVALID', 'SUPPORT_TEXT_INVALID', ...ANY403, 'SUPPORT_QUOTA_REACHED', 'SUPPORT_IDEMPOTENCY_CONFLICT', 'SUPPORT_DUPLICATE', 'RATE_LIMIT_EXCEEDED', ...WRITE503],
  reply: [
    'SUPPORT_FIELD_INVALID', 'SUPPORT_TEXT_INVALID', ...ANY403, 'SUPPORT_TICKET_NOT_FOUND', 'SUPPORT_QUOTA_REACHED', 'SUPPORT_TICKET_LIMIT',
    'SUPPORT_TICKET_FULL', 'SUPPORT_TICKET_EXPIRED', 'SUPPORT_IDEMPOTENCY_CONFLICT', 'SUPPORT_DUPLICATE', 'RATE_LIMIT_EXCEEDED', ...WRITE503,
  ],
  close: ['SUPPORT_FIELD_INVALID', ...ANY403, 'SUPPORT_TICKET_NOT_FOUND', 'RATE_LIMIT_EXCEEDED', ...WRITE503],
  limits: ['SUPPORT_FIELD_INVALID', ...ANY403, 'RATE_LIMIT_EXCEEDED', 'SUPPORT_UNAVAILABLE'],
};
const sorted = (a: readonly string[] | null) => [...(a ?? [])].sort();

describe('the Support page calls member routes only', () => {
  it('declares exactly list, get, create, reply, close and limits', () => {
    expect(Object.keys(routes).sort()).toEqual(['close', 'create', 'get', 'limits', 'list', 'reply']);
  });

  it.each(Object.entries(routes))('%s is a /support/ route on the base host', (_name, r) => {
    expect(r.path).toMatch(/^\/support\//);
    expect(r.path).not.toMatch(/staff|admin/i);
    expect(r.scope).toBe('base');
  });

  it.each(Object.keys(CODES))('%s declares the codes of its schema', (name) => {
    expect(sorted(routes[name as keyof typeof routes].codes)).toEqual(sorted(CODES[name]!));
  });

  it('create and reply carry client_key; close sends no body', () => {
    expect(routes.create.body).toContain('client_key');
    expect(routes.reply.body).toContain('client_key');
    expect(routes.close.body).toBeNull();
    expect(routes.create.method).toBe('POST');
    expect(routes.reply.method).toBe('POST');
    expect(routes.close.method).toBe('POST');
  });

  it('no file of the page names a staff or admin support path', () => {
    const dir = __dirname;
    const files = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? files(join(d, f)) : [join(d, f)]));
    const hits = files(dir)
      .filter((f) => /\.(ts|tsx)$/.test(f) && !f.endsWith('.test.ts') && !f.endsWith('.test.tsx'))
      .filter((f) => /['"`]\/(staff|admin)\b|\/staff\/support|\/admin\/support/.test(readFileSync(f, 'utf8')));
    expect(hits).toEqual([]);
  });
});
