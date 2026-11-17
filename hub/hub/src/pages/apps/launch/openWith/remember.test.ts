// Vitest: the remembered Open-with choice. The stored value holds no file name; it fails
// closed; it never stores Run in a terminal or a folder action; it stays within 16,000 bytes and 48 types, the least
// recently used type going first.
import { describe, expect, it } from 'vitest';
import { REMEMBER_MAX_BYTES, REMEMBER_MAX_TYPES, bytesOf, choiceFor, emptyDoc, forget, keepable, parseDoc, remember, touch, typeOf, type RememberDoc } from './remember';

const nano = { p: 'tpl', target: 'file' as const, tpl: 'nano' };

describe('typeOf: a known extension or a kind, never the name', () => {
  it('keeps a known extension, a kind for the rest, nothing for a folder', () => {
    expect(typeOf('a b.TXT')).toBe('.txt');
    expect(typeOf('Makefile')).toBe('kind:code');
    expect(typeOf('my-secret-project.qqq')).toBe('kind:unknown');
    expect(typeOf('notes', { decodedText: true })).toBe('kind:text');
    expect(typeOf('src', { dir: true })).toBeNull();
    // A name the table has no row for never becomes a type of its own.
    expect(typeOf('.secretname')).toBe('kind:unknown');
  });
});

describe('remember: what may be kept', () => {
  it('never stores Run in a terminal or a folder action (run_never_default_or_remembered)', () => {
    expect(remember(emptyDoc(), '.sh', { p: 'run', target: 'file' }, 1)).toBeNull();
    expect(remember(emptyDoc(), '.sh', { p: 'here', target: 'dir' }, 1)).toBeNull();
    expect(remember(emptyDoc(), '.txt', { p: 'tpl', target: 'dir', tpl: 'thunar' }, 1)).toBeNull();
    expect(remember(emptyDoc(), '.txt', { p: 'cmd', target: 'dir', text: 'ls "$1"', opens: 'terminal' }, 1)).toBeNull();
    expect(keepable({ p: 'run', target: 'file' })).toBe(false);
    expect(keepable({ p: 'apphere' })).toBe(false);
  });
  it('keeps a template or a command for a file; refuses a folder template, a long or empty command, a bad type', () => {
    expect(remember(emptyDoc(), '.txt', nano, 5)).toEqual({ v: 1, t: { '.txt': { c: { k: 'tpl', id: 'nano' }, u: 5 } } });
    expect(remember(emptyDoc(), '.txt', { p: 'cmd', target: 'file', text: 'wc -l "$1"', opens: 'terminal' }, 5)?.t['.txt']?.c).toEqual({ k: 'cmd', text: 'wc -l "$1"', opens: 'terminal' });
    expect(remember(emptyDoc(), '.txt', { p: 'tpl', target: 'file', tpl: 'thunar' }, 5)).toBeNull();
    expect(remember(emptyDoc(), '.txt', { p: 'tpl', target: 'file', tpl: 'nope' }, 5)).toBeNull();
    expect(remember(emptyDoc(), '.txt', { p: 'cmd', target: 'file', text: 'x'.repeat(1025), opens: 'terminal' }, 5)).toBeNull();
    expect(remember(emptyDoc(), '.txt', { p: 'cmd', target: 'file', text: '   ', opens: 'terminal' }, 5)).toBeNull();
    expect(remember(emptyDoc(), 'a b.txt', nano, 5)).toBeNull();
  });
});

