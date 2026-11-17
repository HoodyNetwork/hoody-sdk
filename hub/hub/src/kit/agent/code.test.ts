// Unit tests for code.ts: the pure rows (clean, langOf, tokenize, segments, diffRows/taggedRows) and the models the
// React parts draw from (gateInput, stepModel, inlineParts).
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from 'vitest';
import * as C0 from './code';

const C: any = C0;
const joined = (toks: Array<[string, string]>) => toks.map((x) => x[1]).join('');
const classes = (toks: Array<[string, string]>, text: string) => toks.filter((x) => x[1] === text).map((x) => x[0]);
const ms = (f: () => void) => { const a = performance.now(); f(); return performance.now() - a; };

describe('clean: what a terminal would have interpreted never reaches the page', () => {
  it('removes CSI, OSC (BEL and ST terminated), OSC 8 links, C1 and other escapes', () => {
    expect(C.clean('a\u001b[31mred\u001b[0m b\u001b[1;38;5;196mc', 0).text).toBe('ared bc');
    expect(C.clean('x\u001b]0;title\u0007y\u001b]8;;http://evil\u001b\\link\u001b]8;;\u001b\\z', 0).text).toBe('xylinkz');
    expect(C.clean('p\u009b31mq\u009d0;t\u0007r', 0).text).not.toMatch(/[\u0080-\u009f]/);
    expect(C.clean('\u001bcreset\u001b7\u001b8done', 0).text).not.toContain('\u001b');
  });
  it('an unterminated OSC or DCS cannot swallow the lines after it', () => {
    const out = C.clean('a\u001b]0;never ends\nsecond line\nthird', 0).text;
    expect(out).toContain('second line');
    expect(out).toContain('third');
    expect(C.clean('a\u001bPq...\nnext', 0).text).toContain('next');
  });
  it('control characters go; newline and tab stay; CR and CRLF become newline', () => {
    expect(C.clean('a\u0000b\u0007c\u007fd\u0008e', 0).text).toBe('abcde');
    expect(C.clean('a\tb\nc\r\nd\re', 0).text).toBe('a\tb\nc\nd\ne');
  });
  it('bidi controls go everywhere; invisible formatting characters go in code', () => {
    expect(C.clean('a‮b⁦c⁩d', 0).text).toBe('abcd');
    expect(C.clean('a​b‏c﻿d⁠e', 0, { code: true }).text).toBe('abcde');
  });
  it('caps the length and says how many characters were cut', () => {
    const r = C.clean('x'.repeat(1000), 100);
    expect(r.text.length).toBe(100);
    expect(r.cut).toBe(900);
    expect(C.clean('short', 100)).toEqual({ text: 'short', cut: 0 });
  });
  it('never splits a surrogate pair when it cuts', () => {
    const r = C.clean('a'.repeat(9) + '\u{1F600}', 10);
    expect(r.text).not.toMatch(/[\ud800-\udbff]$/);
  });
});

describe('langOf: the fence tag, then the file extension, else plain', () => {
  const fam = (tag: string, path = '') => C.langOf(tag, path).fam;
  it('maps the tags the daemon and models write', () => {
    for (const [tag, want] of [['javascript', 'js'], ['js', 'js'], ['jsx', 'js'], ['typescript', 'js'], ['ts', 'js'], ['tsx', 'js'],
      ['json', 'json'], ['bash', 'sh'], ['sh', 'sh'], ['shell', 'sh'], ['zsh', 'sh'], ['python', 'py'], ['py', 'py'],
      ['css', 'css'], ['html', 'html'], ['markdown', 'md'], ['md', 'md']] as const) expect([tag, fam(tag)]).toEqual([tag, want]);
  });
  it('falls back to the extension of the path when there is no tag', () => {
    for (const [path, want] of [['/a/b/app.js', 'js'], ['/a/x.mjs', 'js'], ['/a/x.ts', 'js'], ['/a/x.json', 'json'], ['/a/run.sh', 'sh'], ['/a/x.py', 'py'],
      ['/a/s.css', 'css'], ['/a/i.html', 'html'], ['/a/r.md', 'md']] as const) expect([path, fam('', path)]).toEqual([path, want]);
  });
  it('the tag wins over the extension; an unknown language is plain text, never a guess', () => {
    expect(fam('python', '/a/x.js')).toBe('py');
    expect(fam('', '/a/x.unknown')).toBe('text');
    expect(fam('', '/x/Makefile')).toBe('text');
    expect(fam('go')).toBe('text');
    expect(C.langOf('go', '').label).toBe('go');
  });
});

