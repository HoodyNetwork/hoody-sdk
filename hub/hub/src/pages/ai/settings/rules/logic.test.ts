// The pure parts of the checked rules: the rules block a read answers, which scope each rule belongs to, when a scope
// may be edited, the caps and the per-rule checks the Hub can make before anything is sent, and the proof a lost
// write is judged by. A proof needs positive evidence; nothing here frees a hold on absence alone.
import { describe, expect, it } from 'vitest';
import {
  CAP, WHEN_ATOMS_MAX, WHEN_ATOM_BYTES_MAX, canEdit, capsOf, listHasWhen, newRuleId, nonceOf, ruleProblem, rulesBlockOf, rulesProved, scopeRules, whenOf, writeBody, writtenOf,
  type Read, type Rule, type RulesBlock,
} from './logic';

const row = (id: string, scope: string | undefined, over: Record<string, unknown> = {}) => ({
  id, text: `Rule ${id}.`, kind: 'limit', applies_as: 'checked', tools: [], agents: [], ...(scope === undefined ? {} : { scope }), ...over,
});
const answer = (live: unknown[], over: Record<string, unknown> = {}, rulesOver: Record<string, unknown> = {}) => ({
  rules: {
    live, timeout_ms: 3000, scopes: [{ scope: 'user', revision: 'r1:u' }, { scope: 'project', revision: 'r1:p' }, { scope: 'local', revision: 'r1:l' }],
    exec_trust: [], warnings: [], rule_warnings: [], rules_complete: true, ...rulesOver,
  },
  ...over,
});
const block = (live: unknown[], rulesOver: Record<string, unknown> = {}): RulesBlock => rulesBlockOf(answer(live, {}, rulesOver))!;
const rule = (id: string, over: Partial<Rule> = {}): Rule => ({ id, text: `Rule ${id}.`, kind: 'limit', tools: [], agents: [], when: [], ...over });

describe('rulesBlockOf', () => {
  it('reads the rules with their scope, the revisions and the completeness', () => {
    const b = rulesBlockOf(answer([row('a', 'user'), row('b', 'project', { folder: '/w/shop' }), row('c', 'local', { kind: 'guidance', applies_as: 'prompt' })]))!;
    expect(b.rules.map((r) => [r.id, r.scope])).toEqual([['a', 'user'], ['b', 'project'], ['c', 'local']]);
    expect(b.rules[1]!.folder).toBe('/w/shop');
    expect(b.revisions).toEqual({ user: 'r1:u', project: 'r1:p', local: 'r1:l' });
    expect(b.complete).toBe(true);
    expect(b.timeoutMs).toBe(3000);
  });
  it('a row with no scope (an agent that sends no scope) reads as unplaced, never guessed from its source', () => {
    const b = rulesBlockOf(answer([row('a', undefined, { source: '/home/x/.hoody/settings.local.json' })]))!;
    expect(b.rules[0]!.scope).toBeNull();
  });
  it('a scope name it does not know is unplaced', () => {
    expect(rulesBlockOf(answer([row('a', 'team')]))!.rules[0]!.scope).toBeNull();
  });
  it.each([
    ['no rules block', { rules: undefined }],
    ['no live list', { rules: { scopes: [], rules_complete: true } }],
    ['a rule with no id', { rules: { live: [{ text: 't', kind: 'limit' }], scopes: [], rules_complete: true } }],
    ['a rule of an unknown kind', { rules: { live: [row('a', 'user', { kind: 'forbid' })], scopes: [], rules_complete: true } }],
    ['a rule whose text is not a string', { rules: { live: [row('a', 'user', { text: 4 })], scopes: [], rules_complete: true } }],
    ['a rule whose tools are not strings', { rules: { live: [row('a', 'user', { tools: [1] })], scopes: [], rules_complete: true } }],
    ['a scope listed twice', { rules: { live: [], scopes: [{ scope: 'user', revision: 'a' }, { scope: 'user', revision: 'b' }], rules_complete: true } }],
    ['a revision that is empty', { rules: { live: [], scopes: [{ scope: 'user', revision: '' }], rules_complete: true } }],
    ['a revision for an unknown scope', { rules: { live: [], scopes: [{ scope: 'team', revision: 'a' }], rules_complete: true } }],
    ['not an object', 'rules'],
    ['null', null],
  ])('%s is unreadable (null), never an empty list', (_n, raw) => {
    expect(rulesBlockOf(raw)).toBeNull();
  });
  it('a repeated rule id inside one scope is kept as sent', () => {
    const b = rulesBlockOf(answer([row('a', 'user'), row('a', 'user', { text: 'Dup.' })]))!;
    expect(b.rules).toHaveLength(2);
  });
  it.each([
    ['rules_complete false', { rules_complete: false }],
    ['rules_complete missing (an older agent)', { rules_complete: undefined }],
    ['rules_complete not a boolean', { rules_complete: 'true' }],
    ['a rule warning present', { rule_warnings: ['a rule was dropped'] }],
    ['rule_warnings not an array', { rule_warnings: 'x' }],
  ])('%s is not complete', (_n, over) => {
    expect(block([row('a', 'user')], over).complete).toBe(false);
  });
});

