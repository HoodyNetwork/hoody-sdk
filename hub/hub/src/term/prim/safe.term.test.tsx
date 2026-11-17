// Output safety: the corpus of hostile strings, through safeText alone and through every prim path that draws text.
import { describe, expect, test } from 'bun:test';
import { createElement as h } from 'react';
import { HOST_TEXT_FILTER, MAX_COPY_BYTES, safeCopyText, safeHostProp, safeLinkUrl, safeText, isSafeText } from './safe';
import { Box } from './Box';
import { Text } from './Text';
import { TextInput } from './TextInput';
import { drawTest } from './testing';

const ESC = String.fromCharCode(27);
const BEL = String.fromCharCode(7);
const ST = ESC + '\\';
const C1 = (n: number) => String.fromCharCode(n);

/** name -> hostile input. Each must come out with no control and no format character, and must not equal the input. */
export const CORPUS: Readonly<Record<string, string>> = {
  'OSC 52 clipboard write (BEL)': `${ESC}]52;c;ZWNobyBwd25lZA==${BEL}`,
  'OSC 52 clipboard write (ST)': `${ESC}]52;c;ZWNobyBwd25lZA==${ST}`,
  'OSC 8 link spoof': `${ESC}]8;;https://evil.example/${ST}https://bank.example${ESC}]8;;${ST}`,
  'OSC 0 window title set': `${ESC}]0;sudo password please${BEL}`,
  'OSC 2 title set': `${ESC}]2;hello${ST}`,
  'CSI cursor up + erase line': `ok${ESC}[1A${ESC}[2Kforged line`,
  'CSI cursor position': `${ESC}[H${ESC}[2J`,
  'alt screen switch': `${ESC}[?1049h`,
  'alt screen leave': `${ESC}[?1049l`,
  'DECRQSS probe': `${ESC}P$q"p${ST}`,
  'DA1 probe': `${ESC}[c`,
  'SGR colour': `${ESC}[31mred${ESC}[0m`,
  'APC': `${ESC}_Gf=100;AAAA${ST}`,
  'PM / SOS': `${ESC}^pm${ST}${ESC}Xsos${ST}`,
  '8-bit CSI': `${C1(0x9b)}2J`,
  '8-bit OSC': `${C1(0x9d)}52;c;AAAA${C1(0x9c)}`,
  '8-bit DCS': `${C1(0x90)}$q"p${C1(0x9c)}`,
  '8-bit APC': `${C1(0x9f)}x${C1(0x9c)}`,
  'NUL and BEL': `a${C1(0)}b${BEL}c`,
  'backspace overstrike': 'secret\b\b\b\b\b\bpublic',
  'lone CR overwrite': 'Total: 100\rTotal: 999',
  'DEL': `x${C1(0x7f)}y`,
  'RLO bidi override': 'file\u202Egnp.exe',
  'LRE / PDF': 'a\u202Ab\u202Cc',
  'isolates': 'a\u2066b\u2067c\u2068d\u2069e',
  'LRM / RLM / ALM': 'a\u200Eb\u200Fc\u061Cd',
  'zero width space': 'pay\u200Bpal.com',
  'word joiner + BOM': 'a\u2060b\uFEFFc',
  'soft hyphen': 'ad\u00ADmin',
  'interlinear annotation': '\uFFF9a\uFFFAb\uFFFB',
  'tag characters': 'x\u{E0041}\u{E007F}y',
  'line separator': 'one\u2028two\u2029three',
};

