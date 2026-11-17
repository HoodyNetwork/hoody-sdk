// Drift guard for crypto.ts, the pinned port of the SDK's lib/vault-crypto.ts: this test reads the SDK file
// and fails when it changes (its sha256) or when a constant the port relies on no longer matches.
//
// Where the SDK file is found, in this order:
//   1. the SDK this Hub source sits in: lib/vault-crypto.ts five folders up from this file;
//   2. the monorepo: from this file up to the repo root, then the SDK's lib/vault-crypto.ts;
//   3. HUB_SDK_ROOT=<monorepo root> (for trees without the SDK beside them).
// Found in neither: the test FAILS. HUB_SDK_DRIFT=skip skips it with a warning, and is meant only for an
// isolated API-server export only, never for a normal run.
//
// When the SDK file changed on purpose: re-check crypto.ts against it, then update SDK_SHA256 here and the sha
// in crypto.ts's header.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, parse } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ENVELOPE } from './crypto';

const SDK_SHA256 = 'b5b7d107ba36729e148764c33b2dd5864f29262fd2972fe6989ce0e4829fea37';
const SDK_REL = join('hoody-sdk-generator', 'hoody-sdk', 'lib', 'vault-crypto.ts');

function findSdk(): string | null {
  let dir = dirname(fileURLToPath(import.meta.url));
  const inSdk = join(dir, '..', '..', '..', '..', '..', 'lib', 'vault-crypto.ts');
  if (existsSync(inSdk)) return inSdk;
  const top = parse(dir).root;
  for (;;) {
    const p = join(dir, SDK_REL);
    if (existsSync(p)) return p;
    if (dir === top) break;
    dir = dirname(dir);
  }
  const root = process.env.HUB_SDK_ROOT;
  if (root) {
    const p = join(root, SDK_REL);
    if (existsSync(p)) return p;
  }
  return null;
}

const skip = process.env.HUB_SDK_DRIFT === 'skip';
// console.error is the one console method the Hub's lint allows; the skip must be visible in the run log.
if (skip) console.error('crypto.drift.test.ts: SKIPPED by HUB_SDK_DRIFT=skip; the vault crypto port is not checked against the SDK in this run.');

describe.skipIf(skip)('crypto.ts follows the SDK vault-crypto.ts', () => {
  const path = findSdk();
  const src = path ? readFileSync(path, 'utf8') : '';

  it('finds the SDK file', () => {
    expect(path, `SDK ${SDK_REL} not found from the monorepo or HUB_SDK_ROOT. Set HUB_SDK_ROOT=<monorepo root>, or HUB_SDK_DRIFT=skip for an isolated hoody-api export only.`).not.toBeNull();
  });

  it('the SDK file is the one the port was checked against', () => {
    const sha = createHash('sha256').update(readFileSync(path ?? '/dev/null')).digest('hex');
    expect(sha, 'the SDK vault-crypto.ts changed: re-check crypto.ts, then update SDK_SHA256 and the header sha').toBe(SDK_SHA256);
  });

  const constant = (name: string): string | undefined => new RegExp(`const ${name} = ([^;\\n]+);`).exec(src)?.[1]?.trim();
  const num = (name: string): number => Number((constant(name) ?? 'NaN').replace(/_/g, '').replace(/\s*\/.*$/, ''));
  const str = (name: string): string | undefined => /^'([^']*)'$/.exec(constant(name) ?? '')?.[1];

  it('the constants match', () => {
    expect(num('FORMAT_VERSION')).toBe(ENVELOPE.version);
    expect(str('ALGORITHM')).toBe('AES-GCM');
    expect(str('ALGORITHM_LABEL')).toBe(ENVELOPE.alg);
    expect(num('KEY_BITS')).toBe(ENVELOPE.keyBits);
    expect(num('IV_BYTES')).toBe(ENVELOPE.ivBytes);
    expect(num('SALT_BYTES')).toBe(ENVELOPE.saltBytes);
    expect(num('KDF_ITERATIONS')).toBe(ENVELOPE.iter);
    expect(num('KDF_ITERATIONS_MIN')).toBe(ENVELOPE.iterMin);
    expect(num('KDF_ITERATIONS_MAX')).toBe(ENVELOPE.iterMax);
    expect(str('KDF_HASH')).toBe(ENVELOPE.hash);
    expect(src).toContain(`kdf: '${ENVELOPE.kdf}'`);
  });

  it('decrypt checks the same shape and defaults the iteration count the same way', () => {
    expect(src).toContain(`salt.length < ${ENVELOPE.minSaltBytes} || iv.length !== 12 || ciphertext.length === 0`);
    expect(src).toContain('envelope.iter ?? KDF_ITERATIONS');
    expect(src).toContain('!Number.isInteger(iterations) || iterations < KDF_ITERATIONS_MIN || iterations > KDF_ITERATIONS_MAX');
    expect(src).toContain('envelope._enc !== FORMAT_VERSION');
  });

  it('the envelope fields and their order match', () => {
    const iface = /export interface EncryptedEnvelope \{([\s\S]*?)\n\}/.exec(src)?.[1] ?? '';
    const declared = [...iface.matchAll(/^\s+(\w+)\??:/gm)].map((m) => m[1]);
    expect(declared).toEqual([...ENVELOPE.fields]);
    const literal = /const envelope: EncryptedEnvelope = \{([\s\S]*?)\n\s*\};/.exec(src)?.[1] ?? '';
    const written = [...literal.matchAll(/^\s+(\w+):/gm)].map((m) => m[1]);
    expect(written).toEqual([...ENVELOPE.fields]);
  });
});