describe('canEdit', () => {
  it('a complete read of placed rules lets each scope with a revision be edited', () => {
    const b = block([row('a', 'user'), row('b', 'project')]);
    for (const s of ['user', 'project', 'local'] as const) expect(canEdit(b, s, '/w/shop')).toEqual({ ok: true });
  });
  it('an incomplete read edits nothing: the write replaces the whole scope', () => {
    expect(canEdit(block([row('a', 'user')], { rules_complete: false }), 'user', undefined)).toEqual({ ok: false, why: 'incomplete' });
  });
  it('a scope with no revision is not editable (not read: no folder, another realm, unreadable)', () => {
    const b = block([row('a', 'user')], { scopes: [{ scope: 'user', revision: 'r1:u' }] });
    expect(canEdit(b, 'project', '/w/shop')).toEqual({ ok: false, why: 'no_revision' });
  });
  it('an unplaced rule beside other scopes makes every scope read-only', () => {
    const b = block([row('a', undefined), row('b', 'user')]);
    for (const s of ['user', 'project', 'local'] as const) expect(canEdit(b, s, '/w/shop')).toEqual({ ok: false, why: 'unplaced' });
  });
  it('a user-only read (no folder asked) places its rules without scope: there is one layer', () => {
    const b = block([row('a', undefined)], { scopes: [{ scope: 'user', revision: 'r1:u' }] });
    expect(canEdit(b, 'user', undefined)).toEqual({ ok: true });
    expect(scopeRules(b, 'user').map((r) => r.id)).toEqual(['a']);
  });
  it('the unplaced-row exception is for a read that asked for NO folder: a folder read with only a user revision stays unplaced', () => {
    const b = block([row('a', undefined)], { scopes: [{ scope: 'user', revision: 'r1:u' }] });
    expect(canEdit(b, 'user', '/w/shop')).toEqual({ ok: false, why: 'unplaced' });
    expect(scopeRules(b, 'user', '/w/shop')).toEqual([]);
    expect(canEdit(b, 'user', undefined)).toEqual({ ok: true });
  });
  it('a project or local rule that names another folder than the one asked is read-only', () => {
    const b = block([row('b', 'project', { folder: '/w/other' })]);
    expect(canEdit(b, 'project', '/w/shop')).toEqual({ ok: false, why: 'folder' });
    expect(canEdit(b, 'user', '/w/shop')).toEqual({ ok: true });
  });
});

describe('scopeRules', () => {
  it('is the rules of one scope in the order the agent sent them, as plain rules', () => {
    const b = block([row('a', 'user'), row('b', 'project', { tools: ['bash'], agents: ['code'] }), row('c', 'user')]);
    expect(scopeRules(b, 'user')).toEqual([rule('a'), rule('c')]);
    expect(scopeRules(b, 'project')).toEqual([rule('b', { tools: ['bash'], agents: ['code'] })]);
    expect(scopeRules(b, 'local')).toEqual([]);
  });
});

describe('capsOf', () => {
  it('counts checked (limit, check_in) and prompt (guidance, playbook) rules apart', () => {
    const l = [rule('a'), rule('b', { kind: 'check_in' }), rule('c', { kind: 'guidance' }), rule('d', { kind: 'playbook' })];
    expect(capsOf(l)).toEqual({ checked: 2, prompt: 2 });
  });
  it('the cap is 32 each', () => {
    expect(CAP).toBe(32);
  });
});

