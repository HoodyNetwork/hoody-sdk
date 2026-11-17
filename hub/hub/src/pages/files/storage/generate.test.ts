// The generated connect forms (generate.ts → providers.gen.json). The fixture tests pin the mapping; the coverage
// tests read the files program's openapi and its credential list (HUB_FILES_OPENAPI / HUB_FILES_VALIDATION point at
// other copies; both are skipped where the kit sources are absent). HUB_STORAGE_REGEN=<path of providers.gen.json>
// writes it again from the openapi, after a kit change: review the diff, then run the tests without it.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { monorepoPath } from '@core/test/monorepo';
import gen from './providers.gen.json';
import { CREDENTIAL_KEYS, generate, GenerateError, HAND_TYPES, HOST_FIELDS, hintOf, IDENTIFIER_KEYS, isAddressKey, isSecretKey, PLAIN_TEXT, plainKey, labelOf, S3_NAMES, typeLabelOf, type GenTable } from './generate';
import { PROVIDERS, SECRET_KEYS } from './providers';

const OPENAPI = monorepoPath(process.env.HUB_FILES_OPENAPI, 'hoody-kit', 'hoody-files', 'openapi.json') ?? '';
const VALIDATION = monorepoPath(process.env.HUB_FILES_VALIDATION, 'hoody-kit', 'hoody-files', 'src', 'remote', 'validation.rs') ?? '';
const REGISTRY = monorepoPath(process.env.HUB_FILES_REGISTRY, 'hoody-kit', 'hoody-files', 'src', 'api', 'registry.rs') ?? '';

const op = (description: string, properties: Record<string, unknown>, required?: string[]) => ({
  post: { description, requestBody: { content: { 'application/json': { schema: { type: 'object', additionalProperties: false, properties, ...(required ? { required } : {}) } } } } },
});
const hand = Object.fromEntries(HAND_TYPES.map((t) => [`/api/v1/backends/${t}`, op(t, t === 's3' ? { provider: { type: 'string', 'x-examples': ['AWS', 'Hoody-VFS', 'Other'] } } : {})]));
const spec = (paths: Record<string, unknown>) => ({ paths: { ...hand, ...paths } });
const one = (t: GenTable, id: string) => t.generated.find((x) => x.id === id)!;

