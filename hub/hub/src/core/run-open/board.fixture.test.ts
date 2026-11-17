// boardFixtureRoute: a page test answers a boardSend request through the fixture transport by its declared Route.
import { afterEach, describe, expect, it } from 'vitest';
import { resetCore } from '../ctx';
import { boardFixtureRoute, boardSend } from '../index';
import { installTransport, reply, startFixtureMode } from '../transport';

const TARGET = { project: { id: 'p1' }, container: { id: 'c1', server_name: 's1' } };
afterEach(() => { installTransport(null); });

describe('boardFixtureRoute', () => {
  it('names the route boardSend uses: a fixture rule on it answers the request', async () => {
    resetCore();
    startFixtureMode([
      reply(boardFixtureRoute('terminal', 'GET', '/api/v1/terminal/sessions'), { body: { sessions: [{ id: '3' }] } }),
      reply(boardFixtureRoute('terminal', 'DELETE', '/api/v1/terminal/7'), { body: { ok: true } }),
      reply(boardFixtureRoute('notes', 'GET', '/api/v1/notes/notebooks'), { body: { data: [] } }),
    ], { realm: 'aaaaaaaaaaaaaaaaaaaaaaa1', target: TARGET });
    expect(await boardSend({ kit: 'terminal', index: 3 }, 'GET', '/api/v1/terminal/sessions')).toEqual({ sessions: [{ id: '3' }] });
    expect(await boardSend({ kit: 'terminal', index: 7 }, 'DELETE', '/api/v1/terminal/7', { query: { incarnation: '0123456789abcdef0123456789abcdef' } })).toEqual({ ok: true });
    expect(await boardSend({ kit: 'notes', index: 1 }, 'GET', '/api/v1/notes/notebooks')).toEqual({ data: [] });
  });
  it('one Route per declared row, whatever id the path names', () => {
    expect(boardFixtureRoute('terminal', 'DELETE', '/api/v1/terminal/7')).toBe(boardFixtureRoute('terminal', 'DELETE', '/api/v1/terminal/12'));
    expect(boardFixtureRoute('terminal', 'GET', '/api/v1/terminal/sessions')).not.toBe(boardFixtureRoute('terminal', 'POST', '/api/v1/terminal/create'));
  });
  it('a request no row declares throws', () => {
    expect(() => boardFixtureRoute('notes', 'POST', '/api/v1/notes/notebooks')).toThrow(/no Board route/);
    expect(() => boardFixtureRoute('terminal', 'GET', '/api/v1/terminal/sessions?x=1')).toThrow(/no Board route/);
    expect(() => boardFixtureRoute('terminal', 'DELETE', '/api/v1/terminal/abc')).toThrow(/no Board route/);
  });
});
