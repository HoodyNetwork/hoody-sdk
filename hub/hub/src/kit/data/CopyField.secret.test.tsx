// CopyField never shows an id: a value that holds a 24-hex id, however
// it is written (extra separators, nested, percent-encoded, an address the parser refuses, plain text), shows as the
// masked ExtLink button or as the mask, with and without `plain`; copying still gives the value whole.
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CopyField } from '../index';
import { webAddress } from '../controls/Link';

const P = '6a0000000000000000000001';
const MASK = '••••';
/** Nothing of the id is in the page: not whole, and neither half (an encoded separator between the halves splits it). */
const nothingOf = () => {
  for (const part of [P, P.slice(0, 12), P.slice(12)]) expect(document.body.innerHTML).not.toContain(part);
};
/** The field's shown value (the span the value renders in, translate="no"). */
const shown = () => document.querySelector('[translate="no"]')?.textContent;
const enc = encodeURIComponent;
/** `text` percent-encoded `n` times. */
const encN = (text: string, n: number): string => (n === 0 ? text : encN(enc(text), n - 1));
/** The id split by `sep`, encoded `n` times, as one query value: the halves are only one id once every layer is undone. */
const split = (sep: string, n: number) => `https://docs.example.test/?id=${encN(`${P.slice(0, 12)}${sep}${P.slice(12)}`, n)}`;

const CASES: readonly (readonly [string, string])[] = [
  // Extra separators before an id host: a leak found by a probe.
  ['three slashes', `https:///${P}.example.test/a`],
  ['four slashes', `https:////${P}.example.test/a`],
  ['four slashes and an empty userinfo', `https:////@${P}.example.test/a`],
  ['three slashes and a backslash', `https:///\\${P}.example.test/a`],
  ['an id userinfo after extra slashes', `https:///${P}@docs.example.test/a`],
  // Nested addresses.
  ['a nested address in the query', `https://docs.example.test/?next=https:///${P}.example.test/a`],
  ['an encoded nested address in the query', `https://docs.example.test/?next=${enc(`https:///${P}.example.test/a`)}`],
  ['a nested address in the path', `https://docs.example.test/go/https:///${P}.example.test/a`],
  ['an encoded nested userinfo, a port and an outer param', `https://docs.example.test/?next=${enc(`https:///${P}@docs.example.test:443`)}&x=1`],
  ['an encoded nested address and an encoded space after it', `https://docs.example.test/?next=${enc(`https:///${P}.example.test`)}&q=a%20b`],
  ['an encoded TAB inside the id', `https://docs.example.test/?next=${enc(`https://${P.slice(0, 12)}\t${P.slice(12)}.example.test/a`)}`],
  // A separator inside the id, encoded at every depth up to five (encodeURIComponent leaves hex digits as they are, so
  // the separator is what each layer hides), and an encoded zero-width joiner beside a malformed escape.
  ...[1, 2, 3, 4, 5].map((n) => [`an id split by a TAB encoded ${n} time(s)`, split('\t', n)] as const),
  ...[1, 2, 3, 4, 5].map((n) => [`an id split by a zero-width space encoded ${n} time(s)`, split('\u200b', n)] as const),
  ['an id split by an encoded zero-width joiner, a malformed escape after it', `${split('\u200d', 1)}&bad=%`],
  ['a command with an id split by an encoded zero-width joiner and a malformed escape', `echo ${encN(`${P.slice(0, 12)}\u200d${P.slice(12)}`, 1)} %E0%`],
  // An encoded control inside an escape, itself hidden by outer layers (A%25%0909B decodes to A%<TAB>09B,
  // which reads as the escape %09 only once the TAB is gone). TAB, LF and CR; outer depths 0-3; address, refused, command.
  ...['%09', '%0A', '%0D'].flatMap((c) =>
    [0, 1, 2, 3].flatMap((n) => {
      const hid = encN(`${P.slice(0, 12)}%25${c}09${P.slice(12)}`, n);
      return [
        [`an id split by a control ${c} hidden inside an escape, ${n} outer layer(s)`, `https://docs.example.test/?id=${hid}`],
        [`a refused value with an id split by a control ${c} inside an escape, ${n} outer layer(s)`, `https:/docs.example.test/?id=${hid}`],
        [`a command with an id split by a control ${c} inside an escape, ${n} outer layer(s)`, `echo ${hid}`],
      ] as const;
    }),
  ),
  ['a value the parser refuses with an id split at depth four', `https:/docs.example.test/?id=${encN(`${P.slice(0, 12)}\t${P.slice(12)}`, 4)}`],
  // Values the address parser refuses.
  ['one slash', `https:/${P}.example.test/a`],
  ['a port past 65535', `https://${P}.example.test:99999/a`],
  ['a refused outer value with an encoded nested userinfo', `https:/docs.example.test/?next=${enc(`https:///${P}@docs.example.test/a`)}`],
  ['an ssh target', `ssh root@${P}.example.test`],
  // An id that is not in a host.
  ['an id in the path', `https://docs.example.test/v1/${P}`],
  ['a command with an id host', `curl https://${P}.example.test/v1`],
  ['a bare id', P],
];

describe('CopyField: a value that holds an id never shows it', () => {
  it.each(CASES)('%s: masked with plain and without, never an href', (_case, value) => {
    for (const plain of [true, false]) {
      const r = render(<CopyField label="Address" value={value} plain={plain} />);
      nothingOf();
      expect(document.querySelector('[href]')).toBeNull();
      // Exactly the mask: the scheme and bullets of the secret button, or the bullets alone; nothing of the value beside it.
      if (webAddress(value) !== '') {
        expect(screen.getByRole('button', { name: /opens in a new tab/ }).textContent).toMatch(/^https?:\/\/••••$/);
        expect(shown()).toMatch(/^https?:\/\/••••$/);
      } else expect(shown()).toBe(MASK);
      r.unmount();
    }
  });
});

describe('CopyField: a value without an id', () => {
  it('a plain address shows as written: text under plain, a link without', () => {
    const url = 'https:///docs.example.test/a';
    const a = render(<CopyField value={url} plain />);
    expect(document.querySelector('[href]')).toBeNull();
    expect(document.body.textContent).toContain(url);
    a.unmount();
    render(<CopyField value="https://docs.example.test/a" />);
    expect(document.querySelector('a[href="https://docs.example.test/a"]')).not.toBeNull();
  });

  it.each([
    ['a Persian word with a zero-width non-joiner', 'می\u200cخواهم'],
    ['an emoji ZWJ sequence', 'team 👩\u200d💻 notes'],
    ['a soft hyphen in a word', 'con\u00adfig'],
  ])('%s, with no id, shows exactly as written (plain and not)', (_case, value) => {
    for (const plain of [true, false]) {
      const r = render(<CopyField value={value} plain={plain} />);
      expect(shown()).toBe(value);
      r.unmount();
    }
  });

  it('a command shows as written', () => {
    const cmd = 'curl -fsSL https://docs.example.test/install.sh | sh';
    render(<CopyField value={cmd} plain />);
    expect(document.body.textContent).toContain(cmd);
  });
});
