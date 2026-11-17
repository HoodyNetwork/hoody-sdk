// The pure parts of the hooks: the listHooks reply as a whole or not at all, which file declares a hook, when it may be
// changed from a place, the bodies of the guarded writes and the proof of a write whose answer was lost.
import { describe, expect, it } from 'vitest';
import {
  canChange, cleanPath, TARGET_MAX, UNVERIFIABLE_MAX, deleteBody, disableAllBody, hooksBlockOf, killScopes, nameable, sameHook, sameMatcher, scopeOf, toggleBody, IDENTITY_MAX,
  type HooksBlock,
} from './hooks';

const U = '/home/a/.hoody/settings.json';
const P = '/w/shop/.hoody/settings.json';
const L = '/w/shop/.hoody/settings.local.json';
const hook = (over: Record<string, unknown> = {}) => ({ event: 'PreToolUse', matcher: 'Bash', command: './guard.sh', source: U, ...over });
const reply = (hooks: unknown[], over: Record<string, unknown> = {}, live: Record<string, unknown> = {}) => ({
  status: 'ok', live: { total: hooks.length, hooks, ...live }, session: {}, stale: false,
  files: [{ scope: 'user', path: U, exists: true, sets_disable_all: false }, { scope: 'project', path: P, exists: true, sets_disable_all: false }, { scope: 'local', path: L, exists: false, sets_disable_all: false }],
  trust: { state: 'trusted', hash: 'h1', reason: '' }, ...over,
});
const block = (hooks: unknown[], over: Record<string, unknown> = {}, live: Record<string, unknown> = {}): HooksBlock => hooksBlockOf(reply(hooks, over, live))!;

describe('hooksBlockOf', () => {
  it('reads hooks, files, kill switch, trust and warnings', () => {
    const b = block([hook({ label: 'Guard', timeout: 5 }), hook({ event: 'Stop', matcher: '*', command: 'x', disabled: true })], {}, { disabled: true, warnings: ['w'] });
    expect(b.hooks.map((h) => [h.event, h.matcher, h.disabled, h.label])).toEqual([['PreToolUse', 'Bash', false, 'Guard'], ['Stop', '', true, '']]);
    expect(b.killed).toBe(true);
    expect(b.files.map((f) => f.scope)).toEqual(['user', 'project', 'local']);
    expect(b.trust).toMatchObject({ state: 'trusted', hash: 'h1' });
    expect(b.warnings).toEqual(['w']);
  });
  // The agent's trust object (hooks.list): unverifiable is the LIST of targets it cannot check, not a flag, and a
  // nil list is null on the wire. The ack's high_risk follows from it, so a flag read here would send the wrong kind.
  it('reads the trust verdict the agent sends: state, hash, reason, who acked, and the unverifiable targets as a list', () => {
    const t = (trust: Record<string, unknown>) => block([hook()], { trust }).trust;
    expect(t({ state: 'pending', hash: 'abc', reason: 'hooks changed', unverifiable: ['/opt/x/hook.sh', 'https://example.test/h'], acked_by: '' }))
      .toEqual({ state: 'pending', hash: 'abc', reason: 'hooks changed', unverifiable: ['/opt/x/hook.sh', 'https://example.test/h'], ackedBy: '' });
    expect(t({ state: 'ok', hash: 'abc', unverifiable: null, acked_by: 'tui' })).toMatchObject({ unverifiable: [], ackedBy: 'tui' });
    expect(t({ state: 'pending', hash: 'abc' }).unverifiable).toEqual([]);
    expect(t({ state: 'pending', hash: 'abc', unverifiable: [] }).unverifiable).toEqual([]);
  });
  it('a trust verdict whose unverifiable field is not a list of short strings is not read: the person is never asked to trust a cut list', () => {
    const bad = (unverifiable: unknown) => hooksBlockOf(reply([hook()], { trust: { state: 'pending', hash: 'abc', unverifiable } }));
    expect(bad(true)).toBeNull();
    expect(bad('x')).toBeNull();
    expect(bad([1])).toBeNull();
    expect(bad([''])).toBeNull();
    expect(bad(['x'.repeat(TARGET_MAX + 1)])).toBeNull();
    expect(bad(Array.from({ length: UNVERIFIABLE_MAX + 1 }, (_, i) => `/t/${i}`))).toBeNull();
    expect(bad(Array.from({ length: UNVERIFIABLE_MAX }, (_, i) => `/t/${i}`))).not.toBeNull();
    expect(bad(['x'.repeat(TARGET_MAX)])).not.toBeNull();
  });
  it('no hooks field is no hooks', () => {
    expect(hooksBlockOf({ status: 'ok', live: { total: 0 }, files: [] })!.hooks).toEqual([]);
  });
  it.each([
    ['not ok', { status: 'error' }],
    ['no live block', { live: null }],
    ['a hook with no command', { live: { hooks: [{ event: 'Stop' }] } }],
    ['a hook with no event', { live: { hooks: [{ command: 'x' }] } }],
    ['hooks that are not a list', { live: { hooks: {} } }],
    ['a file of an unknown scope', { files: [{ scope: 'team', path: '/x' }] }],
    ['two files for one scope', { files: [{ scope: 'user', path: '/a' }, { scope: 'user', path: '/b' }] }],
    ['a file with no path', { files: [{ scope: 'user' }] }],
  ])('%s cannot be read as a whole', (_n, over) => {
    expect(hooksBlockOf({ ...reply([hook()]), ...over })).toBeNull();
  });
  it('anything that is not an object is null', () => {
    for (const x of [null, undefined, 3, 'x', []]) expect(hooksBlockOf(x)).toBeNull();
  });
});

