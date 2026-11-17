// Keys reads GET /computers/:id through core's one route (computerRuntimeRoute), which other
// pages answer too (the whole-Hub run composes every page's rules, first match wins). Every Keys rule on it answers only
// a read without ?runtime, so a runtime read (Computers' runtime list, a chat's local address card) never gets Keys'
// answer, whichever page booted first.
import { describe, expect, it } from 'vitest';
import { computerRuntimeRoute } from '@core';
import fixtures, { isKeysComputerRead } from './fixtures';
import { routes } from './routes';

const req = (query: Record<string, string>) => ({ query });

describe('keys answers core\'s GET /computers/:id only for its own reads', () => {
  it('routes.computer is core\'s route object (one route per endpoint)', () => {
    expect(routes.computer).toBe(computerRuntimeRoute);
  });

  it('the guard takes a read without ?runtime and refuses one with it', () => {
    expect(isKeysComputerRead(req({}))).toBe(true);
    expect(isKeysComputerRead(req({ runtime: 'true' }))).toBe(false);
  });

  it('every Keys rule on the route, in every state, carries the guard', () => {
    const rules = Object.entries(fixtures.states).flatMap(([state, rs]) => rs.filter((r) => r.route === routes.computer).map((r) => [state, r] as const));
    expect(rules.length).toBeGreaterThan(Object.keys(fixtures.states).length - 1); // reason: every state reads the top bar's computer
    const unguarded = rules.filter(([, r]) => !r.when || r.when(req({ runtime: 'true' }) as never) !== false || r.when(req({}) as never) !== true).map(([s]) => s);
    expect(unguarded).toEqual([]);
  });
});