describe('ruleProblem', () => {
  const ok = rule('no-force-push', { text: 'Never force-push to main.', tools: ['bash'] });
  it('a good rule has none', () => {
    expect(ruleProblem([], ok)).toBeNull();
  });
  it.each([
    ['an empty id', rule('')],
    ['an id with a capital', rule('Bad')],
    ['an id starting with a dash', rule('-x')],
    ['an id of 65 characters', rule('a'.repeat(65))],
    ['an empty text', rule('x', { text: '   ' })],
    ['a text of 501 characters', rule('x', { text: 'a'.repeat(501) })],
    ['a control character in the text', rule('x', { text: 'a\u0007b' })],
    ['an unknown kind', rule('x', { kind: 'forbid' as never })],
    ['tools on a guidance rule', rule('x', { kind: 'guidance', tools: ['bash'] })],
    ['tools on a playbook rule', rule('x', { kind: 'playbook', tools: ['bash'] })],
    ['a tool that is not a name', rule('x', { tools: [''] })],
  ])('refuses %s', (_n, r) => {
    expect(ruleProblem([], r)).not.toBeNull();
  });
  // forms-required, "Add / Edit rule dialog": the Rule box takes Enter, and the agent refuses any control
  // character with a 400 the dialog could only show as a generic refusal. Named here first, at the field.
  it.each([
    ['a line break', 'Never push.\nAsk first.'],
    ['a Windows line break', 'Never push.\r\nAsk first.'],
    ['a tab', 'Never\tpush.'],
  ])('refuses %s inside the text as text_lines (the agent refuses every control character)', (_n, text) => {
    expect(ruleProblem([], rule('x', { text }))).toBe('text_lines');
  });
  it('an invisible format character is refused on guidance and playbooks only, as the agent does', () => {
    expect(ruleProblem([], rule('x', { kind: 'guidance', text: 'Be\u200bbrief.' }))).toBe('text_format');
    expect(ruleProblem([], rule('x', { kind: 'playbook', text: 'Be\u200dbrief.' }))).toBe('text_format');
    expect(ruleProblem([], rule('x', { kind: 'limit', text: 'Be\u200bbrief.' }))).toBeNull();
    expect(ruleProblem([], rule('x', { kind: 'check_in', text: 'Be\u200bbrief.' }))).toBeNull();
  });
  it('a text of exactly 500 characters is fine', () => {
    expect(ruleProblem([], rule('x', { text: 'a'.repeat(500) }))).toBeNull();
  });
  it('counts characters, not UTF-16 units (an emoji is one)', () => {
    expect(ruleProblem([], rule('x', { text: '\u{1F600}'.repeat(500) }))).toBeNull();
    expect(ruleProblem([], rule('x', { text: '\u{1F600}'.repeat(501) }))).not.toBeNull();
  });
  it('refuses a second rule with the same id in the list', () => {
    expect(ruleProblem([rule('x')], rule('x'))).not.toBeNull();
  });
  it('lets an edit keep its own id (the replaced rule is passed out)', () => {
    expect(ruleProblem([], rule('x'))).toBeNull();
  });
  it('refuses the 33rd checked rule and the 33rd prompt rule, apart', () => {
    const checked = Array.from({ length: 32 }, (_, i) => rule(`c${i}`));
    const prompt = Array.from({ length: 32 }, (_, i) => rule(`p${i}`, { kind: 'guidance' }));
    expect(ruleProblem(checked, rule('new'))).not.toBeNull();
    expect(ruleProblem(checked, rule('new', { kind: 'guidance' }))).toBeNull();
    expect(ruleProblem(prompt, rule('new', { kind: 'guidance' }))).not.toBeNull();
    expect(ruleProblem(prompt, rule('new'))).toBeNull();
    expect(ruleProblem([...checked, ...prompt], rule('new', { kind: 'playbook' }))).not.toBeNull();
  });
});

describe('newRuleId', () => {
  it('is a valid id the list does not hold', () => {
    const id = newRuleId([rule('r-1')]);
    expect(ruleProblem([rule('r-1')], rule(id))).toBeNull();
  });
});

