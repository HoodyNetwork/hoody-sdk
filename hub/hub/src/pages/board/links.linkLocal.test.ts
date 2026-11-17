// Vitest: Put on Board for a chat's web port keeps the port's page when it is a route the Board stores; any other
// path (and the query, which Open in a new tab keeps) leaves it at `/`.
import { describe, expect, it } from 'vitest';
import { linkBoardAddPath } from './links';

const C = '0123456789abcdef01234567';
const P = 'fedcba9876543210fedcba98';
const chat = { id: C, project: P, server: 'sg-sin-1' };
const port = (path?: string) => ({ computer: C, project: P, family: 'port' as const, name: 'http', n: '3000', ...(path === undefined ? {} : { path }) });

describe('linkBoardAddPath, a web port with a page', () => {
  it('a plain route is kept', () => {
    expect(linkBoardAddPath(chat, port('/app/orders'))).toBe(`/board?add=port-3000&cid=${C}&path=%2Fapp%2Forders`);
  });
  it('`/`, no path, and a path the Board does not store give the port at `/`', () => {
    for (const p of [undefined, '/', '/a b', '/../x', '/%2e%2e/x', '/x?y=1', `/${'a'.repeat(250)}`]) expect(linkBoardAddPath(chat, port(p))).toBe(`/board?add=port-3000&cid=${C}`);
  });
});
