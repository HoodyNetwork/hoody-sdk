// The secrets gate refuses a narrowed run (secrets-gate-env.ts): SECRETS_CASES set = a problem, never a pass.
import { expect, test } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import { childEnv } from './child-env';
import { secretsGateRefusal } from './secrets-gate-env';

test('SECRETS_CASES set: the gate is refused with a problem row; unset or empty: it runs', () => {
  expect(secretsGateRefusal({})).toBeNull();
  expect(secretsGateRefusal({ SECRETS_CASES: '' })).toBeNull();
  const p = secretsGateRefusal({ SECRETS_CASES: '^many$' });
  expect(p?.rule).toBe('secrets');
  expect(p?.file).toBe('scripts/term/secrets.ts');
  expect(p?.message).toContain('SECRETS_CASES');
});

test('the value reaches the gate child (child-env keeps it), so the refusal is what stops it', () => {
  expect(childEnv({}, { SECRETS_CASES: '^many$' }).SECRETS_CASES).toBe('^many$');
  expect(secretsGateRefusal(childEnv({}, { SECRETS_CASES: '^many$' }))).not.toBeNull();
});

test('check.ts asks before it spawns secrets.ts, with the env the child gets', () => {
  const src = fs.readFileSync(path.join(import.meta.dir, 'check.ts'), 'utf8');
  const at = src.indexOf("await gate('secrets'");
  expect(at).toBeGreaterThan(0);
  const body = src.slice(at, src.indexOf("'scripts/term/secrets.ts'", at));
  expect(body).toContain('secretsGateRefusal(env)');
  expect(body).toContain('return { ok: false');
});
