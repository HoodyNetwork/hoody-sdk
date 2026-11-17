// New program, Advanced: the daemon's own create rules for the working folder, environment, startsecs and logs
// (its own checks of a new program and of what it writes for supervisord), the body they add,
// the draft facts the sandbox checks read, and the rule that an entered environment value is never shown back.
import { describe, expect, it } from 'vitest';
import { EMPTY_ADD, type AddForm } from './addform';
import { EMPTY_ADVANCED, advancedBody, checkAdvanced, draftFacts, expansionAt, shownText, withoutValues, type Advanced } from './advanced';

const a = (over: Partial<Advanced> = {}): Advanced => ({ ...EMPTY_ADVANCED, ...over });
const env = (...rows: [string, string][]) => rows.map(([name, value]) => ({ name, value }));
const codes = (x: Advanced, sandboxed = false) => checkAdvanced(x, sandboxed).map((p) => `${p.field}${p.row === undefined ? '' : `[${p.row}]`}:${p.code}`);

describe('Advanced: checks the daemon makes', () => {
  it('nothing set is nothing to check and nothing sent', () => {
    expect(codes(a())).toEqual([]);
    expect(advancedBody(a())).toEqual({});
  });

  it('a working folder is absolute, without .., in the daemon character set (letters, digits, / _ . - space, tab)', () => {
    expect(codes(a({ directory: '/srv/my app/v1.2_x-y' }))).toEqual([]);
    expect(codes(a({ directory: 'srv/app' }))).toEqual(['directory:pathAbsolute']);
    expect(codes(a({ directory: '/srv/../etc' }))).toEqual(['directory:pathTraversal']);
    expect(codes(a({ directory: '/srv/..' }))).toEqual(['directory:pathTraversal']);
    expect(codes(a({ directory: '/srv/a..b' }))).toEqual([]);
    expect(codes(a({ directory: '/srv/\u00fc' }))).toEqual(['directory:pathChars']);
    expect(codes(a({ directory: '/srv/$HOME' }))).toEqual(['directory:pathChars']);
    expect(codes(a({ directory: '/srv/a\nb' }))).toEqual(['directory:pathChars']);
  });

  it('variable names: a letter or _ first, then letters, digits, _; 128 at most; each once', () => {
    expect(codes(a({ env: env(['PORT_1', 'x'], ['_A', 'y']) }))).toEqual([]);
    expect(codes(a({ env: env(['1A', 'x']) }))).toEqual(['env[0]:envName']);
    expect(codes(a({ env: env(['A-B', 'x']) }))).toEqual(['env[0]:envName']);
    expect(codes(a({ env: env(['A'.repeat(129), 'x']) }))).toEqual(['env[0]:envName']);
    expect(codes(a({ env: env(['A'.repeat(128), 'x']) }))).toEqual([]);
    expect(codes(a({ env: env(['', 'x']) }))).toEqual(['env[0]:envName']);
    expect(codes(a({ env: env(['A', 'x'], ['A', 'y']) }))).toEqual(['env[1]:envDup']);
  });

  it('a row with neither name nor value is left out, never sent', () => {
    expect(codes(a({ env: env(['', ''], ['A', '1']) }))).toEqual([]);
    expect(advancedBody(a({ env: env(['', ''], ['A', '1']) }))).toEqual({ environment: { A: '1' } });
  });

  it('values: no line break; no space before ; or #; not both quote kinds; no quote at either end', () => {
    expect(codes(a({ env: env(['A', 'a\nb']) }))).toEqual(['env[0]:envLine']);
    expect(codes(a({ env: env(['A', 'a\rb']) }))).toEqual(['env[0]:envLine']);
    expect(codes(a({ env: env(['A', 'x ; y']) }))).toEqual(['env[0]:envComment']);
    expect(codes(a({ env: env(['A', 'x\t#y']) }))).toEqual(['env[0]:envComment']);
    expect(codes(a({ env: env(['A', 'x\u00a0;y']) }))).toEqual(['env[0]:envComment']);
    // The INI writer drops NUL, so "a \0; b" reaches the file as "a ; b".
    expect(codes(a({ env: env(['A', 'x \u0000;y']) }))).toEqual(['env[0]:envComment']);
    expect(codes(a({ env: env(['A', 'a;b']) }))).toEqual([]);
    expect(codes(a({ env: env(['A', '#a']) }))).toEqual([]);
    expect(codes(a({ env: env(['A', `it's "x"y`]) }))).toEqual(['env[0]:envQuotes']);
    expect(codes(a({ env: env(['A', '"x']) }))).toEqual(['env[0]:envQuoteEnd']);
    expect(codes(a({ env: env(['A', "x'"]) }))).toEqual(['env[0]:envQuoteEnd']);
    expect(codes(a({ env: env(['A', 'a"b']) }))).toEqual([]);
    expect(codes(a({ env: env(['A', '']) }))).toEqual([]);
  });

  it('values: a %(name)s supervisord cannot expand, or a text one converted as a number', () => {
    expect(codes(a({ env: env(['A', '%(nope)s']) }))).toEqual(['env[0]:envExpansion']);
    expect(codes(a({ env: env(['A', '%(ENV_HOME)d']) }))).toEqual(['env[0]:envExpansion']);
    expect(codes(a({ env: env(['A', '%(ENV_HOME)s/x']) }))).toEqual([]);
    expect(codes(a({ env: env(['A', '%(program_name)s-%(process_num)02d']) }))).toEqual([]);
    expect(codes(a({ env: env(['A', '100%%']) }))).toEqual([]);
    expect(codes(a({ env: env(['A', '100%']) }))).toEqual([]);
    expect(codes(a({ env: env(['A', '%%(nope)s']) }))).toEqual([]);
    expect(codes(a({ env: env(['A', '%(nope)']) }))).toEqual([]);
  });

  it('expansionAt reads the token as Python does (balanced parentheses, flags, width, precision, length)', () => {
    expect(expansionAt('%(ENV_A B)s tail')).toEqual({ len: 11, name: 'ENV_A B', conv: 's' });
    expect(expansionAt('%(ENV_C(D))s')).toEqual({ len: 12, name: 'ENV_C(D)', conv: 's' });
    expect(expansionAt('%(process_num)-08.3ld')).toEqual({ len: 21, name: 'process_num', conv: 'd' });
    expect(expansionAt('%(x)q')).toBeNull();
    expect(expansionAt('%(x')).toBeNull();
    expect(expansionAt('%x')).toBeNull();
  });

  it('with a sandbox, the sandbox rules for the environment apply too (loader names, the reserved prefix, literal values)', () => {
    expect(codes(a({ env: env(['LD_PRELOAD', 'x']) }), true)).toEqual(['env[0]:sbEnv.loader']);
    expect(codes(a({ env: env(['TMPDIR', '/x']) }), true)).toEqual(['env[0]:sbEnv.loader']);
    expect(codes(a({ env: env(['HOODY_SANDBOX_X', 'x']) }), true)).toEqual(['env[0]:sbEnv.reserved']);
    expect(codes(a({ env: env(['A', '50%%']) }), true)).toEqual(['env[0]:sbEnv.value']);
    expect(codes(a({ env: env(['A', 'a\\b']) }), true)).toEqual(['env[0]:sbEnv.value']);
    expect(codes(a({ env: env(['LD_PRELOAD', 'x']) }), false)).toEqual([]);
  });

  it('startsecs and logs are whole numbers in the daemon types (u32, u64 bytes, u32)', () => {
    expect(codes(a({ startSecs: '0' }))).toEqual([]);
    expect(codes(a({ startSecs: '4294967295' }))).toEqual([]);
    expect(codes(a({ startSecs: '4294967296' }))).toEqual(['startSecs:number']);
    expect(codes(a({ startSecs: '1.5' }))).toEqual(['startSecs:number']);
    expect(codes(a({ startSecs: '-1' }))).toEqual(['startSecs:number']);
    expect(codes(a({ logSizeMb: '20', logBackups: '3' }))).toEqual([]);
    expect(codes(a({ logSizeMb: 'x' }))).toEqual(['logSizeMb:number']);
    // Up to 2^33 MB (2^53 bytes): the largest size a JSON number carries exactly; a larger whole number says the limit.
    expect(codes(a({ logSizeMb: '8589934592' }))).toEqual([]);
    expect(codes(a({ logSizeMb: '8589934593' }))).toEqual(['logSizeMb:logSizeMax']);
    expect(codes(a({ logSizeMb: '9999999999' }))).toEqual(['logSizeMb:logSizeMax']);
    expect(codes(a({ logBackups: '4294967296' }))).toEqual(['logBackups:number']);
    // Logs off: the size and backups are not sent, so not checked.
    expect(codes(a({ logs: false, logSizeMb: 'x', logBackups: 'y' }))).toEqual([]);
  });

  it('a problem names its row and the variable name, never the value', () => {
    const p = checkAdvanced(a({ env: env(['A', 'secret ; value']) }), false);
    expect(JSON.stringify(p)).not.toContain('secret');
    expect(p[0]).toMatchObject({ field: 'env', row: 0, name: 'A' });
  });
});