describe('generate: the openapi mapping', () => {
  const t = generate(spec({
    '/api/v1/backends/acme': op('Acme Cloud (not the old one)', {
      chunk_size: { type: 'string', default: '1024', description: 'Upload chunk size.\n\nMore words.' },
      account: { type: 'string', default: '', description: 'Account name.' },
      api_secret: { type: 'string', default: '', description: 'Secret, not marked password.' },
      pin_code: { type: 'string', default: '' },
      vault_pass: { type: 'string', format: 'password', default: '' },
      retries: { type: 'integer', default: 3 },
      fast: { type: 'boolean', default: true },
      env_auth: { type: 'boolean', enum: [false], default: false },
      mode: { type: 'string', enum: ['', 'a', 'b'], default: '' },
      provider: { type: 'string', enum: ['no_auth'], default: 'no_auth' },
      zone: { type: 'string', 'x-examples': ['eu', 'us'] },
      endpoint: { type: 'string' },
      auth_url: { type: 'string' },
      application_credential_id: { type: 'string' },
      headers: { type: 'string', description: 'Set HTTP headers, e.g. "Authorization,Bearer x".' },
      '2fa': { type: 'string', description: 'The 2FA code' },
      session_blob: { type: 'string', description: 'Session cookies.' },
      proxy: { type: 'string' },
      upload_prefix: { type: 'string' },
      test_mode: { type: 'string', description: 'A flag string for the X-Test header (Authorization debugging).' },
    }, ['provider', 'zone']),
    '/api/v1/backends/oauthy': op('oauthy', {
      token: { type: 'string', description: 'OAuth token, as a JSON object with access_token, token_type, refresh_token and expiry, sent as a string, curly brackets included.\n\nMore words.' },
      client_id: { type: 'string' },
      client_secret: { type: 'string' },
    }),
    '/api/v1/backends/oauthold': op('oauthold', { token: { type: 'string', description: 'OAuth Access Token as a JSON blob.' } }),
  }));
  const acme = one(t, 'acme');
  const f = (k: string) => acme.fields.find((x) => x.key === k);

  it('lists every type, hand-made ones too, and generates only the others', () => {
    expect(t.types).toEqual([...HAND_TYPES, 'acme', 'oauthold', 'oauthy'].sort());
    expect(t.generated.map((x) => x.id)).toEqual(['acme', 'oauthold', 'oauthy']);
    expect(acme.label).toBe('Acme Cloud');
  });
  it('maps types: string → text, integer → int, boolean → boolean, a several-value enum → select without its empty value', () => {
    expect(f('chunk_size')).toMatchObject({ kind: 'text', label: 'Chunk size', default: '1024', hint: 'Upload chunk size.' });
    expect(f('retries')).toMatchObject({ kind: 'int', default: 3 });
    expect(f('fast')).toMatchObject({ kind: 'boolean', default: true });
    expect(f('mode')).toMatchObject({ kind: 'select', options: ['a', 'b'] });
  });
  it('a one-value enum is never shown: a required one is sent as it is, another is left to the program', () => {
    expect(f('provider')).toBeUndefined();
    expect(acme.fixed).toEqual({ provider: 'no_auth' });
    expect(f('env_auth')).toBeUndefined();
  });
  it('secrets: format password, a program credential name, and an unreviewed secret-looking name; an address name is not', () => {
    expect(f('vault_pass')?.kind).toBe('secret');
    expect(f('api_secret')?.kind).toBe('secret');
    expect(f('pin_code')?.kind).toBe('secret');
    expect(f('auth_url')).toMatchObject({ kind: 'text', address: true });
    // The program's own host fields are addresses too, whatever their name.
    for (const k of ['proxy', 'upload_prefix', 'endpoint']) expect(f(k), k).toMatchObject({ address: true });
    expect(f('account')?.kind).toBe('text');
    expect(f('application_credential_id')?.kind).toBe('text');
    // Headers carry an Authorization or a cookie; a 2FA code; a description that speaks of a credential.
    for (const k of ['headers', '2fa', 'session_blob']) expect(f(k)?.kind, k).toBe('secret');
    expect(f('test_mode')?.kind).toBe('text');
    expect(f('vault_pass')).not.toHaveProperty('default');
  });
  it('required fields come first, then the account, address and secret fields, then everything else', () => {
    const keys = acme.fields.map((x) => x.key);
    expect(keys.slice(0, 1)).toEqual(['zone']);
    expect(f('zone')).toMatchObject({ required: true, main: true, suggest: ['eu', 'us'] });
    for (const k of ['account', 'api_secret', 'vault_pass', 'endpoint']) expect(f(k)?.main, k).toBe(true);
    for (const k of ['chunk_size', 'retries', 'fast', 'mode']) expect(f(k)?.main, k).toBeUndefined();
    expect(keys.indexOf('chunk_size')).toBeGreaterThan(keys.indexOf('api_secret'));
  });
  it('an OAuth JSON token makes a sign-in type: the token field, and an own client id and secret that go together', () => {
    const o = one(t, 'oauthy');
    expect(o.token).toBe(true);
    expect(o.label).toBe('Oauthy');
    expect(o.fields.find((x) => x.key === 'token')).toMatchObject({ kind: 'token', main: true });
    // The program's earlier wording for the same field is read the same way.
    expect(one(t, 'oauthold')).toMatchObject({ token: true, fields: [{ key: 'token', kind: 'token' }] });
    expect(o.fields.find((x) => x.key === 'client_id')).toMatchObject({ name: true, needs: 'client_secret' });
    expect(o.fields.find((x) => x.key === 'client_secret')).toMatchObject({ kind: 'secret', needs: 'client_id' });
  });
  it('services: named, Hoody-VFS hidden, Backblaze B2 opening the b2 form when the openapi has it', () => {
    expect(t.s3).toEqual([{ provider: 'AWS', label: 'Amazon S3' }, { provider: 'Other', label: 'Other S3-compatible service' }]);
    const withB2 = generate(spec({ '/api/v1/backends/b2': op('Backblaze B2', { account: { type: 'string' } }) }));
    expect(withB2.s3.at(-1)).toEqual({ type: 'b2', label: 'Backblaze B2' });
  });
  it('a shape it cannot express stops it, naming the field', () => {
    expect(() => generate(spec({ '/api/v1/backends/x': op('x', { list: { type: 'array' } }) }))).toThrow(new GenerateError('x.list: type array has no form field'));
    expect(() => generate(spec({ '/api/v1/backends/x': op('x', { n: { type: 'integer', enum: [1, 2] } }) }))).toThrow(GenerateError);
    expect(() => generate(spec({ '/api/v1/backends/x': op('x', {}, ['gone']) }))).toThrow('x: required gone is not a property');
    const s3 = { ...hand, '/api/v1/backends/s3': op('s3', { provider: { type: 'string', 'x-examples': ['NewCloud'] } }) };
    expect(() => generate({ paths: s3 })).toThrow('s3 provider NewCloud has no name in S3_NAMES');
  });
  it('labels, hints and type names read as words', () => {
    expect(labelOf('sse_kms_key_id')).toBe('SSE KMS key ID');
    expect(labelOf('api_url')).toBe('API URL');
    expect(hintOf(`${'word '.repeat(30)}end. ${'more '.repeat(40)}`)).toMatch(/end\.$/);
    expect(hintOf('x'.repeat(300))).toHaveLength(200);
    expect(typeLabelOf('Koofr, Digi Storage and other Koofr-compatible storage providers', 'koofr')).toBe('Koofr');
    expect(typeLabelOf('premiumize.me', 'p')).toBe('premiumize.me');
    expect(typeLabelOf('iCloud Drive and Photos', 'i')).toBe('iCloud Drive and Photos');
    expect(typeLabelOf('seafile', 's')).toBe('Seafile');
  });
});

