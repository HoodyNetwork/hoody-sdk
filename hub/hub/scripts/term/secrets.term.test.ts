// The secret gate (scripts/term/secrets.ts): its needle and matching rules. The secret-gate attacks against the real
// gate need child processes (refused in term tests): `NODE_ENV=test bun scripts/term/secrets.attacks.ts`.
import { describe, expect, test } from 'bun:test';
import { blankSecrets, hitOf, pagesForChanged, redactSecrets, revealControls, SECRET_KEY, needlesOf, sourceNeedles, type Needle } from './secrets';
import type { SemNode } from '../../src/term/prim/semantics';

const keysOf = (m: Map<string, Needle>) => [...m.values()].map((n) => `${n.key}=${n.value}`).sort();

describe('secret needles', () => {
  test('secret-named keys at any depth, token shapes anywhere, short strings never', () => {
    const m = new Map<string, Needle>();
    needlesOf({ status: 200, body: { data: [{ name: 'ci-deploy', prefix: 'hdy_9e37', token: 'hdy_' + 'f3'.repeat(26) }, { secret: 'fixture-value-0001' }, { note: 'ghp_abcdefghij1234' }, { secret: 'short' }] } }, m);
    expect(keysOf(m)).toEqual([`note=ghp_abcdefghij1234`, 'secret=fixture-value-0001', `token=hdy_${'f3'.repeat(26)}`]);
  });
  test('value counts only as a vault entry or under a secret context', () => {
    const m = new Map<string, Needle>();
    needlesOf({ specs: [{ label: 'CPU', value: 'AMD EPYC 9454P 48 cores' }], vault: { entries: [{ name: 'x', value: 'under-vault-context-1' }] }, row: { value: 'beside-metadata-0001', metadata: null }, env: [{ name: 'A', value: 'env-value-000000001' }] }, m);
    expect(keysOf(m)).toEqual(['value=beside-metadata-0001', 'value=env-value-000000001', 'value=under-vault-context-1']);
  });
  test('2FA setup: the manual key and the one-time codes beside it; error-code lists are not codes', () => {
    const m = new Map<string, Needle>();
    needlesOf({ setup: { data: { manualKey: 'JBSW Y3DP EHPK 3PXP', qr: 'data:x', codes: ['4k7p-9xqa', 'h2mz-83tw'] } }, newCodes: { data: { codes: ['q1ey-7sjf'] } }, errors: { codes: ['NOT_FOUND_ERROR', 'RATE_LIMITED'] } }, m);
    expect(keysOf(m)).toEqual(['codes=4k7p-9xqa', 'codes=h2mz-83tw', 'codes=q1ey-7sjf', 'manualKey=JBSW Y3DP EHPK 3PXP']);
  });
  test('functions and cycles are skipped', () => {
    const a: Record<string, unknown> = { answer: () => ({ token: 'x'.repeat(20) }) };
    a.self = a;
    const m = new Map<string, Needle>();
    needlesOf(a, m);
    expect(m.size).toBe(0);
  });
  test('source literals: key: literal pairs and token-shaped literals; templates with ${} skipped', () => {
    const m = new Map<string, Needle>();
    sourceNeedles(`const a = { 'github-token': { value: 'fixture-token-value-000000000001', metadata: null },\n spec: { value: 'AMD EPYC 9454P 48 cores' }, label: 'A readable label here', password: \`p-\${x}-long-enough\` };\nconst k = "sk-live-Q7v9Zt4Wd2";`, m);
    expect(keysOf(m)).toEqual(['(shape)=sk-live-Q7v9Zt4Wd2', 'value=fixture-token-value-000000000001']);
  });
});

