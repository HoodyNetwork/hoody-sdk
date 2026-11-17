// Vitest: every code block Ask draws is coloured by the kit CodeBlock: the Needs-you card's
// arguments (JSON), a bash command, a file the agent wants to write (by its name), and a reply's fenced code. The text
// is still scrubbed first, and a block the kit cannot colour shows plain.
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CODE_LANG_WORDS, GateCard, Prose, type CardProps } from '@kit';
import { kitLang } from './code';
import { gateOf } from './logic';

const card = (tool: string, params: Record<string, unknown>) => {
  const gate = gateOf({ id: 'gate-1', generation: 1 }, 'confirm', { tool_name: tool, params });
  const p: CardProps = { gate, pending: false, unknown: false, agentUrl: '', typing: true, onDecide: vi.fn(), onAnswer: vi.fn(), onCheck: vi.fn() };
  return render(<GateCard {...p} />).container;
};
const coloured = (el: Element, cls: string) => Array.from(el.querySelectorAll(`pre .${cls}`)).map((x) => x.textContent);

describe('Ask code blocks are coloured', () => {
  it('the Needs-you card colours a tool\'s JSON arguments', () => {
    const el = card('hoody_cron', { action: 'create', entry: { schedule: '0 3 * * *', enabled: true, retries: 2 } });
    expect(coloured(el, 'hl_key')).toEqual(expect.arrayContaining(['"action"', '"entry"', '"schedule"']));
    expect(coloured(el, 'hl_str')).toEqual(expect.arrayContaining(['"create"', '"0 3 * * *"']));
    expect(coloured(el, 'hl_lit')).toContain('true');
    expect(coloured(el, 'hl_num')).toContain('2');
  });
  it('a bash command is coloured as shell', () => {
    const el = card('bash', { command: 'ls -la "$HOME"' });
    expect(el.querySelector('pre [class^="sh_"]')).not.toBeNull();
  });
  it('a file to write is coloured by its name', () => {
    const el = card('write_file', { path: '/srv/app/config.json', content: '{"port": 8080}' });
    expect(coloured(el, 'hl_key')).toContain('"port"');
    expect(coloured(el, 'hl_num')).toContain('8080');
  });
  // The card shows what runs as written, never cleaned. A control or bidi character is not dropped:
  // the JSON writes it as an escape, a file's text shows it as a visible mark, and no raw one reaches the screen.
  it('the arguments show a control or bidi character as an escape, never raw and never dropped', () => {
    const el = card('hoody_cron', { action: 'cre\u202eate\u0007' });
    const pre = el.querySelector('pre')?.textContent ?? '';
    expect(pre).toContain('"cre\\u202eate\\u0007"');
    expect(pre).not.toMatch(/[\u202e\u0007]/);
  });
  it('a file to write shows a control or bidi character as a visible mark before it is coloured, never raw', () => {
    const el = card('write_file', { path: '/srv/app/a.json', content: '{"na\u202eme\u0007": 1}' });
    const pre = el.querySelector('pre')?.textContent ?? '';
    expect(pre).toContain('"na⟨U+202E⟩me⟨BEL⟩"');
    expect(pre).not.toMatch(/[\u202e\u0007]/);
  });
  it('a reply\'s fenced JSON is coloured', () => {
    const { container } = render(<Prose text={'```json\n{"ok": false}\n```'} />);
    expect(coloured(container, 'hl_key')).toContain('"ok"');
    expect(coloured(container, 'hl_lit')).toContain('false');
  });
  // An edit's change and a reply's fenced diff show removed and added lines in colour.
  it('an edit card\'s change and a fenced diff colour removed and added lines', () => {
    const el = card('edit_file', { path: '/srv/app/notes.txt', old_string: 'one\ntwo', new_string: 'one\nthree' });
    expect(coloured(el, 'hl_del')).toEqual(['- two']);
    expect(coloured(el, 'hl_ins')).toEqual(['+ three']);
    const { container } = render(<Prose text={'```diff\n@@ -1 +1 @@\n-old\n+new\n```'} />);
    expect(coloured(container, 'hl_meta')).toEqual(['@@ -1 +1 @@']);
    expect(coloured(container, 'hl_del')).toEqual(['-old']);
    expect(coloured(container, 'hl_ins')).toEqual(['+new']);
  });
  it('kitLang: the tag wins, else the file name; a language the kit does not colour is plain', () => {
    expect(kitLang('json')).toBe('json');
    expect(kitLang('bash')).toBe('shell');
    expect(kitLang('TSX')).toBe('ts');
    expect(kitLang('yml')).toBe('yaml');
    expect(kitLang('', '/a/b/run.py')).toBe('python');
    expect(kitLang('json', '/a/b/x.py')).toBe('json');
    expect(kitLang('diff')).toBe('diff');
    expect(kitLang('', '/tmp/fix.patch')).toBe('diff');
    expect(kitLang('css', 'x.css')).toBe('plain');
    expect(kitLang('')).toBe('plain');
  });
  it('kitLang reads the kit\'s one table: every word as a tag, and as a file extension', () => {
    for (const [lang, words] of CODE_LANG_WORDS) for (const w of words.split(' ')) {
      expect([w, kitLang(w)]).toEqual([w, lang]);
      if (w.length <= 8) expect([w, kitLang('', `/a/f.${w}`)]).toEqual([w, lang]);
    }
  });
});