describe('every field of every form: masked and cleared unless reviewed as plain (PLAIN_TEXT)', () => {
  it('a field holding text is either an address, a reviewed plain name, or a secret of the form and the connect route', () => {
    let walked = 0;
    for (const p of PROVIDERS) {
      for (const f of p.fields) {
        walked++;
        const where = `${p.id}.${f.key}`;
        const secret = f.kind === 'secret' || f.kind === 'pem' || f.kind === 'token';
        // A choice is one of the program's fixed values, never something typed: only typed text can hold a secret.
        if (f.kind === 'text') expect(plainKey(f.key) || !!f.address, `${where}: plain text, neither reviewed nor an address`).toBe(true);
        if (secret) {
          expect(SECRET_KEYS, where).toContain(f.key);
          expect(PLAIN_TEXT, `${where}: a secret named on the plain list`).not.toContain(f.key);
        }
        if (CREDENTIAL_KEYS.includes(f.key)) expect(secret, `${where}: a credential of the program`).toBe(true);
      }
    }
    expect(walked).toBeGreaterThan(500);
  });
  it('the plain list names no credential of the program', () => {
    for (const k of [...PLAIN_TEXT, ...IDENTIFIER_KEYS]) expect(CREDENTIAL_KEYS, k).not.toContain(k);
  });
  it('a text field nobody reviewed is secret (fail closed)', () => {
    expect(isSecretKey('client_uid', { type: 'string' })).toBe(true);
    expect(isSecretKey('device_id', { type: 'string' })).toBe(true);
    expect(isSecretKey('brand_new_option', { type: 'string' })).toBe(true);
    expect(isSecretKey('chunk_size', { type: 'string' })).toBe(false);
    expect(isSecretKey('proxy', { type: 'string' })).toBe(false);
  });
});

