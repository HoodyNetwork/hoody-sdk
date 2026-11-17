// Vitest: every path the page's rules build resolves to a declared route, with only declared query keys.
import { describe, expect, it } from 'vitest';
import { resolveKit, split } from './api';
import { routes } from './routes';
import * as R from './rules';

const declared = (route: { query?: readonly string[] }, path: string) => {
  const keys = Object.keys(split(path).query);
  return keys.every((k) => (route.query || []).includes(k));
};

describe('declared routes', () => {
  const made = R.predicate({ source: 'everything', severity: 'problems', window: '1h', search: '/report' }, 1_700_000_000_000);
  if (!made.ok) throw new Error('predicate: ' + made.code);
  const P = made.P;

  it('the list path resolves to the logs route and sends only declared keys', () => {
    const path = R.kitPath(P, null, 100);
    expect(path).toBeTruthy();
    const r = resolveKit('logs', path as string);
    expect(r?.route).toBe(routes.list);
    expect(declared(routes.list, path as string)).toBe(true);
  });

  it('the stats path resolves to the stats route and sends only declared keys', () => {
    const path = R.statsPath(P, 1_700_000_000_000);
    expect(path).toBeTruthy();
    expect(resolveKit('logs', path as string)?.route).toBe(routes.stats);
    expect(declared(routes.stats, path as string)).toBe(true);
  });

  it('a program output path resolves with its id as a parameter', () => {
    const path = R.programPath({ id: '12', channel: 'stderr', lines: 500, port: 8001 });
    const r = resolveKit('daemon', path as string);
    expect(r?.route).toBe(routes.programLogs);
    expect(r?.params).toEqual({ id: '12' });
    expect(declared(routes.programLogs, path as string)).toBe(true);
  });

  it('an undeclared path is refused unsent', () => {
    expect(resolveKit('logs', '/_logs/other')).toBeNull();
    expect(resolveKit('daemon', '/api/v1/daemon/programs/1/stop')).toBeNull();
    expect(resolveKit('exec', '/api/v1/exec/anything')).toBeNull();
  });
});
