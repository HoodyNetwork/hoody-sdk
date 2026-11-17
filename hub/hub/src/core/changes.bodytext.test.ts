// bodyText: a change of a route that sends one text body (bodyText: the whole body is a
// string, such as a proxy URL with a password) needs a lockKey, as a route with secret body keys does.
import { describe, expect, it } from 'vitest';
import { defineMutation, needsLockKey } from './query';
import { defineRoute, type Route } from './routes';

// A real bodyText route (defineRoute marks it secret, routes.ts), as pages define it.
const text = (path: string): Route => defineRoute({ method: 'PUT', path, scope: 'kit', kit: 'egress', index: 1, bodyText: true }) as Route;

describe('needsLockKey: a text-body route counts as secret', () => {
  it('a definition of a bodyText route without a lockKey is refused when it is made', () => {
    expect(() => defineMutation(text('/bt/a'), { input: () => ({}) })).toThrow(/needs a lockKey/);
    expect(() => needsLockKey(text('/bt/b'), undefined)).toThrow(/needs a lockKey/);
  });
  it('with a lockKey it is accepted; a plain route needs none', () => {
    expect(() => defineMutation(text('/bt/c'), { input: () => ({}), lockKey: () => 'proxy' })).not.toThrow();
    expect(() => needsLockKey(defineRoute({ method: 'PUT', path: '/bt/d', scope: 'agent' }), undefined)).not.toThrow();
    expect(() => needsLockKey({ ...defineRoute({ method: 'PUT', path: '/bt/e', scope: 'agent' }), bodyText: false } as Route, undefined)).not.toThrow();
  });
});