describe('nonceOf', () => {
  it('takes the nonce of an ok answer', () => {
    expect(nonceOf({ status: 'ok', nonce: 'n1' })).toBe('n1');
  });
  it.each([
    ['no status ok', { status: 'error', nonce: 'n' }],
    ['no nonce', { status: 'ok' }],
    ['an empty nonce', { status: 'ok', nonce: '' }],
    ['an over-long nonce', { status: 'ok', nonce: 'x'.repeat(513) }],
    ['a non-string nonce', { status: 'ok', nonce: 5 }],
    ['not an object', 'ok'],
    ['null', null],
  ])('refuses %s', (_n, raw) => {
    expect(nonceOf(raw)).toBeNull();
  });
});

describe('writeBody', () => {
  it('sends the session, the nonce, the scope, the COMPLETE list of that scope and its revision, and nothing else', () => {
    const b = writeBody({ sessionId: 's1', nonce: 'n1', scope: 'project', revision: 'r1:p', rules: [rule('a', { tools: ['bash'] })] });
    expect(b).toEqual({ session_id: 's1', nonce: 'n1', scope: 'project', expected_revision: 'r1:p', rules: [{ id: 'a', text: 'Rule a.', kind: 'limit', tools: ['bash'], agents: [] }] });
    expect(Object.keys(b)).not.toContain('exec_trust');
    expect(Object.keys(b)).not.toContain('timeout_ms');
  });
  it('an emptied scope sends [] (remove every rule), never omits the list', () => {
    expect(writeBody({ sessionId: 's', nonce: 'n', scope: 'user', revision: 'r', rules: [] }).rules).toEqual([]);
  });
});

describe('writtenOf', () => {
  it('an ok answer with the new revision is the page\'s success', () => {
    expect(writtenOf({ status: 'ok', revision: 'r1:new', warnings: [] })).toEqual({ revision: 'r1:new', warnings: [] });
  });
  it('keeps the warnings the agent sends, bounded', () => {
    const w = writtenOf({ status: 'ok', revision: 'r', warnings: ['covers no call', 3, 'x'.repeat(2000)] })!;
    expect(w.warnings[0]).toBe('covers no call');
    expect(w.warnings.every((x) => typeof x === 'string' && x.length <= 500)).toBe(true);
  });
  it.each([
    ['no status ok', { status: 'error', revision: 'r' }],
    ['no revision', { status: 'ok' }],
    ['an empty revision', { status: 'ok', revision: '' }],
    ['not an object', 'ok'],
  ])('%s is not a readable success (null: the write may have applied)', (_n, raw) => {
    expect(writtenOf(raw)).toBeNull();
  });
});

