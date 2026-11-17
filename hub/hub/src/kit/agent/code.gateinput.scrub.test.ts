// Vitest: the gate card's warn lines and tagged diff rows come from the daemon's detail, which is
// code-cleaned before it is drawn. Cleaning drops what can't be seen, so a key split by a zero-width character or a variation selector
// would show joined; the detail is scrubbed first.
import { describe, expect, it } from 'vitest';
import { MAX_SHOW, clean, gateInput, type InputPart } from './code';

const KEY = 'sk-live0123456789abcdef';
const SPLITS: ReadonlyArray<readonly [string, string]> = [
  ['a zero-width space', '\u200b'],
  ['a variation selector', '\ufe0f'],
];
const split = (sep: string) => `sk-${sep}live0123456789abcdef`;
// Everything a part draws or copies, as text: every kind gateInput makes.
const shown = (ps: InputPart[]): string => ps.map((p) => {
  if (p.k === 'warn' || p.k === 'path' || p.k === 'rich') return p.text;
  if (p.k === 'diff') return `${p.path}\n${p.parts.rows.map((r) => r.s).join('\n')}`;
  if (p.k === 'code') return `${p.path ?? ''}\n${p.src}`;
  if (p.k === 'kv') return `${p.name} ${p.value}`;
  if (p.k === 'wfStep') return `${p.id.text} ${p.arg}`;
  if (p.k === 'wfNext') return `${p.to.text} ${p.test.text} ${p.answer?.text ?? ''}`;
  return '';
}).join('\n');
// What a reader takes from it: what can't be seen dropped, so a key split by it reads joined.
const read = (t: string): string => t.replace(/[\p{Default_Ignorable_Code_Point}\p{Cc}]/gu, '');

describe('a key split by what cleaning drops, in the gate detail', () => {
  it.each(SPLITS)('a warn line, split by %s: hidden, never joined', (_name, sep) => {
    const ps = gateInput({ tool: 'read_file', params: { path: '/x' }, detail: `⚠ Key ${split(sep)}\nmore` });
    const warn = ps.filter((p) => p.k === 'warn');
    expect(warn).toHaveLength(1);
    expect(warn[0]).toEqual({ k: 'warn', text: '⚠ Key [hidden]' });
    expect(clean(shown(ps), undefined, { code: true }).text).not.toContain(KEY);
  });
  it.each(SPLITS)('a tagged diff row, split by %s: hidden, never joined', (_name, sep) => {
    const ps = gateInput({ tool: 'edit_file', detail: `H +1 -1 lines\nC 3 3 keep\nR 4 token = old\nA 4 token = ${split(sep)}` });
    const diff = ps.find((p) => p.k === 'diff');
    expect(diff?.k).toBe('diff');
    if (diff?.k !== 'diff') return;
    expect(diff.parts.rows).toEqual([{ t: '=', s: 'keep' }, { t: '-', s: 'token = old' }, { t: '+', s: 'token = [hidden]' }]);
    expect(diff.parts.added).toBe(1);
    expect(clean(shown(ps), undefined, { code: true }).text).not.toContain(KEY);
  });
  it.each(SPLITS)('a warn line and a tagged row together, split by %s', (_name, sep) => {
    const ps = gateInput({ tool: 'edit_file', detail: `⚠ outside home ${split(sep)}\nH +1 -0 lines\nA 1 ${split(sep)}` });
    expect(ps.map((p) => p.k)).toEqual(['warn', 'diff']);
    expect(clean(shown(ps), undefined, { code: true }).text).not.toContain(KEY);
  });
  it('a plain warn line and tagged rows read as before', () => {
    expect(gateInput({ tool: 'edit_file', detail: '⚠ outside home\nH +1 -1 lines\nR 4 old\nA 4 new' }).map((p) => p.k)).toEqual(['warn', 'diff']);
    expect(gateInput({ tool: 'read_file', detail: '⚠ outside home' })[0]).toEqual({ k: 'warn', text: '⚠ outside home' });
  });
  it('a bash detail that repeats its command is still a preview when the command holds a key: the key shows once, hidden, in no rich text', () => {
    const command = `curl -H "x: ${KEY}" https://example.com`;
    for (const detail of [command, `⚠ outside home\n${command}`, `⚠ outside home ${split('\u200b')}\n${command}`]) {
      const ps = gateInput({ tool: 'bash', params: { command }, detail });
      expect(ps.filter((p) => p.k === 'rich')).toHaveLength(0);
      expect(shown(ps)).not.toContain(KEY);
      expect(shown(ps)).toContain('[hidden]');
    }
  });
  it('a bash detail that differs from its command still shows, even where scrubbing would make the two read alike', () => {
    const command = 'b'.repeat(40000), detail = 'a'.repeat(40000);
    const ps = gateInput({ tool: 'bash', params: { command }, detail });
    expect(ps.filter((p) => p.k === 'rich')).toHaveLength(1);
    expect(gateInput({ tool: 'bash', params: { command: 'make all' }, detail: 'make all' }).filter((p) => p.k === 'rich')).toHaveLength(0);
    expect(gateInput({ tool: 'bash', params: { command: 'make all' }, detail: 'make test' }).filter((p) => p.k === 'rich')).toHaveLength(1);
  });
});