describe('secret matching', () => {
  test('secret-named keys: client_secret, camelCase, *_token, *_password', () => {
    for (const k of ['client_secret', 'clientSecret', 'webhook_secret', 'refresh_token', 'idToken', 'new_password', 'newPassword', 'passphrase', 'api_key', 'apiKey', 'plaintext']) expect(SECRET_KEY.test(k)).toBe(true);
    for (const k of ['name', 'label', 'tokens', 'max_tokens', 'secretless_count', 'value', 'codes']) expect(SECRET_KEY.test(k)).toBe(false);
  });
  test('whole, spaced, split, prefix after the scheme, 12-char window; short needles whole only', () => {
    const v = 'fakePassphraseSierraTango';
    expect(hitOf(v, `x ${v} y`)).toBe('exact');
    expect(hitOf(v, v.split('').join(' '))).toBe('spaced');
    expect(hitOf(v, `${v.slice(0, 10)}\n   ${v.slice(10)}`)).toBe('spaced');
    expect(hitOf(v, v.slice(0, 8) + '…')).toBe('prefix');
    expect(hitOf(v, '…' + v.slice(6, 18) + '…')).toBe('window');
    expect(hitOf(v, 'Passphrase')).toBeNull();
    // A token's scheme is not secret: the 8 characters must come after it.
    expect(hitOf('hdy_f3f3a1b2c3d4e5f6a7b8', 'key hdy_f3f3…')).toBeNull();
    expect(hitOf('hdy_f3f3a1b2c3d4e5f6a7b8', 'key hdy_f3f3a1b2…')).toBe('prefix');
    expect(hitOf('4k7p-9xqa', 'codes 4k7p-9xqa')).toBe('exact');
    expect(hitOf('4k7p-9xqa', 'codes 4k7p-9x')).toBeNull();
    expect(hitOf('493817', 'code 4 9 3 8 1 7')).toBe('spaced');
  });
  test('a composite value (curl) is matched by its secret parts, never its boilerplate', () => {
    const curl = `curl -sS -H "Authorization: Bearer hbk_Q7v9Zt4Wd2Lm8Np3Rx" https://ab12.bots.example.test/v1/messages`;
    expect(hitOf(curl, 'curl -sS -H "Authorization: Bearer hbk_…" https://ab12.bots.example.test/v1/messages')).toBeNull();
    expect(hitOf(curl, 'Bearer hbk_Q7v9Zt4W…')).toBe('prefix');
    expect(hitOf(curl, curl)).toBe('exact');
    expect(redactSecrets(`ran ${curl}`, [curl])).not.toContain('hbk_Q7v9');
  });
  test('redaction leaves no window of the needle', () => {
    const v = 'fakePassphraseSierraTango';
    const out = redactSecrets(`login failed: ${v} and again ${v.slice(0, 14)} and ${v.slice(3, 16)}`, [v]);
    expect(hitOf(v, out)).toBeNull();
    expect(out).toContain('«secret ');
  });
  test('a revealed frame is searched with the secret nodes blanked', () => {
    const node = (role: string, name: string, box: [number, number, number, number], states: Record<string, unknown> = {}, children: SemNode[] = []): SemNode => ({ ref: name, role: role as never, name, states: states as never, actions: ['focus', 'press'] as never, box, children });
    const tree = [node('group', 'Key', [0, 1, 20, 1], { secret: true }, [node('button', 'Show', [14, 1, 4, 1])]), node('button', 'Show', [0, 3, 4, 1]), node('button', 'Show list', [0, 4, 9, 1])];
    expect(blankSecrets('title\nSECRETVALUE123  Show\n\nShow', tree)).toBe('title\n                    \n\nShow');
    // Kit names anywhere; "Show …" only inside a secret node.
    expect(revealControls(tree).map((n) => `${n.name}@${n.box[1]}`)).toEqual(['Show@1', 'Show@3']);
    const inSecret = [node('group', 'Value', [0, 0, 20, 2], { secret: true }, [node('button', 'Show value', [0, 1, 10, 1]), node('button', 'Hide', [11, 1, 4, 1], { pressed: true })])];
    expect(revealControls(inSecret).map((n) => n.name)).toEqual(['Show value']);
  });
  test('--changed: a page file reaches its page; shared source every page; tests and docs none', () => {
    const all = ['keys', 'vault', 'demo'];
    expect(pagesForChanged(['hub/src/pages/keys/view.tsx', 'src/pages/vault/fixtures.ts'], all)).toEqual(['keys', 'vault']);
    expect(pagesForChanged(['src/kit/forms/Secret.term.tsx'], all)).toEqual(all);
    expect(pagesForChanged(['src/kit/forms/Secret.scenario.ts', 'src/pages/keys/page.test.ts', 'src/term/docs/forms.md'], all)).toEqual([]);
    expect(pagesForChanged(['scripts/term/secrets.ts'], all)).toEqual(all);
  });
});
