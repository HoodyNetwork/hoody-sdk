// Vitest: a key written with %XX escapes reads one decode
// away from the key itself, so the scrub of the written text misses it. parseMd hides each word that decodes to a key (up to
// DECODE_ROUNDS decodes, so a key encoded twice too), in bare text, code spans and fences, and an address encoded twice is refused.
import { describe, expect, it } from 'vitest';
import { scrubSecrets } from './code';
import { parseMd, safeHref } from './md';

const TAIL = 'abcdefghijklmnop';
const forms: ReadonlyArray<readonly [string, string]> = [
  ['the dash encoded', `sk%2D${TAIL}`],
  ['a letter encoded', `s%6B-${TAIL}`],
  ['encoded twice', `sk%252D${TAIL}`],
  ['encoded three times', `sk%25252D${TAIL}`],
  ['encoded four times', `sk%2525252D${TAIL}`],
  ['an invisible encoded inside', `sk-abcdefgh%E2%80%8Bijklmnop`],
];
const shown = (text: string) => JSON.stringify(parseMd(text));

describe('a key written with %XX escapes never shows one decode away', () => {
  // A key whose tail is a token of another family (-ak-): its start goes with the family's marker, never left showing.
  it('a key whose tail is another family\'s token is hidden whole, raw and as a paragraph', () => {
    const text = ['bad key sk-12345678-ak-', 'Ab12Cd34Ef56Gh78Ij90'].join('');
    expect(scrubSecrets(text)).toBe('bad key [hidden]');
    expect(shown(text)).not.toContain('sk-12345678');
    expect(shown(text)).not.toContain('Ab12Cd34Ef56Gh78Ij90');
  });
  for (const [why, k] of forms) {
    it(`${why}: the written scrub misses it`, () => {
      expect(scrubSecrets(k)).toBe(k);
    });
    it(`${why}: bare text, a code span and a fence show it hidden`, () => {
      for (const text of [`token ${k} here`, `token \`${k}\` here`, `token\n\n\`\`\`\nexport T=${k}\n\`\`\``, `- item ${k}`, `| a |\n| -- |\n| ${k} |`]) {
        const s = shown(text);
        expect(s).not.toContain(TAIL.slice(4));
        expect(s).toContain('[hidden]');
      }
    });
  }
  it('a table cell is checked as a table', () => {
    const t = parseMd(`| a |\n| -- |\n| sk%2D${TAIL} |`)[0];
    expect(t?.k).toBe('table');
    expect(JSON.stringify(t)).not.toContain(TAIL.slice(4));
  });
  // An encoded title sequence (ESC ] … BEL) is read past by the scrub, and it can hold a space: split at the space, neither word decodes
  // to a key, the whole does.
  const osc = `sk%1B%5D0%3Ba b%07-${TAIL}`;
  it('an encoded sequence holding a space: the line goes, in a paragraph, a markup-split paragraph and a fence', () => {
    expect(scrubSecrets(osc)).toBe(osc);
    for (const text of [`token ${osc} here`, `token sk%1B%5D0%3Ba **b**%07-${TAIL} here`, `token \`${osc}\` here`]) {
      const s = shown(text);
      expect(s).not.toContain(TAIL.slice(4));
      expect(s).toContain('[hidden]');
    }
    const f = parseMd(`\`\`\`\nA=1\nT=${osc}\nC=3\n\`\`\``)[0];
    expect(f && f.k === 'code' ? f.s : '').toBe('A=1\n[hidden]\nC=3');
  });
  it('an encoded sequence across a line break: the whole fence goes', () => {
    const f = parseMd(`\`\`\`\nA=1\nsk%1B%5D0%3Ba\nb%07-${TAIL}\n\`\`\``)[0];
    expect(f && f.k === 'code' ? f.s : 'x').not.toContain(TAIL.slice(4));
  });
  it('a key written plainly beside an ordinary escape is hidden in place, never with its line', () => {
    const f = parseMd(`\`\`\`\nA=sk-${TAIL} B=a%20b\nC=3\n\`\`\``)[0];
    expect(f && f.k === 'code' ? f.s : '').toBe('A=[hidden] B=a%20b\nC=3');
  });
  it('an encoded word character just before a key does not glue to it', () => {
    expect(shown(`token %41sk%2D${TAIL} here`)).not.toContain(TAIL.slice(4));
    expect(parseMd(`token %41sk%2D${TAIL} here`)).toEqual([{ k: 'p', c: [{ k: 'text', s: 'token [hidden] here' }] }]);
    expect(safeHref(`https://ok.test/?a=%41sk%2D${TAIL}`)).toBeNull();
    // A run that only decodes to a word character stays as written.
    expect(shown('token %41bc here')).not.toContain('[hidden]');
  });
  // The run marker for the case above must not split an escape sequence the scrub reads past inside a key: ESC [ 31 m as two runs
  // around `31m` would leave the key unread.
  it('an encoded colour sequence inside a key, split across runs, is still hidden in prose, code, a fence, a fence tag and a link', () => {
    const csi = `sk%1B%5B31m%2D${TAIL}`;
    expect(scrubSecrets(csi)).toBe(csi);
    for (const text of [`token ${csi} here`, `token \`${csi}\` here`, `token\n\n\`\`\`\nexport T=${csi}\n\`\`\``]) {
      const s = shown(text);
      expect(s).not.toContain(TAIL.slice(4));
      expect(s).toContain('[hidden]');
    }
    const b = parseMd(`\`\`\`${csi}\nx\n\`\`\``)[0];
    expect(b && b.k === 'code' ? b.lang : 'none').toBe('');
    expect(safeHref(`https://ok.test/?a=${csi}`)).toBeNull();
  });
  // Both at once: a word character decoded before the key and an escape decoded inside it. The break after the `A` must not land
  // inside the sequence, however its runs fall: split after ESC, inside the parameters, at a title's ESC \\ end,
  // with an intermediate (a space), and encoded twice.
  // Every other escape the scrub reads past inside a key (an Fp/Fe/Fs or nF escape, DCS or APC, a C1 CSI), encoded, and the same after
  // a decoded word character: the plain decode is checked first, and the marker lands only between two word characters, never after
  // an ESC or a 0x9B.
  it('a key holding any escape the scrub reads past, encoded, glued or not, is hidden everywhere', () => {
    const keys = [
      `%1B7sk-${TAIL}`, `sk%1BM-${TAIL}`, `%1B(Bsk-${TAIL}`, `%C2%9B31msk-${TAIL}`, `sk%1BP%78%251B%5C-${TAIL}`,
      `%41sk%1B7-${TAIL}`, `%41sk%1BM-${TAIL}`, `%41sk%1B(B-${TAIL}`, `%41sk%C2%9B%33%31m-${TAIL}`, `%41sk%1BP%61b%1B%5C-${TAIL}`,
      `%2541sk%251B7-${TAIL}`, `%251B7sk-${TAIL}`,
      `%1B_x%1B%5Csk-${TAIL}`, `%41sk%1B_%61b%1B%5C-${TAIL}`,
    ];
    for (const k of keys) {
      for (const text of [`x ${k} y`, `x \`${k}\` y`, `x\n\n\`\`\`\nexport T=${k}\n\`\`\``]) {
        const s = shown(text);
        expect(s, `${k} in ${text}`).not.toContain(TAIL.slice(4));
        expect(s, `${k} in ${text}`).toContain('[hidden]');
      }
      const b = parseMd(`\`\`\`${k}\nx\n\`\`\``)[0];
      expect(b && b.k === 'code' ? b.lang : 'none', k).toBe('');
      expect(safeHref(`https://ex.com/${k}`), k).toBeNull();
      expect(shown(`[a](https://ex.com/${k})`), k).not.toContain(TAIL.slice(4));
      expect(shown(`see https://ex.com/${k} now`), k).not.toContain(TAIL.slice(4));
    }
  });
  it('a key after a decoded word character, with an escape sequence inside it split across runs, is hidden everywhere', () => {
    const keys = [
      `%41sk%1B%5B31m%2D${TAIL}`,
      `%41sk%1B[31m%2D${TAIL}`,
      `%41sk%1B%5B3%31m%2D${TAIL}`,
      `%41sk%1B%5B1%20q%2D${TAIL}`,
      `%41sk%1B]0;t%07%2D${TAIL}`,
      `%41sk%1B%5D0%3Bt%1B\\%2D${TAIL}`,
      `%2541sk%251B%255B31m%252D${TAIL}`,
    ];
    for (const k of keys) {
      expect(scrubSecrets(k)).toBe(k);
      for (const text of [`token ${k} here`, `token \`${k}\` here`, `token\n\n\`\`\`\nexport T=${k}\n\`\`\``]) {
        const s = shown(text);
        expect(s, `${k} in ${text}`).not.toContain(TAIL.slice(4));
        expect(s, `${k} in ${text}`).toContain('[hidden]');
      }
      const b = parseMd(`\`\`\`${k}\nx\n\`\`\``)[0];
      expect(b && b.k === 'code' ? b.lang : 'none', k).toBe('');
      expect(safeHref(`https://ok.test/?a=${k}`), k).toBeNull();
    }
    // An encoded colour sequence beside ordinary words, with no key, stays as written.
    expect(shown('red %41%1B%5B31m text here')).not.toContain('[hidden]');
  });
  it('a long colour sequence with no end is read in linear time', () => {
    // Decoded: ESC [ and runs of zero-width spaces between spaces (a space is an intermediate byte), no final byte. Each written
    // word stays under the scrub's RUN_MAX, so the key check reads the whole sequence. Overlapping repeats cost (one run) x (the
    // rest): about 1.5 s here; linear costs what the same text without the ESC costs.
    const words = (lead: string) => lead + '%E2%80%8B'.repeat(4000) + ` ${'%E2%80%8B'.repeat(4000)}`.repeat(40);
    const time = (text: string) => { const t0 = performance.now(); shown(text); return performance.now() - t0; };
    time(words('x%5B')); // warm
    const plain = time(words('x%5B'));
    const esc = time(words('%1B%5B'));
    expect(esc).toBeLessThan(plain * 3 + 300);
  });
  it('a key joined by markup beside an ordinary escape in the same word is hidden in place, the escape kept', () => {
    expect(parseMd(`x sk-abc**defghijklmnop**%20safe y`)).toEqual([{ k: 'p', c: [{ k: 'text', s: 'x [hidden]%20safe y' }] }]);
    // Beside an encoded key elsewhere (so the words are looked at): the plain key's word keeps its ordinary escape.
    expect(parseMd(`sk%2Dabcdefghijklmnopqrst a sk-abcdefghijklmnopqrst%20safe`)).toEqual([{ k: 'p', c: [{ k: 'text', s: '[hidden] a [hidden]%20safe' }] }]);
  });
  it('a fence tag that shows a key is not drawn as the label; an ordinary tag is', () => {
    const tag = (open: string) => { const b = parseMd(`${open}\nx\n\`\`\``)[0]; return b && b.k === 'code' ? b.lang : 'none'; };
    expect(tag('```sk-abcdefghijklmnopqrst')).toBe('');
    expect(tag('```sk%2Dabcdefghijklmnopqrst')).toBe('');
    expect(tag('```ts')).toBe('ts');
  });
  it('only the word is hidden; the words beside it stay', () => {
    expect(parseMd(`token sk%2D${TAIL} here`)).toEqual([{ k: 'p', c: [{ k: 'text', s: 'token [hidden] here' }] }]);
    const f = parseMd(`\`\`\`\nA=1 B=sk%252D${TAIL}\nC=3\n\`\`\``)[0];
    expect(f && f.k === 'code' ? f.s : '').toBe('A=1 [hidden]\nC=3');
  });
  it('text that decodes to no key keeps its formatting and its escapes', () => {
    for (const text of ['see `caf%C3%A9` and **100%25** done', 'a%20b %E0%A4%A 50% off', '```\ncurl https://x.test/q?a=%2F\n```']) {
      expect(shown(text)).not.toContain('[hidden]');
    }
    expect(parseMd('see `caf%C3%A9` now')).toEqual([{ k: 'p', c: [{ k: 'text', s: 'see ' }, { k: 'code', s: 'caf%C3%A9' }, { k: 'text', s: ' now' }] }]);
  });
  it('an address with a key encoded twice is refused as a link, and its text hidden', () => {
    expect(safeHref(`https://x.test/sk%252D${TAIL}`)).toBeNull();
    expect(shown(`see https://x.test/sk%252D${TAIL} now`)).not.toContain(TAIL.slice(4));
    expect(safeHref('https://x.test/100%2525/a%2520b')?.host).toBe('x.test');
  });
  it('a word encoded past the bound is not decoded further (bounded work)', () => {
    let k = `sk%2D${TAIL}`;
    for (let i = 0; i < 4; i++) k = k.replace('%', '%25');
    expect(k).toBe(`sk%252525252D${TAIL}`);
    expect(shown(`token ${k} here`)).not.toContain('[hidden]');
  });
  it('a long text with many escapes is checked in time', () => {
    const text = `${'a%20b '.repeat(20000)}sk%2D${TAIL}`;
    const t0 = Date.now();
    expect(shown(text)).toContain('[hidden]');
    expect(Date.now() - t0).toBeLessThan(5000);
  });
});