describe('Advanced: the body it adds', () => {
  it('only what was set, under the daemon names; values sent as typed', () => {
    expect(
      advancedBody(a({ description: ' My API ', directory: ' /srv/app ', env: env(['A', ' 1 '], ['B', '']), startSecs: '5', logSizeMb: '20', logBackups: '3' })),
    ).toEqual({ description: 'My API', directory: '/srv/app', environment: { A: ' 1 ', B: '' }, delay_seconds: 5, log_max_bytes: 20 * 1048576, log_backups: 3 });
  });

  it('the largest log size goes as its exact byte count; zero start seconds is sent (the daemon reads it as 1 second)', () => {
    const body = advancedBody(a({ logSizeMb: '8589934592', startSecs: '0' }));
    expect(body).toEqual({ log_max_bytes: 9007199254740992, delay_seconds: 0 });
    expect(JSON.stringify(body)).toBe('{"delay_seconds":0,"log_max_bytes":9007199254740992}');
    expect(advancedBody(a({ logSizeMb: '8589934593' }))).toEqual({});
  });

  it('logs off sends logs_enabled false and nothing else about logs', () => {
    expect(advancedBody(a({ logs: false, logSizeMb: '20', logBackups: '3' }))).toEqual({ logs_enabled: false });
  });
});

