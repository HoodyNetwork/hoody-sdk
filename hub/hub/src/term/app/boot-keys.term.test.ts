// boot-keys.ts runs in two places: inside the Hub (a live start) and in the CLI's own process at `hoody logout`
// (scripts/term/build/hub-store-logout.ts), where the Hub's core is not loaded. These pins keep it that way: it imports
// nothing but the secret-shape check and types, and the names it repeats from core equal their sources.
import { describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import { ATTEMPT_PREFIX, CHANGE_STORE_KEY } from '../../core/change-store';
import { ATTEMPT_ID_PREFIX, BOOT_MINT_LOCK, CHANGES_KEY, openBootMints } from './boot-keys';
import { BOOT_MINT_LOCK_PREFIX } from './live-direct';

const source = (file: string): string => fs.readFileSync(path.join(import.meta.dir, file), 'utf8');
const importsOf = (file: string): string[] => [...source(file).matchAll(/^import\s+(type\s+)?[^'"]*['"]([^'"]+)['"]/gm)]
  .map((m) => `${m[1] ? 'type ' : ''}${m[2]}`);

describe('boot-keys.ts outside the bundle', () => {
  test('imports only the secret-shape check (no import of its own) and types', () => {
    expect(importsOf('boot-keys.ts')).toEqual(['../env/secret-shaped', 'type ../env/persist', 'type ./live-records']);
    expect(importsOf('../env/secret-shaped.ts')).toEqual([]);
    // One credential shape: persist.ts takes it from there and defines none of its own.
    expect(importsOf('../env/persist.ts')).toContain('./secret-shaped');
    expect(source('../env/persist.ts')).not.toMatch(/SECRET_SHAPED\s*=/);
  });

  test('the names it repeats equal their sources', () => {
    expect(CHANGES_KEY).toBe(CHANGE_STORE_KEY);
    expect(ATTEMPT_ID_PREFIX).toBe(ATTEMPT_PREFIX);
    expect(BOOT_MINT_LOCK).toBe(BOOT_MINT_LOCK_PREFIX);
  });

  test('open mint records: only attempts whose lock is a mint count; a list that cannot be read counts as one', () => {
    const area = (text: string | null) => ({ journalGet: (k: string) => (k === CHANGES_KEY ? text : null) });
    const rec = (id: string, base: string) => ({ id, meta: { base } });
    const mint = rec(`${ATTEMPT_PREFIX}acct\u0001${BOOT_MINT_LOCK}k3v9q2m7xa\u0000inc`, `${BOOT_MINT_LOCK}k3v9q2m7xa`);
    expect(openBootMints(area(null))).toBe(0);
    expect(openBootMints(area(JSON.stringify([mint])))).toBe(1);
    // Not an attempt (a change record), or an attempt of another site: not a mint.
    expect(openBootMints(area(JSON.stringify([rec('acct\u0001computers.rename\u0001x', `${BOOT_MINT_LOCK}k3v9q2m7xa`), rec(`${ATTEMPT_PREFIX}acct\u0001term.direct.realm-alias-write\u0000inc`, 'term.direct.realm-alias-write'), mint])))).toBe(1);
    expect(openBootMints(area('not json'))).toBe(1);
    expect(openBootMints(area('{"a":1}'))).toBe(1);
  });
});
