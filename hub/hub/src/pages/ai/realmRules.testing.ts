// Test rules for aiRealm.ts: the shown realm's computer list (core containersRoute, every realm's computers under All
// realms) with one computer's realm_ids replaced, or left out (`null`: a row that names no realms). Put it first in a
// boot's rules: it answers before core's own list. A .testing file, not a fixtures file: it is no part of the recorded
// demo world, whose source hash takes every fixtures.* file (scripts/term/build/demo-source.ts).
import { containersRoute, fixtureWorld, realmsView, reply, type FixtureRule } from '@core';

export function computerRealms(id: string, realmIds: readonly string[] | null): FixtureRule {
  return reply(containersRoute, () => {
    const r = realmsView().selected;
    const rows: Record<string, unknown>[] = fixtureWorld.computers.map((c) => {
      if (c.id !== id) return { ...c };
      const { realm_ids: _drop, ...rest } = c;
      return realmIds === null ? rest : { ...rest, realm_ids: [...realmIds] };
    });
    const inShown = (c: Record<string, unknown>) => r === 'all' || (Array.isArray(c.realm_ids) && c.realm_ids.includes(r));
    const shown = rows.filter(inShown);
    return { status: 200, body: { data: { computers: shown } } };
  });
}