describe('Advanced: draft facts for the sandbox checks', () => {
  const f = (over: Partial<AddForm> = {}): AddForm => ({ ...EMPTY_ADD, name: 'web', command: 'x', ...over });

  it('reads the account, ports, folder and environment from the draft; no terminal, no display', () => {
    const d = draftFacts(f({ user: 'root', ports: 'one', port: '8080' }), a({ directory: '/run/user/1000/x', env: env(['LD_PRELOAD', 'v'], ['OK', 'v']) }));
    expect(d).toMatchObject({ root: true, terminal: false, readyPort: 8080, portRange: null, directory: '/run/user/1000/x', display: false, displayLiteral: true });
    expect(d.env).toEqual([{ name: 'LD_PRELOAD', reason: 'loader' }]);
    expect(JSON.stringify(d)).not.toContain('"v"');
  });

  it('a range is its start and end; no ports is neither; an empty folder is not known', () => {
    expect(draftFacts(f({ ports: 'range', rangeStart: '8000', rangeEnd: '8003' }), a())).toMatchObject({ portRange: { start: 8000, end: 8003 }, readyPort: null, directory: null, root: false });
    expect(draftFacts(f({ ports: 'none', port: '8080' }), a())).toMatchObject({ portRange: null, readyPort: null });
  });
});

describe('Advanced: an entered value is never shown back', () => {
  it('a text holding a value is withheld; one holding only names is kept', () => {
    const rows = env(['TOKEN', 'abcd1234'], ['DEBUG', '1']);
    expect(withoutValues('Invalid environment variable value for TOKEN: it begins or ends with a quote', rows)).toBe('Invalid environment variable value for TOKEN: it begins or ends with a quote');
    expect(withoutValues('program 7 saved but NOT applied: bad abcd1234 here', rows)).toBeNull();
    // A short value counts only as a word of its own, so "program 12" or "port 8001" is not withheld for DEBUG=1.
    expect(withoutValues('program 12 saved but NOT applied: port 8001', rows)).not.toBeNull();
    expect(withoutValues('value 1 refused', rows)).toBeNull();
    expect(withoutValues('', rows)).toBe('');
    expect(withoutValues('anything', env(['A', '']))).toBe('anything');
  });
});

describe('Advanced: the shown text checks the raw answer and the cleaned one', () => {
  it('a value split by a control character, or cut off in the cleaned text, still withholds it', () => {
    const rows = env(['K', 'p\tq-secret']);
    expect(shownText('bad p\tq-secret', 'bad p q-secret', rows)).toBeNull();
    expect(shownText('x '.repeat(400) + 'p\tq-secret', 'x x x…', rows)).toBeNull();
    expect(shownText('fine', 'fine', rows)).toBe('fine');
  });
});