describe('scopeOf and canChange', () => {
  it('a hook belongs to the scope whose file is its source', () => {
    const b = block([hook(), hook({ source: P, command: 'p' }), hook({ source: L, command: 'l' })]);
    expect(b.hooks.map((h) => scopeOf(b, h))).toEqual(['user', 'project', 'local']);
  });
  it('slashes and a trailing slash do not change the file', () => {
    expect(cleanPath('/a//b/')).toBe('/a/b');
    const b = block([hook({ source: '/home/a//.hoody/settings.json' })]);
    expect(scopeOf(b, b.hooks[0]!)).toBe('user');
  });
  it('no source, a source no file names, or two files with one path leave it unplaced', () => {
    const none = block([hook({ source: '' }), hook({ source: '/elsewhere.json' })]);
    expect(none.hooks.map((h) => scopeOf(none, h))).toEqual([null, null]);
    const two = block([hook()], { files: [{ scope: 'user', path: U }, { scope: 'project', path: U }] });
    expect(scopeOf(two, two.hooks[0]!)).toBeNull();
  });
  it('a Realm place changes the user hooks only; a folder place changes all three', () => {
    const b = block([hook(), hook({ source: P, command: 'p' })]);
    expect(canChange(b, b.hooks[0]!, undefined)).toEqual({ ok: true, scope: 'user' });
    expect(canChange(b, b.hooks[1]!, undefined)).toEqual({ ok: false, why: 'folder' });
    expect(canChange(b, b.hooks[1]!, '/w/shop')).toEqual({ ok: true, scope: 'project' });
  });
  it('an unplaced hook is read only in any place', () => {
    const b = block([hook({ source: '/x' })]);
    expect(canChange(b, b.hooks[0]!, '/w/shop')).toEqual({ ok: false, why: 'unplaced' });
  });
  it('the kill switch is set per file: the realm place sets the user file, a folder place all listed', () => {
    const b = block([]);
    expect(killScopes(b, undefined)).toEqual(['user']);
    expect(killScopes(b, '/w/shop')).toEqual(['user', 'project', 'local']);
  });
});

describe('the bodies of the writes', () => {
  const base = { sessionId: 's1', nonce: 'n1', scope: 'project' as const };
  it('toggle names event, matcher and the exact command and says the state wanted', () => {
    expect(toggleBody({ ...base, hook: { event: 'PreToolUse', matcher: 'Bash', command: './g.sh --x' }, disabled: true })).toEqual({
      session_id: 's1', nonce: 'n1', scope: 'project', event: 'PreToolUse', matcher: 'Bash', command: './g.sh --x', disabled: true,
    });
  });
  it('the wildcard group sends no matcher', () => {
    const b = toggleBody({ ...base, hook: { event: 'Stop', matcher: '', command: 'x' }, disabled: false });
    expect('matcher' in b).toBe(false);
    expect(b.disabled).toBe(false);
    expect('matcher' in deleteBody({ ...base, hook: { event: 'Stop', matcher: '*', command: 'x' } })).toBe(false);
  });
  it('delete always carries the command (leaving it out removes the whole group) and no shipped id', () => {
    const b = deleteBody({ ...base, hook: { event: 'Stop', matcher: 'M', command: 'x' } });
    expect(b).toEqual({ session_id: 's1', nonce: 'n1', scope: 'project', event: 'Stop', matcher: 'M', command: 'x' });
    expect('shipped_id' in b).toBe(false);
  });
  it('disable all always sends the value, true or false', () => {
    expect(disableAllBody({ ...base, value: true }).value).toBe(true);
    expect(disableAllBody({ ...base, value: false })).toMatchObject({ value: false });
  });
});

