// freeName.test.ts: Hoody Free's shown name has one source, the key name.free in core/providers/strings.en.json, read as
// providers.FREE_NAME. Every other strings table reads it from there instead of keeping its own copy, so
// the name cannot drift between AI, Bots, Logs or the kit.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FREE_NAME } from './catalogue';
import words from './strings.en.json';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, '..', '..');
const OWN = join(HERE, 'strings.en.json');
/** The strings tables of hub/src (strings.en.json and <Name>.strings.en.json) when this floor was set; fewer means the scan is blind. */
const TABLES_AT_LEAST = 139;

function stringTables(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (n === 'node_modules') return [];
    if (statSync(p).isDirectory()) return stringTables(p);
    return /(?:^|\.)strings\.en\.json$/.test(n) && p !== OWN ? [p] : [];
  });
}

describe('Hoody Free shown name', () => {
  it('is one key in core/providers, read as FREE_NAME', () => {
    expect(words['name.free']).toBe('Hoody Free');
    expect(FREE_NAME).toBe(words['name.free']);
  });

  it('no other strings table keeps its own copy of it (a sentence that names it is fine)', () => {
    const tables = stringTables(SRC);
    expect(tables.length).toBeGreaterThanOrEqual(TABLES_AT_LEAST);
    const copies = tables.flatMap((f) =>
      Object.entries(JSON.parse(readFileSync(f, 'utf8')) as Record<string, unknown>)
        .filter(([, v]) => v === FREE_NAME)
        .map(([k]) => `${relative(SRC, f)} ${k}`),
    );
    expect(copies).toEqual([]);
  });
});