describe('rulesProved', () => {
  const intended = [rule('a'), rule('b', { tools: ['bash'] })];
  const id = { scope: 'user', revision: 'r1:u', rules: intended, realm: 'R1', cwd: null };
  const read = (b: RulesBlock, over: Partial<Read> = {}): Read => ({ block: b, realm: 'R1', cwd: null, ...over });
  const after = (live: unknown[], revision = 'r1:new') => read(block(live, { scopes: [{ scope: 'user', revision }] }));
  it('a fresh complete read whose scope shows the intended list under a new revision proves it', () => {
    expect(rulesProved(id, [[after([row('a', 'user'), row('b', 'user', { tools: ['bash'] })])]])).toBe('applied');
  });
  it('the order of the list is part of the proof', () => {
    expect(rulesProved(id, [[after([row('b', 'user', { tools: ['bash'] }), row('a', 'user')])]])).toBeUndefined();
  });
  it.each([
    ['the revision is still the one read before', after([row('a', 'user'), row('b', 'user', { tools: ['bash'] })], 'r1:u')],
    ['the scope shows another list (someone else wrote)', after([row('a', 'user')])],
    ['the text differs', after([row('a', 'user', { text: 'Other.' }), row('b', 'user', { tools: ['bash'] })])],
    ['the read is not complete', read(block([row('a', 'user'), row('b', 'user', { tools: ['bash'] })], { scopes: [{ scope: 'user', revision: 'r1:new' }], rules_complete: false }))],
    ['the scope has no revision in the read', read(block([row('a', 'user'), row('b', 'user', { tools: ['bash'] })], { scopes: [] }))],
    ['the read is of another realm', { ...after([row('a', 'user'), row('b', 'user', { tools: ['bash'] })]), realm: 'R2' }],
  ])('%s proves nothing', (_n, b) => {
    expect(rulesProved(id, [[b]])).toBeUndefined();
  });
  it('an emptied list is proved only by a complete read that shows none and a new revision', () => {
    const empty = { ...id, rules: [] as Rule[] };
    expect(rulesProved(empty, [[after([])]])).toBe('applied');
    expect(rulesProved(empty, [[after([], 'r1:u')]])).toBeUndefined();
  });
  it('no answer, a null answer or a bad identity proves nothing', () => {
    expect(rulesProved(id, [[]])).toBeUndefined();
    expect(rulesProved(id, [[null]])).toBeUndefined();
    expect(rulesProved(id, [])).toBeUndefined();
    expect(rulesProved({}, [[after([])]])).toBeUndefined();
    expect(rulesProved({ ...id, scope: 'team' }, [[after([])]])).toBeUndefined();
    expect(rulesProved({ ...id, realm: '' }, [[after([])]])).toBeUndefined();
  });
  it('rows of other scopes in the read do not change the verdict', () => {
    const b = read(block([row('a', 'user'), row('b', 'user', { tools: ['bash'] }), row('z', 'project')], { scopes: [{ scope: 'user', revision: 'r1:new' }, { scope: 'project', revision: 'r1:p' }] }));
    expect(rulesProved(id, [[b]])).toBe('applied');
  });
  it('a project or local scope is proved only by a read of the same folder', () => {
    const pid = { scope: 'project', revision: 'r1:p', rules: [rule('a')], realm: 'R1', cwd: '/w/shop' };
    const b = block([row('a', 'project')], { scopes: [{ scope: 'user', revision: 'r1:u' }, { scope: 'project', revision: 'r1:new' }] });
    expect(rulesProved(pid, [[read(b, { cwd: '/w/shop' })]])).toBe('applied');
    expect(rulesProved(pid, [[read(b, { cwd: '/w/other' })]])).toBeUndefined();
    expect(rulesProved(pid, [[read(b, { cwd: null })]])).toBeUndefined();
    expect(rulesProved({ ...pid, cwd: null }, [[read(b, { cwd: null })]])).toBeUndefined();
  });
  it.each(['project', 'local'] as const)('a %s read whose rows name another folder proves nothing, though the list matches', (scope) => {
    const pid = { scope, revision: 'r1:old', rules: [rule('a')], realm: 'R1', cwd: '/w/shop' };
    const scopes = [{ scope: 'user', revision: 'r1:u' }, { scope, revision: 'r1:new' }];
    const wrong = read(block([row('a', scope, { folder: '/w/other' })], { scopes }), { cwd: '/w/shop' });
    const right = read(block([row('a', scope, { folder: '/w/shop' })], { scopes }), { cwd: '/w/shop' });
    expect(rulesProved(pid, [[wrong]])).toBeUndefined();
    expect(rulesProved(pid, [[right]])).toBe('applied');
  });
  it('a read with rows that state no scope proves nothing in a folder, whatever revisions it shows', () => {
    const b = block([row('a', undefined)], { scopes: [{ scope: 'user', revision: 'r1:new' }] });
    expect(rulesProved({ ...id, rules: [rule('a')] }, [[read(b, { cwd: '/w/shop' })]])).toBeUndefined();
    expect(rulesProved({ ...id, rules: [rule('a')] }, [[read(b, { cwd: null })]])).toBe('applied');
  });
  it('the user scope is the realm\'s: a read made for any folder of the realm proves it', () => {
    const b = block([row('a', 'user'), row('b', 'user', { tools: ['bash'] })], { scopes: [{ scope: 'user', revision: 'r1:new' }, { scope: 'project', revision: 'r1:p' }] });
    expect(rulesProved(id, [[read(b, { cwd: '/w/shop' })]])).toBe('applied');
  });
});