describe('tokenize: one single-pass scanner per language', () => {
  it('JavaScript and TypeScript: comments, strings, numbers, keywords, calls, types', () => {
    const t = C.tokenize('js', '// hi\nconst a = ["x\\"y", 12, foo(1)];\nclass Foo { get x() { return true } }');
    expect(classes(t, '// hi')).toEqual(['c']);
    expect(classes(t, 'const')).toEqual(['k']);
    expect(classes(t, '"x\\"y"')).toEqual(['s']);
    expect(classes(t, '12')).toEqual(['n']);
    expect(classes(t, 'foo')).toEqual(['f']);
    expect(classes(t, 'Foo')).toEqual(['t']);
    expect(classes(t, 'return')).toEqual(['k']);
  });
  it('JavaScript: template literals and block comments are one token each', () => {
    const t = C.tokenize('js', 'let s = `a ${b} c`; /* x\ny */ let z');
    expect(t.some((x: any) => x[0] === 's' && x[1].startsWith('`a '))).toBe(true);
    expect(t.some((x: any) => x[0] === 'c' && x[1] === '/* x\ny */')).toBe(true);
  });
  it('JSON: keys, strings, numbers and literals', () => {
    const t = C.tokenize('json', '{"a": [1, true, null], "b": "x"}');
    expect(classes(t, '"a"')).toEqual(['a']);
    expect(classes(t, '"b"')).toEqual(['a']);
    expect(classes(t, '"x"')).toEqual(['s']);
    expect(classes(t, '1')).toEqual(['n']);
    expect(classes(t, 'true')).toEqual(['k']);
    expect(classes(t, 'null')).toEqual(['k']);
  });
  it('shell: commands, flags, variables, strings, comments, assignments', () => {
    const t = C.tokenize('sh', 'FOO=1 sudo rm -rf "a b" $HOME/x | grep -v \'q\' && echo $(date) # c');
    expect(classes(t, 'sudo')).toEqual(['f']);
    expect(classes(t, 'rm')).toEqual(['f']);
    expect(classes(t, '-rf')).toEqual(['a']);
    expect(classes(t, '"a b"')).toEqual(['s']);
    expect(classes(t, '$HOME')).toEqual(['t']);
    expect(classes(t, '# c')).toEqual(['c']);
    expect(classes(t, 'FOO')).toEqual(['t']);
  });
  it('Python: decorators, def/return, docstrings, comments, f-strings', () => {
    const t = C.tokenize('py', '@dec\ndef foo(a):\n    """doc"""\n    return f"x{a}" # c');
    expect(classes(t, '@dec')).toEqual(['f']);
    expect(classes(t, 'def')).toEqual(['k']);
    expect(classes(t, '"""doc"""')).toEqual(['s']);
    expect(classes(t, '# c')).toEqual(['c']);
  });
  it('CSS: at-rules, properties, values, colours, !important', () => {
    const t = C.tokenize('css', '@media (max-width:767px){.a{color:#fff;margin:0 4px !important}}');
    expect(classes(t, '@media')).toEqual(['k']);
    expect(classes(t, 'color')).toEqual(['a']);
    expect(classes(t, '#fff')).toEqual(['n']);
    expect(classes(t, '!important')).toEqual(['k']);
  });
  it('HTML: tags, attributes, strings, comments, and the code inside script and style', () => {
    const t = C.tokenize('html', '<div class="a"><script>let a = 1;</script><style>p{color:red}</style><!-- c --></div>');
    expect(classes(t, 'div')).toEqual(['f', 'f']);
    expect(classes(t, 'class')).toEqual(['a']);
    expect(classes(t, '"a"')).toEqual(['s']);
    expect(classes(t, 'let')).toEqual(['k']);
    expect(classes(t, 'color')).toEqual(['a']);
    expect(classes(t, '<!-- c -->')).toEqual(['c']);
  });
  it('Markdown: headings, list markers, code spans, emphasis, links, fences', () => {
    const t = C.tokenize('md', '# Title\n- item `x` **b** [a](http://x)\n```js\nlet\n```');
    expect(classes(t, '# Title')).toEqual(['k']);
    expect(classes(t, '`x`')).toEqual(['s']);
    expect(classes(t, '**b**')).toEqual(['t']);
    expect(classes(t, '[a]')).toEqual(['f']);
  });
  it('plain text is one untagged token', () => {
    expect(C.tokenize('text', 'just text <b>')).toEqual([['', 'just text <b>']]);
  });
  it('a language name that is not one of ours (an object property name) is plain text, never a lookup on the prototype', () => {
    for (const fam of ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf', '']) expect(C.tokenize(fam, 'let a = 1')).toEqual([['', 'let a = 1']]);
  });

  const CORPUS = [
    '', 'a', '\n', '"unterminated', "'x", '`tpl ${', '/* open', '// c', '<!-- open', '<script>let x', '<style>a{', '</', '<', '<a b="', '"""doc',
    '#!/bin/sh\necho "$(date +%s)" > /tmp/x', '{"a":', '[[[[[[', '))))', '\\\\\\', '\u{1F600} ‮ x', 'a\u0000b', '`'.repeat(50), '"'.repeat(50), '\\'.repeat(51),
    'f(' .repeat(200), '/*'.repeat(100), '<'.repeat(100), 'x'.repeat(5000) + '"',
  ];
  it('every language is lossless: the tokens joined are the input, for every adversarial shape', () => {
    for (const fam of ['js', 'json', 'sh', 'py', 'css', 'html', 'md', 'text', 'diff']) {
      for (const s of CORPUS) expect([fam, s.length, joined(C.tokenize(fam, s))]).toEqual([fam, s.length, s]);
    }
  });
  it('every token has a known class and non-empty text', () => {
    const known = new Set(['', 'k', 's', 'n', 'c', 'f', 'a', 't', 'i', 'd', 'p']);
    for (const fam of ['js', 'json', 'sh', 'py', 'css', 'html', 'md']) {
      for (const s of CORPUS) for (const [cls, text] of C.tokenize(fam, s)) { expect(known.has(cls)).toBe(true); expect(text.length).toBeGreaterThan(0); }
    }
  });
});

describe('a huge or adversarial input cannot hang the page', () => {
  const MB = 1024 * 1024;
  const SHAPES: Array<[string, string]> = [
    ['one long word', 'a'.repeat(MB)],
    ['quotes', '"'.repeat(MB)],
    ['open comment', '/*'.repeat(MB / 2)],
    ['open tags', '<'.repeat(MB)],
    ['backticks', '`'.repeat(MB)],
    ['backslashes', '\\'.repeat(MB)],
    ['nested calls', 'f('.repeat(MB / 2)],
    ['real code', 'const a = [1, "two", foo(3)]; // note\n'.repeat(MB / 40)],
    ['dollar-brace', '${'.repeat(MB / 2)],
    ['escapes', '\u001b['.repeat(MB / 2)],
  ];
  it('clean: 1 MB in under 1.5 s, whatever the shape', () => {
    for (const [name, s] of SHAPES) expect([name, ms(() => C.clean(s, C.MAX_SHOW, { code: true })) < 1500]).toEqual([name, true]);
  });
  it('tokenize: every language, 1 MB, under 1.5 s (the colouring is capped, the rest stays plain)', () => {
    for (const fam of ['js', 'json', 'sh', 'py', 'css', 'html', 'md']) {
      for (const [name, s] of SHAPES) {
        let out: any;
        const t = ms(() => { out = C.tokenize(fam, s); });
        expect([fam, name, t < 1500]).toEqual([fam, name, true]);
        expect([fam, name, joined(out).length]).toEqual([fam, name, s.length]);
      }
    }
  });
  it('segments, diffRows and a whole block over 1 MB are bounded too', () => {
    const big = 'line of text\n'.repeat(MB / 13);
    expect(ms(() => C.segments('```js\n' + big)) < 1500).toBe(true);
    expect(ms(() => C.segments('`'.repeat(MB))) < 1500).toBe(true);
    expect(ms(() => C.diffRows(big, big + 'x\n' + big)) < 1500).toBe(true);
    expect(ms(() => C.diffRows('a\n'.repeat(5000), 'b\n'.repeat(5000))) < 1500).toBe(true);
    let b: any;
    expect(ms(() => { b = C.blockModel('x = 1\n'.repeat(MB / 6), 'python'); }) < 3000).toBe(true);
    expect(b.long).toBe(true);   // collapsed: the block draws its peek (a few dozen nodes), not thousands
    expect(C.tokenize(b.fam, C.peekOf(b.text)).length).toBeLessThan(200);
    expect(b.cut).toBe(Math.floor(MB / 6) * 6 - C.MAX_SHOW);
  });
});

describe('segments: fenced code in prose', () => {
  it('splits text and fences, keeps the tag, and treats an unterminated fence as code to the end', () => {
    const sg = C.segments('hi\n```js\nlet x\n```\nbye `a`\n```py\nopen');
    expect(sg.map((x: any) => x.k)).toEqual(['text', 'code', 'text', 'code']);
    expect(sg[1]).toMatchObject({ k: 'code', s: 'let x', lang: 'js' });
    expect(sg[3]).toMatchObject({ k: 'code', s: 'open', lang: 'py' });
  });
  it('a reply without a fence has no code segment', () => {
    expect(C.segments('just words').some((x: any) => x.k === 'code')).toBe(false);
  });
});

describe('diffRows / taggedRows', () => {
  it('shows only the changed lines with three lines of context, in source order', () => {
    const d = C.diffRows('a\nb\nc\nd\ne\nf', 'a\nb\nX\nd\ne\nf');
    expect(d.rows.map((r: any) => r.t + r.s)).toEqual(['=a', '=b', '-c', '+X', '=d', '=e', '=f']);
    expect([d.added, d.removed]).toEqual([1, 1]);
  });
  it('identical text is no change; a pure addition and a pure removal count right', () => {
    expect(C.diffRows('a\nb', 'a\nb')).toMatchObject({ added: 0, removed: 0 });
    expect(C.diffRows('', 'x\ny')).toMatchObject({ added: 2, removed: 0 });
    expect(C.diffRows('x\ny', '')).toMatchObject({ added: 0, removed: 2 });
  });
  it('reads the daemon\'s tagged edit detail, and nothing else', () => {
    const t = C.taggedRows('H +1 -1 lines\nC 3 3 keep\nR 4 old line\nA 4 new line');
    expect(t.rows.map((r: any) => r.t + r.s)).toEqual(['=keep', '-old line', '+new line']);
    expect([t.added, t.removed]).toEqual([1, 1]);
    expect(C.taggedRows('plain words')).toBe(null);
    expect(C.taggedRows('```js\nx\n```')).toBe(null);
  });
});

// ---------------------------------------------------------------------------------------------------------------

// ── models (the old DOM rows, asserted on what the React parts draw from) ──
describe('gateInput: each tool kind by meaning', () => {
  it('write_file: the path and the content as code, extras as rows, private keys never', () => {
    const parts = C.gateInput({ tool: 'write_file', params: { path: '/home/a.py', content: 'x = 1\n', mode: '0755', _hid: 1 }, detail: '```py\nx = 1\n```' });
    expect(parts.map((p: any) => p.k)).toEqual(['path', 'code', 'kv']);
    expect(parts[1]).toMatchObject({ key: 'content', src: 'x = 1\n', path: '/home/a.py' });
    expect(parts[2]).toMatchObject({ name: 'mode', value: '0755' });
  });
  it('a daemon notice line (⚠) leads; other detail text shows once below', () => {
    const parts = C.gateInput({ tool: 'write_file', params: { path: 'a', content: 'b' }, detail: '⚠ outside home\nsomething else' });
    expect(parts[0]).toEqual({ k: 'warn', text: '⚠ outside home' });
    expect(parts[parts.length - 1]).toEqual({ k: 'rich', text: 'something else' });
  });
  it('edit_file: a diff; the tagged preview is not shown twice', () => {
    const parts = C.gateInput({ tool: 'edit_file', params: { path: 'f.ts', old_string: 'a\nb', new_string: 'a\nc' }, detail: 'H +1 -1 lines\nR 2 b\nA 2 c' });
    expect(parts.map((p: any) => p.k)).toEqual(['path', 'diff']);
    expect(parts[1].parts).toMatchObject({ added: 1, removed: 1 });
  });
  it('edit_file past the cap says what it left out', () => {
    // Words, not one unbroken run: the scrub hides a run past its own bound whole before the cap is reached.
    const long = 'xxxxxxxxx '.repeat(Math.ceil((C.MAX_SHOW + 5) / 10)).slice(0, C.MAX_SHOW + 5);
    const parts = C.gateInput({ tool: 'edit_file', params: { old_string: long, new_string: '' } });
    expect(parts.find((p: any) => p.k === 'diff').cut).toBe(5);
  });
  it('edit_file: one unbroken run past the cap is hidden whole before the cap, not cut (scrub before cap)', () => {
    const parts = C.gateInput({ tool: 'edit_file', params: { old_string: 'x'.repeat(C.MAX_SHOW + 5), new_string: '' } });
    const diff = parts.find((p: any) => p.k === 'diff');
    expect(diff.cut).toBe(0);
    expect(diff.parts.rows.map((r: any) => r.s).filter(Boolean)).toEqual(['[hidden]']);
  });
  it('bash: the command as wrapped shell; an identical detail is not repeated', () => {
    expect(C.gateInput({ tool: 'bash', params: { command: 'ls -la' }, detail: 'ls -la' }).map((p: any) => p.k)).toEqual(['code']);
    expect(C.gateInput({ tool: 'bash', params: { command: 'ls' }, detail: '```sh\nls\n```' }).map((p: any) => p.k)).toEqual(['code']);
    expect(C.gateInput({ tool: 'bash', params: { command: 'ls' } })[0]).toMatchObject({ tag: 'sh', wrap: true });
  });
  it('an unknown tool: the detail, then indented JSON with cleaned keys and values', () => {
    const parts = C.gateInput({ tool: 'mcp_x', params: { a: 'v', _p: 1, n: { d: [1] } }, detail: 'Do it' });
    expect(parts[0]).toEqual({ k: 'rich', text: 'Do it' });
    const j = JSON.parse(parts[1].src);
    expect(j).toEqual({ a: 'v', n: { d: [1] } });
    expect(parts[1].src).toContain('\n  ');
  });
  it('an unknown tool whose key or value holds an escape shows the whole JSON as written, marked', () => {
    const parts = C.gateInput({ tool: 'mcp_x', params: { 'a\u001b[31m': 'v\u0007', _p: 1, n: { d: [1] } }, detail: 'Do it' });
    expect(parts[1]).toMatchObject({ k: 'code', key: 'json', marked: true });
    expect(JSON.parse(parts[1].src)).toEqual({ 'a\u001b[31m': 'v\u0007', n: { d: [1] } });
  });
  it('a tagged detail without params is a diff', () => {
    expect(C.gateInput({ tool: 'x', detail: 'H +1 -0 lines\nA 1 new' })[0]).toMatchObject({ k: 'diff', key: 'tagged' });
  });
});

describe('stepModel and inlineParts', () => {
  it('bash with "$ " is shell with a dim prompt; a file tool shows its path; anything else is text', () => {
    const sh = C.stepModel('bash', '$ ls -la\nmore');
    expect(sh.k).toBe('sh');
    expect(sh.tokens[0]).toEqual(['p', '$ ']);
    expect(joined(sh.tokens)).toBe('$ ls -la more');
    expect(C.stepModel('read_file', '/etc/hosts (12 lines)')).toEqual({ k: 'path', path: '/etc/hosts', rest: ' (12 lines)' });
    expect(C.stepModel('web', 'search \u001b[1mcats')).toEqual({ k: 'text', text: 'search cats' });
    expect(C.stepModel('web', '')).toBeNull();
  });
  it('inline code keeps its backticks; an unclosed or empty pair stays text', () => {
    expect(C.inlineParts('run `ls` now')).toEqual(['run ', { code: '`ls`' }, ' now']);
    expect(C.inlineParts('a `` b').join('')).toBe('a `` b');
    expect(C.inlineParts('a `b\nc` d').some((x: any) => typeof x !== 'string')).toBe(false);
  });
  it('replyModel splits fences and reports the cut', () => {
    const r = C.replyModel('hi\n```js\nx\n```');
    expect(r.segs.map((x: any) => x.k)).toEqual(['text', 'code']);
    // Words, not one unbroken run: a run of 40k characters with no space is hidden whole by the scrub (code.scrub.test.ts).
    expect(C.replyModel('xxxxxxxxx '.repeat(C.MAX_SHOW).slice(0, C.MAX_SHOW + 3)).cut).toBe(3);
  });
});

describe('gateInput: a workflow save, by meaning', () => {
  const check = { id: 'check', type: 'bash', command: 'cd billing-api && make check', capture_exit_code: true, next_steps: [{ id: 'explain', execute_if: '[ "$(step.check.success)" != "true" ]' }, { id: 'stop', execute_if: '[ "$(step.check.success)" = "true" ]' }] };
  const explain = { id: 'explain', type: 'agent', agent: 'explore', prompt: 'Explain why.', next_steps: [{ id: 'stop' }] };
  const wf = (over: Record<string, unknown> = {}, top: Record<string, unknown> = { expected_absent: true }) => ({ tool: 'upsert_workflow', params: { name: 'billing', definition: { summary: 'Checks', entry_point: { id: 'check' }, steps: [explain, check], ...over }, ...top } });
  // Names read as their text here (`odd` kept beside it); a route reads as before: 'stop' for the end, '' for the steps under Otherwise.
  const flat = (p: any) => (p.k === 'wfStep' ? { ...p, id: p.id.text, odd: p.id.odd }
    : p.k === 'wfNext' ? { ...p, to: p.end ? 'stop' : p.falls ? '' : p.to.text, test: p.test.text, answer: p.answer ? p.answer.text : '' } : p);
  const parts = (g: Parameters<typeof C.gateInput>[0]) => (C.gateInput(g) as any[]).map(flat);
  const prompts = (ps: any[]) => ps.filter((p) => p.k === 'code' && /-(prompt|question)$/.test(p.key)).map((p) => p.src);
  const of = (ps: any[], k: string) => ps.filter((p) => p.k === k);
  const json = (ps: any[]) => ps.at(-1);

  it('its name and summary, that it replaces nothing and does not run, each step in the order a run reaches it, then the whole JSON', () => {
    const ps = parts(wf());
    expect(ps.slice(0, 4)).toEqual([{ k: 'kv', name: 'name', value: 'billing' }, { k: 'kv', name: 'summary', value: 'Checks' }, { k: 'wfNote', note: 'new' }, { k: 'wfNote', note: 'noRun' }]);
    expect(of(ps, 'wfStep').map((p) => [p.n, p.id, p.kind, p.arg])).toEqual([[1, 'check', 'bash', ''], [2, 'explain', 'agent', 'explore']]);
    expect(ps.find((p) => p.key === 'step-1')).toMatchObject({ k: 'code', tag: 'sh', src: 'cd billing-api && make check' });
    expect(prompts(ps)).toEqual(['Explain why.']);
    expect(json(ps)).toMatchObject({ k: 'code', key: 'json', tag: 'json' });
    expect(JSON.parse(json(ps).src)).toEqual(wf().params);
  });
  it('a map of steps, as the agent also takes and reads back, reads the same', () => {
    const { id: _a, ...c } = check; const { id: _b, ...e } = explain;
    const ps = parts(wf({ steps: { explain: e, check: c } }));
    expect(of(ps, 'wfStep').map((p) => p.id)).toEqual(['check', 'explain']);
    expect(JSON.parse(json(ps).src).definition.steps.check.command).toBe(check.command);
  });
  it('whether it replaces anything is what the save itself asks for', () => {
    expect(parts(wf({}, { expected_absent: true })).find((p) => p.k === 'wfNote').note).toBe('new');
    expect(parts(wf({}, { expected_revision: 'r1' })).find((p) => p.k === 'wfNote').note).toBe('replaces');
    expect(parts(wf({}, {})).find((p) => p.k === 'wfNote').note).toBe('mayReplace');
    expect(parts(wf({}, { expected_absent: false })).find((p) => p.k === 'wfNote').note).toBe('mayReplace');
  });
  const routes = (ps: any[]) => of(ps, 'wfNext').map((p) => [p.answer, p.to, p.n, p.test]);
  const ask = (over: Record<string, unknown>) => ({ id: 'q', type: 'tool', tool: 'ask_question_to_user', question: 'Migrate now?', ...over });
  const run = { id: 'run', type: 'bash', command: 'make' };
  it('each step says where a run goes from it: a condition stays on its route, a route out of an answer stays on that answer', () => {
    const ps = parts(wf());
    expect(routes(ps)).toEqual([['', 'explain', 2, '[ "$(step.check.success)" != "true" ]'], ['', 'stop', 0, '[ "$(step.check.success)" = "true" ]'], ['', 'stop', 0, '']]);
    const stepAt = ps.findIndex((p) => p.k === 'wfStep' && p.id === 'explain');
    expect(ps.slice(stepAt).find((p) => p.k === 'wfNext')).toMatchObject({ to: 'stop', test: '' });
    const asked = parts(wf({ entry_point: { id: 'q' }, steps: [ask({ options: [{ title: 'Yes', steps: [{ id: 'run', execute_if: 'test -f x' }] }, { title: 'No', steps: [{ id: 'stop' }] }] }), run] }));
    expect(routes(asked)).toEqual([['Yes', 'run', 2, 'test -f x'], ['No', 'stop', 0, '']]);
  });
  it('more than one way out says they run side by side, as the agent runs them; one way out does not', () => {
    const fan = parts(wf({ entry_point: { id: 'a' }, steps: [{ id: 'a', type: 'bash', command: 'ls', next_steps: [{ id: 'b' }, { id: 'c' }] }, { id: 'b', type: 'bash', command: 'b' }, { id: 'c', type: 'bash', command: 'c' }] }));
    expect(fan.filter((p) => p.note === 'together')).toHaveLength(1);
    expect(fan.findIndex((p) => p.note === 'together')).toBe(fan.findIndex((p) => p.k === 'wfNext') - 1);
    const line = parts(wf({ entry_point: { id: 'a' }, steps: [{ id: 'a', type: 'bash', command: 'ls', next_steps: [{ id: 'b' }] }, { id: 'b', type: 'bash', command: 'b' }] }));
    expect(line.filter((p) => p.note === 'together')).toEqual([]);
  });
  it('a route back shows the step it returns to, by its number', () => {
    const ps = parts(wf({ entry_point: { id: 'a' }, steps: [{ id: 'a', type: 'bash', command: 'ls', next_steps: [{ id: 'b' }] }, { id: 'b', type: 'bash', command: 'b', max_iterations: 3, next_steps: [{ id: 'a', execute_if: 'false' }] }] }));
    expect(routes(ps)).toEqual([['', 'b', 2, ''], ['', 'a', 1, 'false']]);
  });
  it.each([
    ['one id', 'run'],
    ['one reference', { id: 'run' }],
    ['a list of ids', ['run']],
    ['a list of references', [{ id: 'run' }]],
  ])('a route as %s reads the same, on a step and on an answer', (_n, shape) => {
    const a = parts(wf({ entry_point: { id: 'a' }, steps: [{ id: 'a', type: 'bash', command: 'ls', next_steps: shape }, run] }));
    expect(routes(a)).toEqual([['', 'run', 2, '']]);
    const b = parts(wf({ entry_point: { id: 'q' }, steps: [ask({ options: [{ title: 'Yes', steps: shape }] }), run] }));
    expect(routes(b)).toEqual([['Yes', 'run', 2, '']]);
  });
  it('one reference keeps its condition', () => {
    const ps = parts(wf({ entry_point: { id: 'a' }, steps: [{ id: 'a', type: 'bash', command: 'ls', next_steps: { id: 'run', execute_if: 'test -f x' } }, run] }));
    expect(routes(ps)).toEqual([['', 'run', 2, 'test -f x']]);
  });
  it('an answer with no step of its own goes on to the question\'s next steps, or ends the run; those steps read as Otherwise', () => {
    const falls = parts(wf({ entry_point: { id: 'q' }, steps: [ask({ options: [{ title: 'Yes' }], next_steps: [{ id: 'run' }] }), run] }));
    expect(of(falls, 'wfNext').map((p) => [p.answer, p.to, p.otherwise])).toEqual([['Yes', '', false], ['', 'run', true]]);
    const ends = parts(wf({ entry_point: { id: 'q' }, steps: [ask({ options: [{ title: 'Yes' }] })] }));
    expect(routes(ends)).toEqual([['Yes', 'stop', 0, '']]);
  });
  it('a question with no words of its own says so', () => {
    const { question: _q, ...bare } = ask({ options: [{ title: 'Yes' }] });
    const ps = parts(wf({ entry_point: { id: 'q' }, steps: [bare] }));
    expect(ps.filter((p) => p.note === 'noQuestion')).toHaveLength(1);
    expect(prompts(ps)).toEqual([]);
  });
  it('a question shows what it asks and where each answer goes', () => {
    const ps = parts(wf({ entry_point: { id: 'q' }, steps: [ask({ options: [{ title: 'Yes', steps: [{ id: 'run' }] }, { title: 'No', steps: [{ id: 'stop' }] }] }), run] }));
    expect(of(ps, 'wfStep').map((p) => [p.id, p.kind])).toEqual([['q', 'ask'], ['run', 'bash']]);
    expect(prompts(ps)).toEqual(['Migrate now?']);
    expect(routes(ps)).toEqual([['Yes', 'run', 2, ''], ['No', 'stop', 0, '']]);
    expect(of(ps, 'wfNote').map((p) => p.note), 'a step only an answer leads to is reached').not.toContain('unreached');
  });
  it('a command\'s input, a nested workflow\'s prompt and a list are shown, not just the name', () => {
    const ps = parts(wf({ entry_point: { id: 'a' }, steps: [
      { id: 'a', type: 'bash', command: 'bash', input: 'rm -rf build', next_steps: ['b'] },
      { id: 'b', type: 'workflow', workflow: 'sub', prompt: 'Do the release.', next_steps: ['c'] },
      { id: 'c', type: 'foreach', workflow: 'each', list: '["x","y"]', prompt: 'One item.' },
    ] }));
    const at = ps.findIndex((p) => p.note === 'input');
    expect(ps[at + 1]).toMatchObject({ k: 'code', key: 'step-1-input', src: 'rm -rf build' });
    expect(prompts(ps)).toEqual(['Do the release.', 'One item.']);
    expect(ps.find((p) => p.k === 'kv' && p.name === 'list')?.value).toBe('["x","y"]');
  });
  it('a step that writes its output to a file says where', () => {
    const ps = parts(wf({ entry_point: { id: 'a' }, steps: [{ id: 'a', type: 'agent', agent: 'general', prompt: 'p', output: 'notes.md' }] }));
    expect(ps.find((p) => p.k === 'kv' && p.name === 'output')?.value).toBe('notes.md');
  });
  it('a step whose failure doesn\'t stop the run says so', () => {
    const goesOn = (step: Record<string, unknown>) => parts(wf({ entry_point: { id: 'a' }, steps: [{ id: 'a', command: 'ls', ...step }] })).filter((p) => p.note === 'goesOn').length;
    expect(goesOn({ type: 'bash', capture_exit_code: true })).toBe(1);
    expect(goesOn({ type: 'bash', continue_on_error: true })).toBe(1);
    expect(goesOn({ type: 'workflow', workflow: 'x', continue_on_error: true })).toBe(1);
    expect(goesOn({ type: 'bash' })).toBe(0);
    expect(goesOn({ type: 'workflow', workflow: 'x', capture_exit_code: true })).toBe(0);
  });
  it('everything cut carries a mark, and the JSON below keeps it whole', () => {
    const long = 'y'.repeat(1300), id = 'z'.repeat(90), test = 't'.repeat(310), title = 'w'.repeat(90);
    const ps = parts(wf({ summary: 's'.repeat(310), entry_point: { id: 'q' }, steps: [ask({ question: long, options: [{ title, steps: [{ id, execute_if: test }] }] }), { id, type: 'foreach', workflow: 'n'.repeat(90), list: 'l'.repeat(310), output: 'o'.repeat(310) }] }));
    expect(prompts(ps), 'a question is shown whole, folded by its block').toEqual([long]);
    expect(of(ps, 'wfNext')[0]).toMatchObject({ answer: `${'w'.repeat(80)}…`, to: `${'z'.repeat(80)}…`, test: `${'t'.repeat(300)}…` });
    expect(of(ps, 'wfStep')[1]).toMatchObject({ id: `${'z'.repeat(80)}…`, arg: `${'n'.repeat(80)}…` });
    expect(ps.find((p) => p.name === 'summary')?.value).toBe(`${'s'.repeat(300)}…`);
    expect(ps.find((p) => p.name === 'list')?.value).toBe(`${'l'.repeat(300)}…`);
    expect(ps.find((p) => p.name === 'output')?.value).toBe(`${'o'.repeat(300)}…`);
    expect(json(ps).src).toContain(long);
    expect(json(ps).src).toContain(id);
    expect(json(ps).src).toContain(test);
  });
  it('the JSON is whole past the bound other cards keep, which says it is what gets saved', () => {
    const huge = 'x'.repeat(25000);
    const step = (i: number) => ({ id: `s${i}`, type: 'bash', command: 'ls' });
    const steps = Array.from({ length: 1000 }, (_, i) => step(i));
    const ps = parts(wf({ entry_point: { id: 's0' }, steps: [{ ...steps[0], command: huge }, ...steps.slice(1)] }));
    expect(json(ps).src).toContain(huge);
    expect(json(ps).src).toContain('"s999"');
    expect(ps.at(-2)).toEqual({ k: 'wfNote', note: 'whole' });
    expect(C.prettyJSON({ a: huge })).not.toContain(huge);
    const many = Array.from({ length: 6000 }, (_, i) => step(i));
    expect(C.prettyJSON(many)).not.toContain('"s5999"');
    // Past MAX_SHOW the whole JSON is cut with "…" and cannot be allowed from the card.
    const over = json(parts(wf({ entry_point: { id: 's0' }, steps: many })));
    expect(over).toMatchObject({ marked: true, blind: true });
    expect(over.src.endsWith('…')).toBe(true);
  });
  it('the JSON is the saved text exactly, but for a key or token it hides (below): long names stay apart, nothing is dropped, and what a person can\'t see shows as an escape', () => {
    const a = `${'k'.repeat(300)}a`, b = `${'k'.repeat(300)}b`;
    const keyed = parts(wf({ entry_point: { id: a }, steps: { [a]: { type: 'bash', command: 'x', next_steps: [{ id: b }] }, [b]: { type: 'bash', command: 'y' } } }));
    expect(json(keyed).src, 'a space stays a space').toContain('"type": "bash"');
    expect(Object.keys(JSON.parse(json(keyed).src).definition.steps)).toEqual([a, b]);
    const unseen = [0x202e, 0xa0, 0x200b, 0xfeff, 0x85, 0x2028, 0xad];
    const input = `a\r\nb\u0007c ${unseen.map((c) => `${String.fromCharCode(c)}x`).join('')} ${String.fromCodePoint(0xe0041)} caf\u00e9 日本`;
    const shown = parts(wf({ entry_point: { id: 'a' }, steps: [{ id: 'a', type: 'bash', command: 'cat', input }] }));
    const src: string = json(shown).src;
    expect(JSON.parse(src).definition.steps[0].input).toBe(input);
    for (const c of unseen) expect(src).not.toContain(String.fromCharCode(c));
    expect(src).not.toContain(String.fromCodePoint(0xe0041));
    expect(src).toContain('\\u202e');
    expect(src).toContain('\\u00a0');
    expect(src).toContain('\\r\\n');
    expect(src).toContain('\\udb40\\udc41');
    expect(src).toContain('caf\u00e9 日本');
    expect(src.split('\n').length).toBeGreaterThan(3);
  });
  it('a definition the card can\'t read shows whole as well; another tool past the shared bound shows whole behind the tick', () => {
    const huge = 'x'.repeat(25000);
    const refused = parts({ tool: 'upsert_workflow', params: { name: 'b', definition: { steps: [{ id: 'a', type: 'bash', command: huge }] } } });
    expect(of(refused, 'wfStep')).toEqual([]);
    expect(json(refused).src).toContain(huge);
    // Past the shared bound another tool's JSON is shown whole, unfolded, behind the tick, never cut in silence.
    expect(json(parts({ tool: 'read_workflow', params: { a: huge } }))).toMatchObject({ marked: true, long: true, src: expect.stringContaining(huge) });
    // A no-break space can pass for a space: another tool's JSON shows it as written, marked.
    expect(json(parts({ tool: 'read_workflow', params: { a: 'b\u00a0c' } }))).toMatchObject({ marked: true, src: expect.stringContaining('b\\u00a0c') });
  });
  it.each([
    ['from a step', { entry_point: { id: 'a' }, steps: [{ id: 'a', type: 'bash', command: 'ls', next_steps: [{ id: 'gone' }] }] }],
    ['from an answer', { entry_point: { id: 'q' }, steps: [{ id: 'q', type: 'tool', tool: 'ask_question_to_user', question: 'Go?', options: [{ title: 'Yes', steps: [{ id: 'gone' }] }] }] }],
  ])('a route to a step that isn\'t there, %s: the agent refuses it, so the JSON alone', (_n, def) => {
    const ps = parts(wf(def));
    expect(of(ps, 'wfStep')).toEqual([]);
    expect(json(ps).src).toContain('"gone"');
  });
  it('an answer listing a stop beside another route shows the JSON alone: a stop that applies ends the run there; a stop among next steps ends only its path', () => {
    const mixed = parts(wf({ entry_point: { id: 'q' }, steps: [ask({ options: [{ title: 'Yes', steps: [{ id: 'run' }, { id: 'stop', execute_if: 'true' }] }] }), run] }));
    expect(of(mixed, 'wfStep')).toEqual([]);
    const next = parts(wf({ entry_point: { id: 'a' }, steps: [{ id: 'a', type: 'bash', command: 'ls', next_steps: [{ id: 'run' }, { id: 'stop' }] }, run] }));
    expect(routes(next)).toEqual([['', 'run', 2, ''], ['', 'stop', 0, '']]);
  });
  it('a question says what a background run does: nobody is asked, it goes on to Otherwise, or fails with none', () => {
    const on = parts(wf({ entry_point: { id: 'q' }, steps: [ask({ options: [{ title: 'Yes' }], next_steps: [{ id: 'run' }] }), run] }));
    expect(on.filter((p) => p.note === 'askBackground')).toHaveLength(1);
    expect(on.filter((p) => p.note === 'askBackgroundFails')).toEqual([]);
    const fails = parts(wf({ entry_point: { id: 'q' }, steps: [ask({ options: [{ title: 'Yes', steps: [{ id: 'run' }] }] }), run] }));
    expect(fails.filter((p) => p.note === 'askBackgroundFails')).toHaveLength(1);
    expect(fails.filter((p) => p.note === 'askBackground')).toEqual([]);
    expect(parts(wf()).filter((p) => p.note === 'askBackground' || p.note === 'askBackgroundFails')).toEqual([]);
  });
  it('an answer with two routes says they run side by side, once, before the answers', () => {
    const ps = parts(wf({ entry_point: { id: 'q' }, steps: [ask({ options: [{ title: 'Yes', steps: [{ id: 'run' }, { id: 'more' }] }], next_steps: [{ id: 'run' }, { id: 'more' }] }), run, { id: 'more', type: 'bash', command: 'b' }] }));
    expect(ps.filter((p) => p.note === 'together')).toHaveLength(1);
    expect(ps.findIndex((p) => p.note === 'together')).toBe(ps.findIndex((p) => p.k === 'wfNext') - 1);
  });
  it('options on a step that asks nothing lead nowhere: the agent reads them only on a question', () => {
    const ps = parts(wf({ entry_point: { id: 'a' }, steps: [{ id: 'a', type: 'bash', command: 'ls', options: [{ title: 'Yes', steps: [{ id: 'run' }] }] }, run] }));
    expect(routes(ps)).toEqual([]);
    expect(ps[ps.findIndex((p) => p.k === 'wfStep' && p.id === 'run') + 1]).toEqual({ k: 'wfNote', note: 'unreached' });
    expect(of(parts(wf({ entry_point: { id: 'a' }, steps: [{ id: 'a', type: 'bash', command: 'ls', options: 'odd' }] })), 'wfStep'), 'but the agent checks them, and refuses that shape').toEqual([]);
  });
  it('every kind of step names what it needs', () => {
    const ps = parts(wf({ entry_point: { id: 'a' }, steps: [
      { id: 'a', type: 'agent', agent: 'general', prompt: 'p', next_steps: [{ id: 'b' }, { id: 'c' }, { id: 'd' }, { id: 'e' }, { id: 'f' }] },
      { id: 'b', type: 'agent', fork_from: 'a', prompt: 'q' }, { id: 'c', type: 'tool', tool: 'list_tasks' }, { id: 'd', type: 'workflow', workflow: 'sub' },
      { id: 'e', type: 'foreach', workflow: 'each', list: '["x"]' }, { id: 'f', type: 'future', workflow: 'x' },
    ] }));
    expect(of(ps, 'wfStep').map((p) => [p.kind, p.arg])).toEqual([['agent', 'general'], ['fork', 'a'], ['tool', 'list_tasks'], ['workflow', 'sub'], ['foreach', 'each'], ['other', 'future']]);
  });
  it('past 30 steps the rest are counted, and are still in the JSON', () => {
    const steps = Array.from({ length: 33 }, (_, i) => ({ id: `s${i}`, type: 'bash', command: 'ls' }));
    const ps = parts(wf({ entry_point: { id: 's0' }, steps }));
    expect(of(ps, 'wfStep')).toHaveLength(30);
    expect(of(ps, 'wfMore')).toEqual([{ k: 'wfMore', n: 3 }]);
    expect(json(ps).src).toContain('"s32"');
  });
  it('steps a run never reaches still show, after the ones it does, and say so', () => {
    const ps = parts(wf({ steps: [{ id: 'lost', type: 'bash', command: 'rm x', next_steps: [{ id: 'explain' }] }, check, explain] }));
    expect(of(ps, 'wfStep').map((p) => p.id)).toEqual(['check', 'explain', 'lost']);
    expect(ps[ps.findIndex((p) => p.k === 'wfStep' && p.id === 'lost') + 1]).toEqual({ k: 'wfNote', note: 'unreached' });
    expect(ps.filter((p) => p.note === 'unreached')).toHaveLength(1);
  });
  it('run-time inputs are named, the required ones so', () => {
    const ps = parts(wf({ params: [{ name: 'folder', required: true }, { name: 'depth', default: '1' }, { nope: 1 }] }));
    expect(ps.filter((p) => p.k === 'kv' && p.name === 'input').map((p) => p.value)).toEqual(['folder (required)', 'depth']);
  });
  it('the card cleans what it shows', () => {
    const ps = parts(wf({ summary: 'ok\u001b[31m red', entry_point: { id: 'a' }, steps: [{ id: 'a', type: 'agent', agent: 'gen\u0007eral', prompt: 'p' }] }));
    expect(JSON.stringify(ps.filter((p) => p.k !== 'code'))).not.toMatch(/\\u001b|\\u0007/);
  });
  it.each([
    ['no definition', { name: 'x' }],
    ['a definition that is not an object', { name: 'x', definition: 'nope' }],
    ['no steps', { name: 'x', definition: { entry_point: { id: 'a' } } }],
    ['empty steps', { name: 'x', definition: { steps: [] } }],
    ['steps of another shape', { name: 'x', definition: { steps: 'a' } }],
    ['a step that is not an object', { name: 'x', definition: { entry_point: { id: 'a' }, steps: [{ id: 'a', type: 'bash' }, 3] } }],
    ['an array step with no id', { name: 'x', definition: { entry_point: { id: 'a' }, steps: [{ type: 'bash', command: 'ls' }] } }],
    ['no entry step', { name: 'x', definition: { steps: [{ id: 'a', type: 'bash' }] } }],
    ['an entry step that isn\'t there', { name: 'x', definition: { entry_point: { id: 'b' }, steps: [{ id: 'a', type: 'bash' }] } }],
    ['a route the agent refuses', { name: 'x', definition: { entry_point: { id: 'a' }, steps: [{ id: 'a', type: 'bash', next_steps: [['b', 'c']] }, { id: 'b', type: 'bash' }] } }],
    ['an answer\'s route the agent refuses', { name: 'x', definition: { entry_point: { id: 'a' }, steps: [{ id: 'a', type: 'tool', tool: 'ask_question_to_user', options: [{ title: 'Yes', steps: [{ nope: 1 }] }] }] } }],
    ['options of another shape', { name: 'x', definition: { entry_point: { id: 'a' }, steps: [{ id: 'a', type: 'tool', tool: 'ask_question_to_user', options: 'nope' }] } }],
    // Shapes the agent refuses: the card draws none of them.
    ['a keyed step whose own id is another', { name: 'x', definition: { entry_point: { id: 'b' }, steps: { a: { id: 'b', type: 'bash', command: 'ls' } } } }],
    ['a keyed step whose own id is another, entered by its key', { name: 'x', definition: { entry_point: { id: 'a' }, steps: { a: { id: 'b', type: 'bash', command: 'ls' } } } }],
    ['two steps with one id', { name: 'x', definition: { entry_point: { id: 'a' }, steps: [{ id: 'a', type: 'bash', command: 'ls' }, { id: 'a', type: 'bash', command: 'rm x' }] } }],
    ['a condition that isn\'t text', { name: 'x', definition: { entry_point: { id: 'a' }, steps: [{ id: 'a', type: 'bash', command: 'ls', next_steps: [{ id: 'stop', execute_if: true }] }] } }],
    ['next steps that are null', { name: 'x', definition: { entry_point: { id: 'a' }, steps: [{ id: 'a', type: 'bash', command: 'ls', next_steps: null }] } }],
    ['options of another shape on a step that asks nothing', { name: 'x', definition: { entry_point: { id: 'a' }, steps: [{ id: 'a', type: 'bash', command: 'ls', options: 'odd' }] } }],
    ['an option route to a step that isn\'t there, on a step that asks nothing', { name: 'x', definition: { entry_point: { id: 'a' }, steps: [{ id: 'a', type: 'bash', command: 'ls', options: [{ title: 'Yes', steps: [{ id: 'gone' }] }] }] } }],
    ['an answer whose title isn\'t text', { name: 'x', definition: { entry_point: { id: 'a' }, steps: [{ id: 'a', type: 'tool', tool: 'ask_question_to_user', question: 'Go?', options: [{ title: 5, steps: [{ id: 'stop' }] }] }] } }],
  ])('%s: the JSON alone, as any other tool', (_n, params) => {
    const ps = parts({ tool: 'upsert_workflow', params });
    expect(ps.map((p) => [p.k, p.key])).toEqual([['code', 'json']]);
    expect(JSON.parse(ps[0].src)).toEqual(params);
  });
  it('where a route goes is read from the saved id: a hidden character before stop is a step, an answer with none of its own is Otherwise', () => {
    const raw = (g: Parameters<typeof C.gateInput>[0]) => (C.gateInput(g) as any[]).filter((p) => p.k === 'wfNext');
    const rlo = raw(wf({ entry_point: { id: 'a' }, steps: [{ id: 'a', type: 'bash', command: 'ls', next_steps: [{ id: '\u202estop' }] }, { id: '\u202estop', type: 'bash', command: 'rm -rf ~' }] }));
    expect(rlo).toEqual([{ k: 'wfNext', end: false, falls: false, to: { text: '"\\u202estop"', odd: true }, n: 2, test: { text: '', odd: false }, answer: null, otherwise: false }]);
    const lri = raw(wf({ entry_point: { id: 'q' }, steps: [ask({ options: [{ title: 'Yes', steps: [{ id: '\u2066' }] }, { title: 'Later' }], next_steps: ['safe'] }), { id: 'safe', type: 'bash', command: 'ls' }, { id: '\u2066', type: 'bash', command: 'rm -rf ~' }] }));
    expect(lri.map((p) => [p.answer?.text ?? null, p.end, p.falls, p.to.text, p.to.odd, p.n])).toEqual([['Yes', false, false, '"\\u2066"', true, 3], ['Later', false, true, '', false, 0], [null, false, false, 'safe', false, 2]]);
    const hidden = parts(wf({ entry_point: { id: '\u200bcheck' }, steps: [{ id: '\u200bcheck', type: 'bash', command: 'ls' }] }));
    expect(of(hidden, 'wfStep').map((p) => [p.id, p.odd])).toEqual([['"\\u200bcheck"', true]]);
    expect(C.gateInput(wf({ entry_point: { id: 'a' }, steps: [{ id: 'a', type: 'bash', command: 'ls', next_steps: [{ id: 'stop', execute_if: '[ 1 = 1\u202e ]' }] }] })).find((p: any) => p.k === 'wfNext')).toMatchObject({ end: true, test: { text: '"[ 1 = 1\\u202e ]"', odd: true } });
    const safe = { id: 'safe', type: 'bash', command: 'ls' };
    const blank = raw(wf({ entry_point: { id: 'q' }, steps: [ask({ options: [{ title: '', steps: [{ id: 'safe' }] }, { title: 'Go', steps: [{ id: 'safe' }] }] }), safe] }));
    const none = raw(wf({ entry_point: { id: 'q' }, steps: [ask({ options: [{ steps: [{ id: 'safe' }] }, { title: 'Go', steps: [{ id: 'safe' }] }] }), safe] }));
    for (const ps of [blank, none]) expect(ps.map((p) => p.answer), 'an answer with nothing to see shows its quotes, marked').toEqual([{ text: '""', odd: true, why: 'blank' }, { text: 'Go', odd: false }]);
    for (const id of ['stop', 'a\u0007b', 'a\u0085b']) expect(of(parts(wf({ entry_point: { id }, steps: [{ id, type: 'bash', command: 'ls' }] })), 'wfStep'), `a step named ${JSON.stringify(id)} the agent refuses`).toEqual([]);
  });
  // The agent runs a step listed twice when any of its entries passes, and ends the path when any stop applies. The
  // entries are one route only when their conditions run alike: both blank by the agent's TrimSpace (which keeps U+FEFF), or the same
  // text, since the agent runs any other as written. Any other pair is the JSON alone, in either order, on next steps and on an answer.
  const twice = (a: unknown, b: unknown) => ({
    next: parts(wf({ entry_point: { id: 'a' }, steps: [{ id: 'a', type: 'bash', command: 'ls', next_steps: [a, b] }, run] })),
    answer: parts(wf({ entry_point: { id: 'q' }, steps: [ask({ options: [{ title: 'Yes', steps: [a, b] }] }), run] })),
  });
  it.each([
    ['both unconditional', 'run', { id: 'run' }, 'run', ''],
    ['both blank by the agent\'s trim', { id: 'run', execute_if: ' \u00a0\t' }, { id: 'run', execute_if: '' }, 'run', ''],
    ['the same condition', { id: 'run', execute_if: 'test -f x' }, { id: 'run', execute_if: 'test -f x' }, 'run', 'test -f x'],
    ['two stops', 'stop', { id: 'stop' }, 'stop', ''],
  ])('a route listed twice is one route when its conditions run alike: %s', (_n, a, b, to, test) => {
    for (const [x, y] of [[a, b], [b, a]]) {
      const { next, answer } = twice(x, y);
      expect(routes(next)).toEqual([['', to, to === 'stop' ? 0 : 2, test]]);
      expect(routes(answer)).toEqual([['Yes', to, to === 'stop' ? 0 : 2, test]]);
      expect(next.filter((p) => p.note === 'together')).toEqual([]);
    }
  });
  it.each([
    ['a condition and none', { id: 'run', execute_if: '[ "$(step.a.success)" = "true" ]' }, 'run'],
    ['a condition that fails and none', { id: 'run', execute_if: 'false' }, { id: 'run' }],
    ['two conditions', { id: 'run', execute_if: 'test -f x' }, { id: 'run', execute_if: 'test -f y' }],
    ['one condition with a space more, run as written', { id: 'run', execute_if: 'test -f x' }, { id: 'run', execute_if: 'test -f x ' }],
    ['U+FEFF, which the agent runs, and none', { id: 'run', execute_if: '\ufeff' }, 'run'],
    ['a stop with a condition and one without', { id: 'stop', execute_if: 'test -f x' }, 'stop'],
  ])('a route listed twice whose conditions differ is the JSON alone: %s', (_n, a, b) => {
    for (const [x, y] of [[a, b], [b, a]]) {
      const { next, answer } = twice(x, y);
      for (const ps of [next, answer]) expect(ps.map((p) => [p.k, p.key])).toEqual([['code', 'json']]);
    }
  });
  // The agent trims the person's answer (TrimSpace) and takes the first answer whose title matches it under
  // strings.EqualFold (simple Unicode case folding). A second title equal to an earlier one that way is never reached, and neither is a
  // title its own TrimSpace would change: the JSON alone, in either order.
  const titled = (title: string | null, steps: unknown[]) => (title === null ? { steps } : { title, steps });
  const answers = (x: string | null, y: string | null) => parts(wf({ entry_point: { id: 'q' }, steps: [ask({ options: [titled(x, ['run']), titled(y, ['stop'])], next_steps: ['run'] }), run] }));
  it.each([
    ['yes', 'Yes'], ['Yes', 'YEſ'], ['OK', 'o\u212a'], ['ϑ', 'ϴ'], ['ß', 'ẞ'], ['Ꭰ', 'ꭰ'], ['', null], ['go', 'go'],
  ])('answers %j and %j, one title to the agent, are the JSON alone', (a, b) => {
    for (const [x, y] of [[a, b], [b, a]] as const) expect(answers(x, y).map((p) => [p.k, p.key])).toEqual([['code', 'json']]);
    const apart = parts(wf({ entry_point: { id: 'q' }, steps: [ask({ options: [titled(a, ['run']), { title: 'Other', steps: ['run'] }, titled(b, ['stop'])] }), run] }));
    expect(apart.map((p) => [p.k, p.key]), 'with another answer between them').toEqual([['code', 'json']]);
  });
  it.each([[' Yes'], ['Yes\u00a0'], ['  '], ['\u0085'], ['Yes\u3000']])('an answer titled %j, which the agent\'s trimmed answer never matches, is the JSON alone', (a) => {
    for (const [x, y] of [[a, 'No'], ['No', a]] as const) expect(answers(x, y).map((p) => [p.k, p.key])).toEqual([['code', 'json']]);
  });
  it('answers the agent tells apart still show, each on its own route', () => {
    for (const [x, y] of [['ß', 'ss'], ['İ', 'i'], ['ı', 'i'], ['yes', 'yes!'], ['a.c', 'abc'], ['(', ')'], ['[x', 'x]'], ['a*', 'aaa']] as const) {
      expect(routes(answers(x, y)), `${x} and ${y}`).toEqual([[x, 'run', 2, ''], [y, 'stop', 0, ''], ['', 'run', 2, '']]);
    }
    const bom = (C.gateInput(wf({ entry_point: { id: 'q' }, steps: [ask({ options: [{ title: '\ufeffYes', steps: ['run'] }, { title: 'Yes', steps: ['stop'] }] }), run] })) as any[]).filter((p) => p.k === 'wfNext');
    expect(bom.map((p) => p.answer), 'the agent\'s trim keeps U+FEFF: a title it starts is its own, shown with its code').toEqual([{ text: '"\\ufeffYes"', odd: true }, { text: 'Yes', odd: false }]);
  });
  // The condition is trimmed as the agent's strings.TrimSpace trims it, never by JS trim, which
  // drops U+FEFF and keeps U+0085. The agent runs a lone U+FEFF as a command, so it never reads as no condition.
  const cond = (execute_if: string) => (C.gateInput(wf({ entry_point: { id: 'a' }, steps: [{ id: 'a', type: 'bash', command: 'ls', next_steps: [{ id: 'run', execute_if }] }, run] })) as any[])
    .filter((p) => p.k === 'wfNext').map((p) => p.test);
  it('a condition reads as the agent trims it: U+FEFF stays and is marked, U+0085 goes', () => {
    expect(cond('\ufeff'), 'a lone U+FEFF is a condition the agent runs').toEqual([{ text: '"\\ufeff"', odd: true }]);
    expect(cond(' \ufeff[ -f /tmp/ok ] '), 'a condition it starts shows with its code').toEqual([{ text: '"\\ufeff[ -f /tmp/ok ]"', odd: true }]);
    expect(cond('\u0085'), 'a lone U+0085 is blank to the agent: no condition').toEqual([{ text: '', odd: false }]);
    expect(cond('\u0085test -f x\u0085'), 'U+0085 at either end goes, as the agent trims it').toEqual([{ text: 'test -f x', odd: false }]);
  });
  // A double quote in an answer's title would close the card's own quotes around it.
  it('an answer whose title holds a double quote shows in JSON quotes, marked', () => {
    const titles = (...ts: string[]) => (C.gateInput(wf({ entry_point: { id: 'q' }, steps: [ask({ options: ts.map((title) => ({ title, steps: ['run'] })) }), run] })) as any[])
      .filter((p) => p.k === 'wfNext').map((p) => p.answer);
    expect(titles('No\u201d, then', 'Say "hi"', '\u201eJa\u201c', 'Don\'t', 'Yes')).toEqual([
      { text: '"No\u201d, then"', odd: true, why: 'quote' }, { text: '"Say \\"hi\\""', odd: true, why: 'quote' }, { text: '"\u201eJa\u201c"', odd: true, why: 'quote' }, { text: 'Don\'t', odd: false }, { text: 'Yes', odd: false },
    ]);
  });
  // `deploy` and `deploy ` read alike, and so does an id holding U+2800 (the braille blank).
  it('a step id with an ASCII space at either end or a braille blank shows in JSON quotes, marked, in its row and on its routes', () => {
    for (const [id, text, why] of [['deploy ', '"deploy "', 'edge'], [' deploy', '" deploy"', 'edge'], ['dep\u2800loy', '"dep\\u2800loy"', undefined], ['\u2800', '"\\u2800"', undefined]] as const) {
      const ps = C.gateInput(wf({ entry_point: { id: 'a' }, steps: [{ id: 'a', type: 'bash', command: 'ls', next_steps: [id] }, { id, type: 'bash', command: 'make' }] })) as any[];
      const name = why ? { text, odd: true, why } : { text, odd: true };
      expect(ps.filter((p) => p.k === 'wfStep').map((p) => p.id), JSON.stringify(id)).toStrictEqual([{ text: 'a', odd: false }, name]);
      expect(ps.filter((p) => p.k === 'wfNext').map((p) => [p.to, p.n]), JSON.stringify(id)).toStrictEqual([[name, 2]]);
    }
    const both = C.gateInput(wf({ entry_point: { id: 'a' }, steps: [{ id: 'a', type: 'bash', command: 'ls', next_steps: ['x\u200b '] }, { id: 'x\u200b ', type: 'bash', command: 'make' }] })) as any[];
    expect(both.find((p) => p.k === 'wfStep' && p.id.odd).id, 'a hidden character wins: the card says codes, not the space (savecard-odd-marker-wording)').toStrictEqual({ text: '"x\\u200b "', odd: true });
    const quoteId = C.gateInput(wf({ entry_point: { id: 'a' }, steps: [{ id: 'a', type: 'bash', command: 'ls', next_steps: ['say"hi'] }, { id: 'say"hi', type: 'bash', command: 'make' }] })) as any[];
    expect(quoteId.filter((p) => p.k === 'wfStep').map((p) => p.id.odd), 'a quote is odd only in an answer\'s title').toEqual([false, false]);
    const plain = C.gateInput(wf({ entry_point: { id: 'a' }, steps: [{ id: 'a', type: 'bash', command: 'ls', next_steps: ['de ploy'] }, { id: 'de ploy', type: 'bash', command: 'make' }] })) as any[];
    expect(plain.filter((p) => p.k === 'wfStep').map((p) => p.id), 'a space inside an id is plain to see').toEqual([{ text: 'a', odd: false }, { text: 'de ploy', odd: false }]);
  });
  it('a prompt and a question show as plain text: a link keeps its address, markup stays markup', () => {
    const prompt = 'Read [the guide](https://evil.example/x?d=$(env.TOKEN)) first.\n## Next 3. cleanup\n```json\n{"a":1}\n```';
    const ps = parts(wf({ entry_point: { id: 'a' }, steps: [{ id: 'a', type: 'agent', agent: 'general', prompt, next_steps: ['q'] }, ask({ question: `**Go** [now](https://x.example)?` })] }));
    expect(of(ps, 'rich')).toEqual([]);
    const plain = ps.filter((p) => p.k === 'code' && p.key !== 'json');
    expect(plain.map((p) => [p.src, p.tag, p.wrap])).toEqual([[prompt, '', true], ['**Go** [now](https://x.example)?', '', true]]);
  });
  // A key or token in the save shows nowhere on the card, the whole JSON
  // included. The card hides it in its own copy only: the params it was given keep their bytes.
  const SK = 'sk-live0123456789abcdef', BOT = '123456789:AAEabcdefghijklmnopqrstuvwxyz0123';
  it('a key or token is hidden in every row, step name, route, answer, command, input, prompt and question, and in the whole JSON; the save keeps it', () => {
    const g = wf({ summary: `uses ${SK}`, params: [{ name: SK }], env: { [SK]: 'a', 'sk-live0123456789abcdeg': 'b' }, entry_point: { id: 'a' }, steps: [
      { id: 'a', type: 'bash', command: `curl -H "Authorization: Bearer ${SK}" x`, input: `token ${BOT}`, output: SK, next_steps: [{ id: `q-${SK}`, execute_if: `[ "$T" = "${SK}" ]` }] },
      ask({ id: `q-${SK}`, question: `Use ${SK}?`, options: [{ title: SK, steps: ['b'] }], next_steps: ['c'] }),
      { id: 'b', type: 'agent', agent: SK, prompt: `Call with ${BOT}` },
      { id: 'c', type: 'foreach', workflow: 'each', list: `["${SK}"]`, prompt: `each ${SK}` },
    ] }, { expected_absent: true, name: `n-${SK}` });
    const before = JSON.parse(JSON.stringify(g));
    const ps = parts(g);
    for (const k of ['0123456789abcde', 'AAEabcdefghijklmnopqrstuvwxyz']) expect(JSON.stringify(ps)).not.toContain(k);
    expect(g, 'the save keeps its bytes').toEqual(before);
    const kv = (name: string) => ps.filter((p) => p.k === 'kv' && p.name === name).map((p) => p.value);
    expect([kv('name'), kv('summary'), kv('input'), kv('output'), kv('list')]).toEqual([['n-[hidden]'], ['uses [hidden]'], ['[hidden]'], ['[hidden]'], ['["[hidden]"]']]);
    expect(of(ps, 'wfStep').map((p) => [p.n, p.id, p.odd, p.arg])).toEqual([[1, 'a', false, ''], [2, 'q-[hidden]', false, ''], [3, 'c', false, 'each'], [4, 'b', false, '[hidden]']]);
    expect(routes(ps), 'a route still goes where the saved id says').toEqual([['', 'q-[hidden]', 2, '[ "$T" = "[hidden]" ]'], ['[hidden]', 'b', 4, ''], ['', 'c', 3, '']]);
    expect(ps.filter((p) => p.k === 'code' && p.key !== 'json').map((p) => [p.key, p.src])).toEqual([
      ['step-1', 'curl -H "Authorization: Bearer [hidden]" x'], ['step-1-input', 'token [hidden]'], ['step-2-question', 'Use [hidden]?'],
      ['step-3-prompt', 'each [hidden]'], ['step-4-prompt', 'Call with [hidden]'],
    ]);
    const whole = JSON.parse(json(ps).src);
    expect([whole.name, whole.definition.summary, whole.definition.steps[0].command, whole.definition.steps[2].agent]).toEqual(['n-[hidden]', 'uses [hidden]', 'curl -H "Authorization: Bearer [hidden]" x', '[hidden]']);
    expect(whole.definition.env, 'two names hidden alike stay two entries').toEqual({ '[hidden]': 'a', '[hidden] #2': 'b' });
  });
  it('in the whole JSON a key split by what a person can\'t see is hidden before it is written as escapes; a save it can\'t read too', () => {
    const split = 'sk-live\u200b0123456789\u00adabcdef';
    const g = wf({ entry_point: { id: 'a' }, steps: [{ id: 'a', type: 'bash', command: 'ls', input: `x ${split} y`, next_steps: [{ id: 'stop', execute_if: `[ "$T" = "${split}" ]` }] }] });
    const src: string = json(parts(g)).src;
    expect(JSON.parse(src).definition.steps[0].input).toBe('x [hidden] y');
    expect(src).not.toContain('0123456789');
    expect((C.gateInput(g) as any[]).find((p) => p.k === 'wfNext').test, 'a name or condition too, read as the card shows it').toEqual({ text: '[ "$T" = "[hidden]" ]', odd: false });
    const refused = parts({ tool: 'upsert_workflow', params: { name: `b ${SK}`, definition: { steps: 'odd' } } });
    expect(refused.map((p) => [p.k, p.key])).toEqual([['code', 'json']]);
    expect(JSON.parse(refused[0].src)).toEqual({ name: 'b [hidden]', definition: { steps: 'odd' } });
  });
  it('the daemon\'s detail on a save is scrubbed too: its notices, and a tagged diff on a save the card can\'t read', () => {
    const said = (C.gateInput({ ...wf(), detail: `⚠ uses ${SK}\nSaved under billing.` }) as any[]).filter((p) => p.k === 'warn' || p.k === 'rich');
    expect(said).toEqual([{ k: 'warn', text: '⚠ uses [hidden]' }, { k: 'rich', text: 'Saved under billing.' }]);
    const refused = (C.gateInput({ tool: 'upsert_workflow', params: { name: 'b', definition: { steps: 'odd' } }, detail: `H +1 -1 lines\nR 1 token: ${SK}\nA 1 token: ${BOT}` }) as any[]);
    expect(refused.find((p) => p.k === 'diff')?.parts.rows).toEqual([{ t: '-', s: 'token: [hidden]' }, { t: '+', s: 'token: [hidden]' }]);
  });
  it('another tool with the same fields is untouched', () => {
    const ps = parts({ tool: 'read_workflow', params: { name: 'x', definition: { entry_point: { id: 'a' }, steps: [{ id: 'a', type: 'bash' }] } } });
    expect(ps.map((p) => p.k)).toEqual(['code']);
  });
});
