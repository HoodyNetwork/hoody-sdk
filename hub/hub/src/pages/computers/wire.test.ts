// @vitest-environment node
// The computers fixtures send only what the API sends. Every key of a fixture
// computer row, and every field the page's Computer type declares, is a field of the published containers list answer
// (the API's openapi.json), so a page read of an invented key (the old `image`; the API's field is
// computer_image) cannot stay green on fixtures alone.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { monorepoPath } from '@core/test/monorepo';
import { computers } from './fixtures';

type Schema = { $ref?: string; properties?: Record<string, Schema>; items?: Schema };
// The Hoody API's published spec is read from the monorepo this Hub sits in (HUB_API_OPENAPI names another file).
// Outside the monorepo there is no spec and the tests that need it are skipped; inside it a missing file fails.
const SPEC_AT = monorepoPath(process.env.HUB_API_OPENAPI, 'hoody-api', 'openapi.json');
const spec = (SPEC_AT === null ? { paths: {} } : JSON.parse(readFileSync(SPEC_AT, 'utf8'))) as Schema & { paths: Record<string, Record<string, { responses: Record<string, { content: Record<string, { schema: Schema }> }> }>> };
const res = (s: Schema | undefined): Schema => {
  let x = s ?? {};
  while (x.$ref) x = x.$ref.split('/').slice(1).reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], spec) as Schema;
  return x;
};
const answer = res(spec.paths['/api/v1/computers/']?.get?.responses['200']?.content['application/json']?.schema);
const item = res(res(res(answer.properties?.data).properties?.computers).items);
const published = new Set(Object.keys(item.properties ?? {}));

describe.skipIf(SPEC_AT === null)('the computers fixtures send only published container fields', () => {
  it('there are fixture computers and a published answer to check them against', () => {
    expect(computers.length).toBeGreaterThan(0);
    expect(published.has('computer_image')).toBe(true);
  });
  it('every key of every fixture computer is a published field', () => {
    const extra = new Set<string>();
    for (const c of computers) for (const k of Object.keys(c)) if (!published.has(k)) extra.add(k);
    expect([...extra]).toEqual([]);
  });
  it("every field the page's Computer type declares is a published field", () => {
    // The interface's own keys, read from the source (types are erased at run time).
    const src = readFileSync(new URL('./types.ts', import.meta.url), 'utf8');
    const body = /export interface Computer \{([\s\S]*?)\n\}/.exec(src)?.[1] ?? '';
    const keys = [...body.matchAll(/^ {2}([a-z_]+)\??:/gm)].map((m) => m[1]!);
    expect(keys).toContain('computer_image');
    expect(keys.filter((k) => !published.has(k))).toEqual([]);
  });
  it('every fixture computer carries its image as computer_image, never image', () => {
    for (const c of computers) {
      expect(typeof c.computer_image).toBe('string');
      expect('image' in c).toBe(false);
    }
  });
});