// The agent's call_when adds `when` (a condition over the acting agent's calls of its turn) to limit and check_in rules. A
// write replaces a scope's whole list and the agent refuses one that drops a stored rule's `when`, so
// the page carries it verbatim, compares it and never sends a list that would lose it.
describe('when (call_when)', () => {
  const W = ['+edit_file|write_file', '-bash(command=\\bgo test\\b):success'];
  it('rowOf keeps a string list verbatim; absent or null is none', () => {
    const b = block([row('a', 'user', { when: W }), row('b', 'user'), row('c', 'user', { when: null })]);
    expect(b.rules.map((r) => [r.id, r.when, r.whenBad])).toEqual([['a', W, false], ['b', [], false], ['c', [], false]]);
  });
  it.each([
    ['a string', '+edit_file'],
    ['a list with a number', ['+edit_file', 3]],
    ['an object', { atoms: W }],
    ['an empty atom', ['+edit_file', '']],
    ['more atoms than the agent allows', Array.from({ length: WHEN_ATOMS_MAX + 1 }, (_, i) => `+t${i}`)],
    ['an atom past the agent\'s byte bound', ['+' + 'é'.repeat(WHEN_ATOM_BYTES_MAX / 2)]],
  ])('%s keeps the row but makes its scope read only (why: when), never dropped', (_n, when) => {
    const b = block([row('a', 'user', { when }), row('z', 'project')]);
    expect(b.rules[0]!.whenBad).toBe(true);
    expect(canEdit(b, 'user', '/w')).toEqual({ ok: false, why: 'when' });
    expect(canEdit(b, 'project', '/w')).toEqual({ ok: true });
  });
  it('the bounds are the agent\'s: exactly 8 atoms of exactly 1024 bytes is kept', () => {
    const at = Array.from({ length: 8 }, (_, i) => `+${String(i)}${'x'.repeat(1022)}`);
    expect(whenOf(at)).toEqual(at);
    expect(whenOf([])).toEqual([]);
  });
  it('scopeRules carries the condition', () => {
    expect(scopeRules(block([row('a', 'user', { when: W })]), 'user')).toEqual([rule('a', { when: W })]);
  });
  it('writeBody round-trips a condition verbatim and sends no when key for a rule without one', () => {
    const b = writeBody({ sessionId: 's', nonce: 'n', scope: 'user', revision: 'r', rules: scopeRules(block([row('a', 'user', { when: W }), row('b', 'user')]), 'user') });
    expect(b.rules[0]).toEqual({ id: 'a', text: 'Rule a.', kind: 'limit', tools: [], agents: [], when: W });
    expect('when' in b.rules[1]!).toBe(false);
    expect(JSON.parse(JSON.stringify(b)).rules[0].when).toEqual(W);
  });
  it('listHasWhen says whether a write needs call_when', () => {
    expect(listHasWhen([rule('a'), rule('b', { when: W })])).toBe(true);
    expect(listHasWhen([rule('a')])).toBe(false);
  });
  it('a condition on guidance or a playbook is refused (only checked rules take one)', () => {
    expect(ruleProblem([], rule('a', { kind: 'guidance', when: W }))).toBe('when_prompt');
    expect(ruleProblem([], rule('a', { kind: 'check_in', when: W }))).toBeNull();
  });
  it('the proof compares the condition: a read that shows the rule without it (or with another) proves nothing', () => {
    const id = { scope: 'user', revision: 'r1:u', rules: [rule('a', { when: W })], realm: 'R1', cwd: null };
    const after = (live: unknown[]): Read => ({ block: block(live, { scopes: [{ scope: 'user', revision: 'r1:new' }] }), realm: 'R1', cwd: null });
    expect(rulesProved(id, [[after([row('a', 'user', { when: W })])]])).toBe('applied');
    expect(rulesProved(id, [[after([row('a', 'user')])]])).toBeUndefined();
    expect(rulesProved(id, [[after([row('a', 'user', { when: ['+edit_file'] })])]])).toBeUndefined();
    // A hold an older page recorded (rules without `when`) is still judged: no condition on either side.
    expect(rulesProved({ ...id, rules: [{ id: 'a', text: 'Rule a.', kind: 'limit', tools: [], agents: [] }] }, [[after([row('a', 'user')])]])).toBe('applied');
  });
});
