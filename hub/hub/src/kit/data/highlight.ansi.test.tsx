// Vitest: terminal output in CodeBlock (lang 'ansi'). SGR 0, 1, 30-37 and 90-97 change the
// look; every other escape, control character, bidi mark and BOM is removed; nothing is markup; Copy gives the shown text.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { ansiLines, ansiTokens, stripAnsi, HL_MAX } from './highlight';
import { CodeBlock } from './Ids';

const E = '\x1b';
const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'Ids.module.css'), 'utf8');

describe('ansiTokens', () => {
  it('SGR colours, bright colours and bold; 0 and an empty SGR reset', () => {
    expect(ansiTokens(`${E}[31mred${E}[0m plain ${E}[1;92mok${E}[m end`)).toEqual([
      { text: 'red', fg: 'red' },
      { text: ' plain ' },
      { text: 'ok', fg: 'green', bold: true },
      { text: ' end' },
    ]);
  });

  it('256-colour and true-colour arguments never read as a colour; other SGR parameters change nothing', () => {
    expect(ansiTokens(`${E}[38;5;31ma${E}[38;2;31;32;33mb${E}[4;7mc`)).toEqual([{ text: 'abc' }]);
    expect(ansiTokens(`${E}[38;5;1;31mx`)).toEqual([{ text: 'x', fg: 'red' }]);
  });

  it('every other escape and control is removed: cursor moves, OSC titles and links, charset, C1, bidi, BOM', () => {
    const src = `a${E}[2K${E}[1Ab${E}]0;title\x07c${E}]8;;https://x.example/\x1b\\d${E}(Be\x9b31mf\x07g\u202eh\ufeffi\x00j`;
    expect(stripAnsi(src)).toBe('abcdefghij');
    expect(ansiTokens(src).every((t) => !/[\x00-\x08\x0b-\x1f\x7f-\x9f\u202e\ufeff]/.test(t.text))).toBe(true);
  });

  it('line breaks become newlines; tabs stay; the tokens join back to exactly stripAnsi', () => {
    const src = `one\r\ntwo\rthree\u2028four\tfive ${E}[33m\nsix`;
    expect(stripAnsi(src)).toBe('one\ntwo\nthree\nfour\tfive \nsix');
    expect(ansiTokens(src).map((t) => t.text).join('')).toBe(stripAnsi(src));
    expect(ansiLines(src).map((l) => l.map((t) => t.text).join(''))).toEqual(['one', 'two', 'three', 'four\tfive ', 'six']);
    expect(ansiLines(src)[4]).toEqual([{ text: 'six', fg: 'yellow' }]);
  });

  it('a CR and the LF after it are one break even with an escape between them', () => {
    const src = `a\r${E}[31m\nb`;
    expect(stripAnsi(src)).toBe('a\nb');
    expect(ansiLines(src)).toEqual([[{ text: 'a' }], [{ text: 'b', fg: 'red' }]]);
    expect(stripAnsi(`a\r${E}[1m${E}[0m\r\nb\r`)).toBe('a\n\nb\n');
  });

  it('a string with no terminator ends at the next escape, so the text after it shows with its colour', () => {
    expect(ansiTokens(`a${E}]0;title${E}[31mred`)).toEqual([{ text: 'a' }, { text: 'red', fg: 'red' }]);
    expect(stripAnsi(`a\x9d0;t\x9dx\x9cb`)).toBe('ab');
  });

  it('many string introducers with no terminator are read in linear time', () => {
    for (const intro of [`${E}]`, '\x9d', `${E}P`]) {
      const started = performance.now();
      expect(stripAnsi(`${intro.repeat(100_000)}x`)).toBe('');
      expect(performance.now() - started).toBeLessThan(2000);
    }
  });

  it('an unterminated sequence at the end is removed, never shown', () => {
    expect(stripAnsi(`x${E}[31`)).toBe('x');
    expect(stripAnsi(`x${E}]0;title`)).toBe('x');
    expect(stripAnsi(`x${E}`)).toBe('x');
  });

  it('a very long output keeps its text and no colour', () => {
    const src = `${E}[31m${'a'.repeat(HL_MAX)}`;
    expect(ansiTokens(src)).toEqual([{ text: 'a'.repeat(HL_MAX) }]);
  });
});

let written: string[] = [];
beforeEach(() => {
  written = [];
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: (text: string) => (written.push(text), Promise.resolve()) } });
});

describe('CodeBlock lang="ansi"', () => {
  it('draws the colours as spans of text, never markup, and copies the shown text', () => {
    const { container } = render(<CodeBlock label="Output" lang="ansi" code={`${E}[1;31m<img src=x onerror=alert(1)>${E}[0m\nok ${E}[32mdone${E}[0m\n`} />);
    expect(container.querySelector('img')).toBeNull();
    const pre = container.querySelector('pre')!;
    expect(pre.textContent).toBe('<img src=x onerror=alert(1)>\nok done');
    expect(pre.textContent).not.toContain(E);
    const red = [...pre.querySelectorAll('span span')].find((n) => n.textContent === '<img src=x onerror=alert(1)>')!;
    expect(red.className).toMatch(/ansi_red/);
    expect(red.className).toMatch(/ansi_bold/);
    fireEvent.click(screen.getByRole('button', { name: /copy/i }));
    expect(written).toEqual(['<img src=x onerror=alert(1)>\nok done\n']);
  });

  it('a step line reads its text parts as one text, as Copy does: a sequence split across parts never shows in part', () => {
    const { container } = render(<CodeBlock label="Output" lang="ansi" lines={[{ caption: 'Run', code: ['a', `${E}[3`, '1mred', `${E}[0m b`] }]} />);
    expect(container.textContent).toContain('ared b');
    expect(container.textContent).not.toContain('1mred');
    const red = [...container.querySelectorAll('span')].find((n) => n.textContent === 'red' && /ansi_red/.test(n.className));
    expect(red).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: /^copy run$/i }));
    expect(written).toEqual(['ared b']);
  });

  it('a trailing newline follows the rule of every other language: it ends the last line and Copy keeps it', () => {
    for (const code of ['ok\n', 'ok\n\n', `ok${E}[0m\n`]) {
      const ansi = render(<CodeBlock label="A" lang="ansi" code={code} />);
      const plain = render(<CodeBlock lang="plain" label="P" code={stripAnsi(code)} />);
      expect(ansi.container.querySelector('pre')!.textContent, JSON.stringify(code)).toBe(plain.container.querySelector('pre')!.textContent);
      ansi.unmount();
      plain.unmount();
    }
  });

  it('each colour uses one of the readable kit colour tokens (4.5:1 or more on --hx-fill in both themes)', () => {
    const READABLE = new Set(['--hx-code-blue', '--hx-code-purple', '--hx-r-pink', '--hx-ok', '--hx-warn', '--hx-muted', '--hx-danger']);
    for (const c of ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan']) {
      const rule = new RegExp(`\\.ansi_${c}[\\s,][^{]*\\{([^}]*)\\}`).exec(css);
      expect(rule, c).not.toBeNull();
      const colour = /color:\s*var\((--[\w-]+)\)/.exec(rule![1]!);
      expect(READABLE.has(colour?.[1] ?? ''), `ansi_${c}`).toBe(true);
    }
  });
});
