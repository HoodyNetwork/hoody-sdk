// The edit form's choices are the agent's own. The memory types, the tiers and the longest expiry
// are read from the agent's Go source (its type list, its tier list and its longest expiry),
// and every field the edit route sends must be one the agent's PATCH /memory/items/{id} publishes (openapi.json), so a
// list the agent changes fails here until the page follows.
// The source is HUB_AGENT_SRC, else the agent's source in the monorepo this Hub sits in (found by
// monorepoPath, so no env is needed there). A tree that cannot see the agent at all skips this file with a loud
// reason rather than failing; a source that is there but disagrees, or lacks a file named here, fails.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { monorepoPath } from '@core/test/monorepo';
import { memoryRoutes } from './data';
import { MAX_TTL_DAYS, MEMORY_TIERS, MEMORY_TYPES } from './logic';

const AGENT = monorepoPath(process.env.HUB_AGENT_SRC, 'hoody-kit', 'hoody-agent');
const HAVE = AGENT !== null && existsSync(`${AGENT}/internal/daemon/memory`);
if (!HAVE) console.error(`logic.agent.test.ts SKIPPED: no agent source at ${AGENT ?? 'any known place'} (set HUB_AGENT_SRC); the memory edit lists are not pinned in this run`);
const go = (f: string) => readFileSync(`${AGENT}/internal/daemon/memory/${f}`, 'utf8');

/** The keys of a Go `var name = map[string]bool{"a": true, ...}` literal, in source order. */
function mapKeys(src: string, name: string): string[] {
  const m = new RegExp(`var ${name} = map\\[string\\]bool\\{([^}]*)\\}`).exec(src);
  if (!m) throw new Error(`no ${name} in the agent source`);
  const keys = [...m[1]!.matchAll(/"([a-z_]+)":\s*true/g)].map((k) => k[1]!);
  if (keys.length === 0) throw new Error(`${name} has no keys`);
  return keys;
}

describe.skipIf(!HAVE)('the edit form offers what the agent takes', () => {
  it('the six memory types are validMemoryTypes', () => {
    expect([...MEMORY_TYPES].sort()).toEqual(mapKeys(go('remember.go'), 'validMemoryTypes').sort());
  });
  it('the four tiers are validTiers', () => {
    expect([...MEMORY_TIERS].sort()).toEqual(mapKeys(go('edit.go'), 'validTiers').sort());
  });
  it('the longest expiry is MaxTTLDays (MaxInt64 nanoseconds in whole days)', () => {
    expect(go('remember.go')).toMatch(/const MaxTTLDays = int\(math\.MaxInt64 \/ int64\(24\*time\.Hour\)\)/);
    expect(BigInt(MAX_TTL_DAYS)).toBe(9223372036854775807n / (24n * 3600n * 1_000_000_000n));
  });
  it('every body field the edit sends is one the agent publishes for PATCH /memory/items/{id}', () => {
    const spec = JSON.parse(readFileSync(`${AGENT}/internal/httpapi/openapi.json`, 'utf8')) as { paths: Record<string, { patch?: { requestBody?: { content?: Record<string, { schema?: { properties?: Record<string, unknown> } }> } } }> };
    const path = Object.keys(spec.paths).find((p) => p.endsWith('/memory/items/{id}'));
    const props = path ? spec.paths[path]?.patch?.requestBody?.content?.['application/json']?.schema?.properties : undefined;
    if (!props) throw new Error('no PATCH /memory/items/{id} body in the agent spec');
    for (const k of memoryRoutes.edit.body ?? []) expect(Object.keys(props), k).toContain(k);
    for (const k of ['concepts', 'files', 'tier', 'ttl_days', 'context', 'confidence']) expect(memoryRoutes.edit.body).toContain(k);
  });
});