describe('identity: what the agent can tell apart', () => {
  const longM = 'm'.repeat(1024);
  // The cases of the agent's own canonical matcher: trimmed; "" and "*" one wildcard; a plain name an exact tool where a Claude
  // Code alias stands for the tools it covers ("Bash" = "bash", "Glob" = "LS"); anything else its own trimmed text. [a, b, the agent takes them for one group]
  const MATCHERS: Array<[string, string, boolean]> = [
    ['Bash', 'bash', true], ['Bash', ' Bash ', true], ['', '*', true], ['*', '  ', true], ['Glob', 'LS', true], ['Glob', 'glob_files', true],
    ['Edit', 'MultiEdit', true], ['Read', 'Read', true], ['Grep', 'grep', true],
    ['Bash', 'Edit', false], ['Edit', 'edit_file', false], ['Read', 'read_file', false], ['bash', 'read_file', false], ['edit_file', 'edit_minified_file', false],
    ['Bash|Edit', 'bash|edit', false], ['^Bash$', 'Bash', false], ['Bash|Edit', 'Bash|Edit', true], ['Bash|Edit', ' Bash|Edit ', true], ['', 'Bash', false],
    // a plain name with a capital that this copy does not know may be an alias it lacks: unsure counts as the same
    ['Foo', 'bash', true], ['Foo', 'Bar', true], ['Foo', 'a|b', false],
    [longM, longM + 'x', false],
    // ASCII whitespace is trimmed alike by the agent (Go TrimSpace) and JavaScript
    ['Bash', '\tBash\n', true], ['Bash|Edit', ' \v\fBash|Edit\r ', true], ['', ' \t', true],
    // Go trims U+0085 and U+00A0 but keeps U+FEFF; JavaScript trims U+FEFF but keeps U+0085: any non-ASCII matcher may equal ANY matcher
    ['Bash', '\u0085Bash\u0085', true], ['', '\u0085*\u0085', true], ['Bash|Edit', '\u0085Bash|Edit\u0085', true], ['Bash', '\u0085Bash', true],
    ['', '\u0085*', true], ['\uFEFFBash', '\uFEFFBash\u0085', true], ['Bash', '\u00a0Bash', true], ['Bash', 'Ba\u0001sh', true], ['Edit', '\u007f', true], ['Bash', '\uFEFFBash', true], ['Edit', '\u0085Bash', true],
  ];
  it.each(MATCHERS)('matchers %j and %j: same group %s', (a, b, want) => {
    expect(sameMatcher(a, b)).toBe(want);
    expect(sameMatcher(b, a)).toBe(want);
  });
  it('two hooks are one target only with the same event and the exact same command', () => {
    expect(sameHook({ event: 'Stop', matcher: 'Bash', command: 'x' }, { event: 'Stop', matcher: 'bash', command: 'x' })).toBe(true);
    expect(sameHook({ event: 'Stop', matcher: 'Bash', command: 'x' }, { event: 'Stop', matcher: 'bash', command: 'x ' })).toBe(false);
    expect(sameHook({ event: 'Stop', matcher: 'Bash', command: 'x' }, { event: 'PreToolUse', matcher: 'Bash', command: 'x' })).toBe(false);
  });
  it('two rows the agent cannot tell apart in one file are both read-only (twin); a toggle would reach the first and a delete both', () => {
    const b = block([hook({ matcher: 'Bash' }), hook({ matcher: 'bash' })]);
    expect(b.hooks.map((h) => canChange(b, h, undefined))).toEqual([{ ok: false, why: 'twin' }, { ok: false, why: 'twin' }]);
  });
  it('identical rows (the same hook listed twice) are twins too', () => {
    const b = block([hook(), hook()]);
    expect(b.hooks.map((h) => canChange(b, h, undefined).ok)).toEqual([false, false]);
  });
  it('the same command in another file, another event or under another matcher is not a twin', () => {
    const b = block([hook(), hook({ source: P }), hook({ event: 'Stop' }), hook({ matcher: 'Edit|Write' })]);
    expect(b.hooks.map((h) => canChange(b, h, '/w/shop').ok)).toEqual([true, true, true, true]);
  });
  it('a possible twin whose file is not known counts as in the same file', () => {
    const b = block([hook(), hook({ matcher: 'bash', source: '/elsewhere.json' })]);
    expect(canChange(b, b.hooks[0]!, undefined)).toEqual({ ok: false, why: 'twin' });
  });
  it('a matcher with a non-ASCII character is read-only (ascii) and so is every row that could be its twin; a row of another command or file is not', () => {
    const b = block([hook({ matcher: 'Bash' }), hook({ matcher: '\u0085Bash' }), hook({ matcher: 'Edit' }), hook({ command: './other.sh', matcher: 'Edit' }), hook({ source: P, matcher: 'Bash' })]);
    expect(b.hooks.map((h) => canChange(b, h, '/w/shop'))).toEqual([
      { ok: false, why: 'twin' }, { ok: false, why: 'ascii' }, { ok: false, why: 'twin' }, { ok: true, scope: 'user' }, { ok: true, scope: 'project' },
    ]);
  });
  it.each([['\u0085Bash'], ['Bash\u00a0'], ['\uFEFFBash'], ['b\u00e4sh'], ['\u0085*'], ['Ba\u0001sh'], ['Bash\u007f']])('nameable refuses the matcher %j', (m) => {
    expect(nameable({ event: 'Stop', matcher: m, command: 'x' })).toBe('ascii');
  });
  it('a plain ASCII matcher is nameable', () => {
    expect(nameable({ event: 'Stop', matcher: 'Bash|Edit', command: 'x' })).toBeNull();
  });
  it('the loader warnings are kept whole, however many and however long', () => {
    const many = Array.from({ length: 25 }, (_, i) => `warning ${i}: ${'x'.repeat(900)} ${P}`);
    expect(block([], {}, { warnings: many }).warnings).toEqual(many);
  });
  it('a matcher is kept verbatim by the reader (never cut to 1024)', () => {
    const b = block([hook({ matcher: longM + 'x' }), hook({ matcher: longM })]);
    expect(b.hooks.map((h) => h.matcher.length)).toEqual([1025, 1024]);
    expect(b.hooks[0]!.matcher).not.toBe(b.hooks[1]!.matcher);
  });
  it('a hook with an empty command is read-only (reason empty), its sibling is not', () => {
    const b = block([hook({ command: '' }), hook({ command: 'sib' })]);
    expect(canChange(b, b.hooks[0]!, undefined)).toEqual({ ok: false, why: 'empty' });
    expect(canChange(b, b.hooks[1]!, undefined)).toEqual({ ok: true, scope: 'user' });
    expect(nameable({ event: 'Stop', matcher: '', command: '' })).toBe('empty');
  });
  it('a field past IDENTITY_MAX is read-only (long), never cut', () => {
    const b = block([hook({ matcher: 'm'.repeat(IDENTITY_MAX + 1) })]);
    expect(canChange(b, b.hooks[0]!, undefined)).toEqual({ ok: false, why: 'long' });
  });
});

// Stop and SubagentStop hooks may carry `when` (call_when). The list keeps it verbatim so a replace can carry it on.
describe('hooksBlockOf: when (call_when)', () => {
  const W = ['+edit_file|write_file', '-bash(command=\\bgo test\\b):success'];
  it('parses a condition verbatim; absent is none', () => {
    const b = block([hook({ event: 'Stop', matcher: '', command: './check.sh', when: W }), hook()]);
    expect(b.hooks.map((h) => [h.when, h.whenBad])).toEqual([[W, false], [[], false]]);
  });
  it.each([
    ['a string', '+edit_file'],
    ['a list with a number', [1]],
    ['nine atoms', Array.from({ length: 9 }, (_, i) => `+t${i}`)],
  ])('%s keeps the hook listed, marked whenBad (never left out of the list)', (_n, when) => {
    const b = block([hook({ event: 'Stop', when })]);
    expect(b.hooks).toHaveLength(1);
    expect(b.hooks[0]).toMatchObject({ when: [], whenBad: true });
  });
});