describe.skipIf(!existsSync(OPENAPI))('the checked-in forms match the files program openapi', () => {
  // A skipped group still runs this body, so the read is guarded; its tests never see the null.
  const have = existsSync(OPENAPI);
  const fresh = (have ? generate(JSON.parse(readFileSync(OPENAPI, 'utf8')) as unknown) : null)!;
  const regen = process.env.HUB_STORAGE_REGEN;
  if (have && regen && regen.endsWith('/providers.gen.json')) writeFileSync(regen, `${JSON.stringify(fresh, null, 2)}\n`);

  it('providers.gen.json is what the generator makes of the openapi now (HUB_STORAGE_REGEN writes it again)', () => {
    expect(gen).toEqual(fresh);
  });
  it('every type whose token the openapi describes as an OAuth token is a sign-in type (a reworded description fails here)', () => {
    const paths = (have ? (JSON.parse(readFileSync(OPENAPI, 'utf8')) as { paths: Record<string, { post?: { requestBody?: { content?: Record<string, { schema?: { properties?: Record<string, { description?: string }> } }> } } }> }).paths : {});
    const oauth = fresh.generated.filter((g) => /oauth/i.test(paths[`/api/v1/backends/${g.id}`]?.post?.requestBody?.content?.['application/json']?.schema?.properties?.token?.description ?? ''));
    expect(oauth.length).toBeGreaterThan(5);
    expect(oauth.filter((g) => !g.token).map((g) => g.id)).toEqual([]);
  });
  it('every type the openapi can connect has a form', () => {
    const forms = PROVIDERS.map((p) => p.id);
    for (const type of fresh.types) expect(forms, type).toContain(type);
  });
  it('every S3 provider the openapi lists is named or hidden', () => {
    expect(fresh.s3.length).toBeGreaterThan(1);
    for (const c of fresh.s3) expect(c.provider === undefined || c.provider in S3_NAMES).toBe(true);
  });
  it('every host field of the program is an address', () => {
    for (const type of fresh.generated) for (const f of type.fields) if (HOST_FIELDS.includes(f.key) && f.kind === 'text') expect(f.address, `${type.id}.${f.key}`).toBe(true);
    expect(isAddressKey('proxy')).toBe(true);
  });
  it('every field the program treats as a credential is a secret on the form and in the connect route', () => {
    for (const type of fresh.generated) {
      for (const f of type.fields) {
        if (CREDENTIAL_KEYS.includes(f.key)) {
          expect(['secret', 'token'], `${type.id}.${f.key}`).toContain(f.kind);
          expect(SECRET_KEYS, `${type.id}.${f.key}`).toContain(f.key);
        }
      }
    }
  });
});

describe.skipIf(!existsSync(VALIDATION))('the credential names copied from the files program are its current ones', () => {
  const src = existsSync(VALIDATION) ? readFileSync(VALIDATION, 'utf8') : ''; // a skipped group still runs this body
  const list = (name: string): string[] => {
    const m = new RegExp(`const ${name}: &\\[&str\\] = &\\[([\\s\\S]*?)\\];`).exec(src);
    return m ? [...m[1]!.matchAll(/"([^"]+)"/g)].map((x) => x[1]!) : [];
  };
  it('CREDENTIAL_KEYS, IDENTIFIER_KEYS and the host fields', () => {
    expect([...CREDENTIAL_KEYS].sort()).toEqual(list('CREDENTIAL_KEYS').sort());
    expect([...HOST_FIELDS].sort()).toEqual([...list('CORE_HOST_FIELDS'), ...list('EXTENDED_HOST_FIELDS')].sort());
    expect([...IDENTIFIER_KEYS].sort()).toEqual(list('IDENTIFIER_KEYS').sort());
  });
});

describe.skipIf(!existsSync(REGISTRY))('every option the files program\'s own test names as a credential is a secret here', () => {
  // The files program's own test: `let found = [("type", "option"), ...]`, options rclone marks sensitive.
  const m = /let found = \[([\s\S]*?)\];/.exec(existsSync(REGISTRY) ? readFileSync(REGISTRY, 'utf8') : ''); // a skipped group still runs this body
  const found = m ? [...m[1]!.matchAll(/\("([^"]+)",\s*"([^"]+)"\)/g)].map((x) => [x[1]!, x[2]!] as const) : [];
  it('read the list', () => expect(found.length).toBeGreaterThan(5));
  it('masked on the form and a secret of the connect route, where the form has the option', () => {
    for (const [type, key] of found) {
      const f = PROVIDERS.find((p) => p.id === type)?.fields.find((x) => x.key === key);
      if (!f) continue;
      expect(['secret', 'pem', 'token'], `${type}.${key}`).toContain(f.kind);
      expect(SECRET_KEYS, `${type}.${key}`).toContain(key);
    }
  });
});