// Every value a gate card draws or copies, for every tool kind: a key written whole, or split by a zero-width
// character, a variation selector or a control, never reads whole in any part.
describe('every part of every tool kind hides a key, however it is split', () => {
  const kinds = (k: string): ReadonlyArray<readonly [string, Parameters<typeof gateInput>[0]]> => [
    ['write_file', { tool: 'write_file', params: { path: `/home/u/${k}.txt`, content: `token=${k}\n`, mode: k } }],
    ['write_minified_file', { tool: 'write_minified_file', params: { path: `/home/u/${k}.js`, content: `const t="${k}"`, [k]: 'v' } }],
    ['edit_file', { tool: 'edit_file', params: { path: `/srv/${k}`, old_string: `a ${k}`, new_string: `b ${k}\nc`, note: k } }],
    ['edit_minified_file', { tool: 'edit_minified_file', params: { path: '/srv/x.js', old_string: k, new_string: `${k}2` } }],
    ['bash', { tool: 'bash', params: { command: `echo ${k}`, cwd: `/tmp/${k}`, env: { TOKEN: k } }, detail: `⚠ near ${k}\necho ${k}` }],
    ['bash, a detail that is more than the command', { tool: 'bash', params: { command: 'make' }, detail: `make\n\nwith ${k} set` }],
    ['a tool shown as JSON', { tool: 'read_file', params: { path: '/x', token: k, [k]: 'name', nested: { deep: [k, { [k]: k }] } } }],
    ['a tool with a tagged diff detail', { tool: 'mcp_tool', params: { a: 1 }, detail: `H +1 -1 lines\nR 1 old ${k}\nA 1 new ${k}` }],
    ['a tool with a prose detail', { tool: 'mcp_tool', params: {}, detail: `It will send ${k} to the server.` }],
    // A definition the card reads step by step.
    ['a workflow save', { tool: 'upsert_workflow', params: { name: `w ${k}`, definition: { summary: `s ${k}`, entry_point: { id: 's1' }, params: [{ name: k }], steps: [
      { id: 's1', type: 'bash', command: `echo ${k}`, input: k, output: k, next_steps: [{ id: 's2', execute_if: `[ "$X" = "${k}" ]` }, { id: 'stop' }] },
      { id: 's2', type: 'agent', agent: `a ${k}`, prompt: `use ${k}`, next_steps: [{ id: 'stop' }] },
    ] } } }],
  ];
  // The part kinds each shape must reach, so a value is checked in the part that draws it, not in a fallback.
  const reaches: Record<string, string[]> = {
    write_file: ['path', 'code', 'kv'], write_minified_file: ['path', 'code', 'kv'], edit_file: ['path', 'diff', 'kv'], edit_minified_file: ['path', 'diff'],
    bash: ['warn', 'code', 'kv'], 'bash, a detail that is more than the command': ['code', 'rich'], 'a tool shown as JSON': ['code'],
    'a tool with a tagged diff detail': ['diff', 'code'], 'a tool with a prose detail': ['rich'], 'a workflow save': ['kv', 'wfStep', 'wfNext', 'code'],
  };
  for (const [why, sep] of [['written whole', ''], ...SPLITS, ['a control', '\u0007']] as const) {
    const k = `sk-${sep}live0123456789abcdef`;
    for (const [tool, g] of kinds(k)) {
      it(`${tool}: a key ${why}`, () => {
        const ps = gateInput(g);
        expect(ps.length).toBeGreaterThan(0);
        expect([...new Set(ps.map((p) => p.k))]).toEqual(expect.arrayContaining(reaches[tool] ?? ['none']));
        expect(read(clean(shown(ps), undefined, { code: true }).text)).not.toContain(KEY);
        expect(read(shown(ps))).not.toContain(KEY);
        expect(shown(ps)).toContain('[hidden]');
      });
    }
  }
  it('a workflow save draws each value in its own part: hidden in the step, the route test, the input and the rows', () => {
    const ps = gateInput(kinds(KEY).find(([t]) => t === 'a workflow save')![1]);
    const steps = ps.filter((p) => p.k === 'wfStep'), tests = ps.filter((p) => p.k === 'wfNext' && p.test.text !== '');
    // A bash step names no argument (its command is a code part below it); an agent step names its agent.
    expect(steps.map((p) => (p.k === 'wfStep' ? p.arg : ''))).toEqual(['', 'a [hidden]']);
    const src = (key: string) => ps.filter((p) => p.k === 'code' && p.key === key).map((p) => (p.k === 'code' ? p.src : ''));
    expect(src('step-1')).toEqual(['echo [hidden]']);
    expect(src('step-2-prompt')).toEqual(['use [hidden]']);
    expect(tests.map((p) => (p.k === 'wfNext' ? p.test.text : ''))).toEqual(['[ "$X" = "[hidden]" ]']);
    expect(src('step-1-input')).toEqual(['[hidden]']);
    for (const name of ['name', 'summary', 'input', 'output']) {
      expect(ps.filter((p) => p.k === 'kv' && p.name === name).map((p) => (p.k === 'kv' ? p.value : '')).join(' ')).toContain('[hidden]');
    }
  });
  it('two different keys hidden alike still read as a change in an edit; the same key reads as unchanged', () => {
    const edit = (a: string, b: string) => gateInput({ tool: 'edit_file', params: { path: '/x', old_string: a, new_string: b } }).find((p) => p.k === 'diff');
    const changed = edit(`keep\nTOKEN=${KEY}`, `keep\nTOKEN=${KEY.slice(0, -1)}g`);
    expect(changed?.k === 'diff' && changed.parts).toEqual({ rows: [{ t: '=', s: 'keep' }, { t: '-', s: 'TOKEN=[hidden]' }, { t: '+', s: 'TOKEN=[hidden]' }], added: 1, removed: 1 });
    const same = edit(`TOKEN=${KEY}\nold`, `TOKEN=${KEY}\nnew`);
    expect(same?.k === 'diff' && same.parts).toEqual({ rows: [{ t: '=', s: 'TOKEN=[hidden]' }, { t: '-', s: 'old' }, { t: '+', s: 'new' }], added: 1, removed: 1 });
  });
  it('two edit sides that differ only past the cap still read as a change, with what was left out counted', () => {
    const long = 'x '.repeat(MAX_SHOW);
    const d = gateInput({ tool: 'edit_file', params: { path: '/x', old_string: `${long}a`, new_string: `${long}b` } }).find((p) => p.k === 'diff');
    expect(d?.k === 'diff' && d.cut).toBe(2 * (MAX_SHOW + 1));
    expect(d?.k === 'diff' && d.parts.rows.map((r) => r.t)).toEqual(['-', '+']);
    const same = gateInput({ tool: 'edit_file', params: { path: '/x', old_string: `${long}a`, new_string: `${long}a\nb` } }).find((p) => p.k === 'diff');
    expect(same?.k === 'diff' && same.parts.rows.map((r) => r.t)).toEqual(['=']);
  });
  it('a file preview is read on the detail as written', () => {
    const w = gateInput({ tool: 'write_file', params: { path: '/x', content: 'a' }, detail: '```\na\n```' });
    expect(w.filter((p) => p.k === 'rich')).toHaveLength(0);
    const e = gateInput({ tool: 'edit_file', params: { path: '/x', old_string: 'a', new_string: 'b' }, detail: 'H +1 -1 lines\nR 1 a\nA 1 b' });
    expect(e.filter((p) => p.k === 'rich')).toHaveLength(0);
  });
  it('a param that is not a string is hidden before it is written as JSON, so an escaped control cannot carry a key', () => {
    const kv = (params: Record<string, unknown>, name: string) => {
      const r = gateInput({ tool: 'bash', params: { command: 'echo hi', ...params } }).find((p) => p.k === 'kv' && p.name === name);
      return r && r.k === 'kv' ? r.value : '';
    };
    const tail = KEY.slice(3);
    for (const sep of ['\u0007', '\b', '\ud800', '\u200b']) {
      const k = `sk-${sep}${tail}`;
      for (const [name, v] of [['env', { TOKEN: k }], ['args', [k]], ['opts', { [k]: 1 }]] as const) {
        const value = kv({ [name]: v }, name);
        expect(value).toContain('[hidden]');
        expect(value).not.toContain(tail);
      }
    }
    expect(kv({ timeout: 30 }, 'timeout')).toBe('30');
    expect(kv({ flags: { a: true } }, 'flags')).toBe('{"a":true}');
  });
  it('two names hidden alike stay two entries in the JSON', () => {
    const ps = gateInput({ tool: 'read_file', params: { [`${KEY}a`]: 'first', [`${KEY}b`]: 'second' } });
    const j = ps.find((p) => p.k === 'code');
    expect(j && j.k === 'code' ? j.src : '').toContain('first');
    expect(j && j.k === 'code' ? j.src : '').toContain('second');
  });
  it('the params are never changed: the card shows a copy', () => {
    const params = { command: `echo ${KEY}`, cwd: `/tmp/${KEY}` };
    gateInput({ tool: 'bash', params, detail: params.command });
    expect(params).toEqual({ command: `echo ${KEY}`, cwd: `/tmp/${KEY}` });
  });
  it('a detail whose notice runs past the display cap is still read as a preview of its command', () => {
    const detail = `⚠ ${`${KEY} `.repeat(10000)}\necho ok`;
    const ps = gateInput({ tool: 'bash', params: { command: 'echo ok' }, detail });
    expect(ps.filter((p) => p.k === 'rich')).toHaveLength(0);
    expect(ps.filter((p) => p.k === 'code')).toHaveLength(1);
  });
});