describe('remember: budget, least recently used out first', () => {
  it('holds at most 48 types: the oldest goes, the newest stays', () => {
    let d: RememberDoc = emptyDoc();
    for (let i = 0; i < REMEMBER_MAX_TYPES; i++) d = remember(d, `kind:k${String.fromCharCode(97 + (i % 26))}${String.fromCharCode(97 + Math.floor(i / 26))}`, nano, 100 + i)!;
    expect(Object.keys(d.t)).toHaveLength(REMEMBER_MAX_TYPES);
    // The oldest (u 100) was used again: the next oldest goes instead.
    d = touch(d, 'kind:kaa', 1000);
    d = remember(d, '.txt', nano, 2000)!;
    expect(Object.keys(d.t)).toHaveLength(REMEMBER_MAX_TYPES);
    expect(d.t['.txt']).toBeDefined();
    expect(d.t['kind:kaa']).toBeDefined();
    expect(d.t['kind:kba']).toBeUndefined();
  });
  it('stays within 16,000 bytes: long commands push the least recently used out', () => {
    let d: RememberDoc = emptyDoc();
    const text = 'y'.repeat(1000);
    const types = ['.txt', '.md', '.py', '.sh', '.js', '.ts', '.go', '.rs', '.c', '.h', '.java', '.rb', '.pl', '.php', '.lua', '.css', '.json', '.yaml'];
    types.forEach((ty, i) => { d = remember(d, ty, { p: 'cmd', target: 'file', text, opens: 'terminal' }, i + 1)!; });
    expect(bytesOf(d)).toBeLessThanOrEqual(REMEMBER_MAX_BYTES);
    expect(d.t['.yaml']).toBeDefined();
    expect(d.t['.txt']).toBeUndefined();
    // What is left is the newest run of types, in order.
    const kept = Object.keys(d.t);
    expect(types.slice(types.length - kept.length)).toEqual(expect.arrayContaining(kept));
    expect(parseDoc(JSON.parse(JSON.stringify(d)))).toEqual(d);
  });
  it('forget drops a type; choiceFor reads one', () => {
    const d = remember(emptyDoc(), '.txt', nano, 1)!;
    expect(choiceFor(d, '.txt')).toEqual({ k: 'tpl', id: 'nano' });
    expect(choiceFor(d, null)).toBeNull();
    expect(forget(d, '.txt')).toEqual(emptyDoc());
  });
});

describe('parseDoc fails closed', () => {
  const good = { v: 1, t: { '.txt': { c: { k: 'tpl', id: 'nano' }, u: 1 } } };
  it('reads a good value', () => {
    expect(parseDoc(good)).toEqual(good);
  });
  it.each([
    ['null', null],
    ['an array', []],
    ['another version', { ...good, v: 2 }],
    ['an extra top key', { ...good, x: 1 }],
    ['a name as a type', { v: 1, t: { 'a b.txt': { c: { k: 'tpl', id: 'nano' }, u: 1 } } }],
    ['an unknown template', { v: 1, t: { '.txt': { c: { k: 'tpl', id: 'zed' }, u: 1 } } }],
    ['a folder template', { v: 1, t: { '.txt': { c: { k: 'tpl', id: 'thunar' }, u: 1 } } }],
    ['Run stored', { v: 1, t: { '.sh': { c: { k: 'run' }, u: 1 } } }],
    ['a path in a choice', { v: 1, t: { '.txt': { c: { k: 'tpl', id: 'nano', path: '/home/x' }, u: 1 } } }],
    ['a long command', { v: 1, t: { '.txt': { c: { k: 'cmd', text: 'z'.repeat(1025), opens: 'terminal' }, u: 1 } } }],
    ['a bad opens', { v: 1, t: { '.txt': { c: { k: 'cmd', text: 'ls', opens: 'window' }, u: 1 } } }],
    ['a bad time', { v: 1, t: { '.txt': { c: { k: 'tpl', id: 'nano' }, u: -1 } } }],
    ['too many types', { v: 1, t: Object.fromEntries(Array.from({ length: 49 }, (_, i) => [`kind:k${String.fromCharCode(97 + (i % 26))}${String.fromCharCode(97 + Math.floor(i / 26))}`, { c: { k: 'tpl', id: 'nano' }, u: i }])) }],
    ['over the byte budget', { v: 1, t: Object.fromEntries(Array.from({ length: 17 }, (_, i) => [`kind:x${String.fromCharCode(97 + i)}`, { c: { k: 'cmd', text: 'q'.repeat(1000), opens: 'terminal' }, u: i }])) }],
  ])('%s reads as nothing remembered', (_, raw) => {
    expect(parseDoc(raw)).toEqual(emptyDoc());
  });
});

describe('row names', () => {
  it('every program word a row name starts with fits OW_PROGRAM_MAX (so a bounded label is never cut later)', async () => {
    const { TEMPLATES } = await import('./templates');
    const { OW_PROGRAM_MAX } = await import('../../links');
    const words = (await import('./strings.en.json')).default as Record<string, string>;
    for (const n of [...TEMPLATES.map((x) => x.name), words['ow.chooser.cmdName']!, words['ow.chooser.runName']!, words['ow.chooser.hereName']!]) expect(n.length, n).toBeLessThanOrEqual(OW_PROGRAM_MAX);
  });
});