const CONTROL = /[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/u;
const FORMAT = /(?!\u200D)\p{Cf}/u;

describe('safeText', () => {
  for (const [name, input] of Object.entries(CORPUS)) {
    test(name, () => {
      const out = safeText(input);
      expect(out).not.toBe(input);
      expect(CONTROL.test(out)).toBe(false);
      expect(FORMAT.test(out)).toBe(false);
      expect(out.includes(ESC)).toBe(false);
      expect(isSafeText(out)).toBe(true);
    });
  }
  test('replaces controls visibly, removes format characters, keeps LF', () => {
    // Each removed control shows WHICH one it was (its control picture), one cell each; C1 has none and shows U+FFFD.
    expect(safeText(`a\u0000b\u0007c\u0008d\u001be\u007ff\u009bg`)).toBe('a\u2400b\u2407c\u2408d\u241Be\u2421f\uFFFDg');
    expect(safeText('\u001f')).toBe('\u241F');
    expect(safeText(`${ESC}[31mred`)).toBe('\u241B[31mred');
    expect(safeText('file\u202Egnp.exe')).toBe('filegnp.exe');
    expect(safeText('a\r\nb\rc')).toBe('a\nb\nc');
    expect(safeText('a\tb')).toBe('a b');
    expect(safeText('a\nb', { line: true })).toBe('a b');
  });
  test('leaves ordinary text, emoji sequences, CJK and variation selectors alone (same string object)', () => {
    for (const s of ['plain', '👩\u200D👩\u200D👧 family', '日本語のテキスト', '❤️ ✓ · ▾', 'Ünïcödé', 'a\nb']) expect(safeText(s)).toBe(s);
  });
});

describe('links', () => {
  test('only http(s) and Hub routes', () => {
    expect(safeLinkUrl('https://hoody.com/docs')).toEqual({ kind: 'web', url: 'https://hoody.com/docs' });
    expect(safeLinkUrl('http://example.com')).toEqual({ kind: 'web', url: 'http://example.com/' });
    expect(safeLinkUrl('/logs?sel=a')).toEqual({ kind: 'route', path: '/logs?sel=a' });
    for (const bad of ['javascript:alert(1)', 'data:text/html,x', 'file:///etc/passwd', 'mailto:a@b.c', 'ssh://host', '//evil.example', '/\\evil',
      'relative/path', 'https://user:pw@host/', `https://ok.example/${ESC}]8;;x`, 'https://ok.example/\u202Eexe', 'https://a b', '', 'x'.repeat(5000), 42])
      expect(safeLinkUrl(bad)).toBeNull();
  });
  test('host props: a refused link is dropped, a good one kept', () => {
    expect(safeHostProp('href', 'javascript:x')).toBeUndefined();
    expect(safeHostProp('link', { url: 'file:///x' })).toBeUndefined();
    expect(safeHostProp('link', { url: 'https://a.example/' })).toEqual({ url: 'https://a.example/' });
    expect(safeHostProp('title', `a${ESC}]0;x${BEL}\nb`)).toBe('a\u241B]0;x\u2407 b');
    expect(safeHostProp('width', 10)).toBe(10);
    const p = { title: 'ok', width: 3 };
    expect(HOST_TEXT_FILTER.props(p)).toBe(p);
  });
});

describe('clipboard text', () => {
  test('strips controls, keeps newlines and tabs, caps size', () => {
    expect(safeCopyText(`rm -rf /${ESC}[2K\r\nok\tx\u202E`)).toBe('rm -rf /[2K\nok\tx');
    expect(safeCopyText('')).toBeNull();
    expect(safeCopyText('x'.repeat(MAX_COPY_BYTES + 1))).toBeNull();
    expect(safeCopyText(5)).toBeNull();
  });
});

describe('every prim path draws the corpus safely', () => {
  const all = Object.values(CORPUS).join(' | ');
  test('Text, nested spans, Box title, TextInput value and placeholder, loose text', async () => {
    const t = await drawTest(h(Box, { title: CORPUS['OSC 0 window title set'], border: true },
      h(Text, null, all),
      h(Text, null, 'outer ', h(Text, { bold: true }, CORPUS['OSC 52 clipboard write (BEL)']), CORPUS['RLO bidi override']),
      h(TextInput, { value: CORPUS['CSI cursor up + erase line']!, onChange: () => {} }),
      h(TextInput, { value: '', placeholder: CORPUS['alt screen switch'], onChange: () => {} }),
      h(Box, null, CORPUS['8-bit CSI'] as unknown as never),
    ), { width: 120, height: 60 });
    const frame = await t.settle();
    expect(CONTROL.test(frame.replace(/\n/g, ''))).toBe(false);
    expect(FORMAT.test(frame)).toBe(false);
    expect(frame).toContain('\u241B]52;c;');
    expect(frame).toContain('filegnp.exe');
    expect(frame).toContain('forged line');
    t.renderer.destroy();
  });
  test('updates are filtered too (commitTextUpdate and prop updates)', async () => {
    const { useState, useEffect } = await import('react');
    function Flip(): React.ReactElement {
      const [s, set] = useState('safe');
      useEffect(() => { set(CORPUS['SGR colour']!); }, []);
      return h(Box, { title: s, border: true }, h(Text, null, s));
    }
    const t = await drawTest(h(Flip), { width: 40, height: 5 });
    const frame = await t.settle();
    expect(frame).toContain('\u241B[31mred');
    expect(frame.includes(ESC)).toBe(false);
    t.renderer.destroy();
  });
});

test('safeDiagnostic: keeps newlines and tabs, neutralises every control and format character, caps length', async () => {
  const { safeDiagnostic } = await import('./safe');
  for (const hostile of Object.values(CORPUS)) {
    const out = safeDiagnostic('Error: ' + hostile + '\n\tat x');
    expect(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/.test(out)).toBe(false);
    expect(/(?!\u200d)\p{Cf}/u.test(out)).toBe(false);
    expect(out.endsWith('\n\tat x')).toBe(true);
  }
  expect(safeDiagnostic('x'.repeat(10), 4)).toBe('xxxx \u2026[+6]');
  expect(safeDiagnostic(new Error('a\u001b]52;c;Zm9v\u0007b'))).toBe('Error: a\u241B]52;c;Zm9v\u2407b');
});
