// realmsFixture: a page's fixture world with a long realm list (the create drawer's capped realm list). In a page state's rules it sets the realm list core boots with and the realm names; without it the world's
// realms stand. Nothing touches the network.
import { afterEach, describe, expect, it } from 'vitest';
import { bootFixtureCore, realmsFixture } from './fixture-boot';
import { realmList } from './shell';
import { realmLabel } from './realms';
import { installTransport } from './transport';
import { boot, calls } from './test/env';
import { fixtureWorld } from './world';

afterEach(() => { installTransport(null); boot(); });

const many = Array.from({ length: 18 }, (_, i) => (i + 0x30).toString(16).repeat(12));
const world = fixtureWorld.realms.map((r) => r.id);

describe('realmsFixture', () => {
  it('boots core with the given realms, named by the world and the given aliases', () => {
    bootFixtureCore({ rules: realmsFixture([...world, ...many], { [many[0]!]: 'Staging 01' }) });
    expect(realmList()).toEqual([...world, ...many]);
    expect(realmLabel(many[0]!)).toMatchObject({ kind: 'alias', text: 'Staging 01' });
    expect(realmLabel(world[0]!)).toMatchObject({ kind: 'alias', text: fixtureWorld.realms[0]!.name });
    expect(realmLabel(many[1]!)).toMatchObject({ kind: 'short' });
    expect(calls).toEqual([]);
  });

  it('without it the world realms stand', () => {
    bootFixtureCore({ rules: [] });
    expect(realmList()).toEqual(world);
  });
});
