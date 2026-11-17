// Vitest: one rule for every string a link shows. safeShown removes the bidi
// controls and, when the text holds a 24-hex id in any form (holdsId: unseen characters out, NFKC, hex skeleton),
// shows the mask in its place, whole. The cases are generated: the id forward and reversed, split by every Unicode
// format character (Cf) at every position, bidi-wrapped, across caller words, title, aria-label, name, the visible
// address and autolinked prose. Oracle: nothing rendered holds the id or either half.
import { Fragment, useState } from 'react';
import { act, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ExtLink, Link, autolink, holdsId, safeShown, secretShape } from './Link';

const HEX = '0123456789abcdef01234567';
const REV = [...HEX].reverse().join('');
const BULLETS = '••••';
/** A `title` passed through Link's rest props (LinkProps does not declare it; a caller can still spread one in). */
const ATTRS = (title: string): object => ({ title });

/** Every Unicode format character (general category Cf), from the runtime's own Unicode tables. */
const CF: string[] = [];
for (let cp = 0; cp <= 0x10ffff; cp += 1) {
  if (cp >= 0xd800 && cp <= 0xdfff) continue;
  const c = String.fromCodePoint(cp);
  if (/\p{Cf}/u.test(c)) CF.push(c);
}

const RLO = '\u202e';
const LRO = '\u202d';
const RLE = '\u202b';
const RLI = '\u2067';
const PDF = '\u202c';
const PDI = '\u2069';

/** The id written so that it reads forward on screen: plain, or reversed in logical order inside a bidi override,
 *  embedding or isolate, or half plain and half reversed (a piecewise reversal). */
const BIDI_WRAPS: ReadonlyArray<readonly [string, string]> = [
  ['plain', HEX],
  ['RLO reversed', `${RLO}${REV}${PDF}`],
  ['RLE reversed', `${RLE}${REV}${PDF}`],
  ['RLI reversed', `${RLI}${REV}${PDI}`],
  ['RLO reversed, no closer', `${RLO}${REV}`],
  ['half, then RLO half reversed', `${HEX.slice(0, 12)}${RLO}${[...HEX.slice(12)].reverse().join('')}${PDF}`],
  ['RLO half reversed, then half', `${RLO}${[...HEX.slice(0, 12)].reverse().join('')}${PDF}${HEX.slice(12)}`],
  ['LRO inside RLO', `${RLO}${LRO}${HEX}${PDF}${PDF}`],
  ['upper case', HEX.toUpperCase()],
];

/** Where an id is put: caller words, prose, and every position in an address. */
const CONTEXTS: ReadonlyArray<readonly [string, string]> = [
  ['', ''],
  ['Open ', ' now'],
  ['see commit ', ', then'],
  ['https://', '.example.com/'],
  ['https://example.com/files/', '/x'],
  ['see https://u@', '.e.com/?q=1 now'],
  ['host ', '.example.com'],
];

/** Every form of the id split by one character `c`: at every position, forward and reversed. */
function splits(c: string): string[] {
  const out: string[] = [];
  for (const id of [HEX, REV]) for (let g = 0; g <= id.length; g += 1) out.push(id.slice(0, g) + c + id.slice(g));
  return out;
}

/** Pieces of the id no rendered output may hold (either half, either direction, any case). */
const PIECES = [HEX.slice(0, 12), HEX.slice(12), REV.slice(0, 12), REV.slice(12)];
function expectNoId(html: string, text: string): void {
  const flat = html.replace(/\p{Cf}/gu, '').toLowerCase();
  for (const p of PIECES) expect(flat).not.toContain(p);
  expect(holdsId(text)).toBe(false);
}

afterEach(() => vi.restoreAllMocks());

describe('holdsId and safeShown: generated', () => {
  it('the runtime has the format characters the rule names', () => {
    expect(CF.length).toBeGreaterThan(150);
    for (const c of ['\u00ad', '\u200b', '\u200c', '\u200d', '\u200e', '\u200f', RLO, LRO, RLE, RLI, PDF, PDI, '\u2060', '\ufeff']) expect(CF).toContain(c);
  });

  it('the id split by every format character at every position, forward and reversed, in every context, is masked whole', () => {
    let n = 0;
    for (const c of CF) {
      for (const id of splits(c)) {
        for (const [pre, post] of CONTEXTS) {
          const text = pre + id + post;
          if (safeShown(text) !== BULLETS || autolink(text) !== BULLETS) throw new Error(`shown: U+${c.codePointAt(0)!.toString(16)} in ${JSON.stringify(text)}`);
          n += 1;
        }
      }
    }
    expect(n).toBe(CF.length * 2 * 25 * CONTEXTS.length);
  });

  it('every bidi wrap of the id, alone and in every context, is masked whole', () => {
    for (const [, id] of BIDI_WRAPS) {
      for (const [pre, post] of CONTEXTS) {
        expect(safeShown(pre + id + post)).toBe(BULLETS);
        expect(autolink(pre + id + post)).toBe(BULLETS);
      }
    }
  });

  it('what the URL parser strips or ignores, and combining marks, never hide the id (a run reads past them)', () => {
    const skipped = ['\t', '\n', '\r', '\u00ad', '\u200b', '\u0301', '\u0338', '\u20e3', '\ufe0f', '\u034f', '\u115f', '\u1160', '\u3164', '\uffa0', '\u180b', '\u{e0020}'];
    for (const sep of skipped) {
      for (const id of [HEX, REV]) {
        expect(safeShown(id.split('').join(sep)), JSON.stringify(sep)).toBe(BULLETS);
        expect(autolink(`see ${[id.slice(0, 8), id.slice(8, 16), id.slice(16)].join(sep)} now`), JSON.stringify(sep)).toBe(BULLETS);
      }
    }
  });

  it('a space or any punctuation ends a run and never cancels it: 24 hex digits glued to other letters still hold', () => {
    for (const id of [HEX, REV]) {
      for (const text of [`x${id}`, `_${id}g`, `${id}g`, `see ${id}.`, `(${id})`, `zz${id}zz`, `foo@${id}/x`]) expect(holdsId(text), text).toBe(true);
    }
  });

  it('a visible separator ends a run: words and groups never merge across it', () => {
    const visible = [' ', '-', '.', ':', '/', '_', '\u3000', '\u00a0', '%'];
    for (const sep of visible) {
      for (const id of [HEX, REV]) {
        const text = [id.slice(0, 8), id.slice(8, 16), id.slice(16)].join(sep);
        expect(holdsId(text), JSON.stringify(sep)).toBe(false);
        expect(safeShown(text)).toBe(text);
      }
    }
    expect(holdsId('a bad cafe face dead beef 1234 5678 9012')).toBe(false);
  });

  it('a percent-encoded id holds (the text is judged with its percent-encoding undone too)', () => {
    for (const text of ['host 0123456789%61bcdef01234567.example.com now', `see ${encodeURIComponent(encodeURIComponent(`${HEX.slice(0, 5)}\u200b${HEX.slice(5)}`))}`]) {
      expect(holdsId(text), text).toBe(true);
      expect(autolink(text)).toBe(BULLETS);
    }
  });

  it('compatibility forms read as their plain digits and letters (fullwidth, mathematical, circled-free)', () => {
    const full = [...HEX].map((c) => String.fromCodePoint(c.codePointAt(0)! + 0xfee0)).join('');
    const math = [...HEX].map((c) => (/[0-9]/.test(c) ? String.fromCodePoint(0x1d7ce + Number(c)) : c)).join('');
    for (const id of [full, math, full.toUpperCase()]) expect(safeShown(`go ${id} now`)).toBe(BULLETS);
  });

  it('a run broken by any other letter or digit is not an id; 23 hex digits are not an id', () => {
    for (const text of [HEX.slice(0, 23), `${HEX.slice(0, 12)}g${HEX.slice(12)}`, `${HEX.slice(0, 12)}\u0661${HEX.slice(12)}`, 'Program rules', 'caf\u00e9 \u2615 \u{1f468}\u200d\u{1f469}\u200d\u{1f467} \u0928\u092e\u0938\u094d\u0924\u0947 \u0645\u0631\u062d\u0628\u0627']) {
      expect(holdsId(text), text).toBe(false);
    }
  });

  it('text with no id keeps every character but the bidi controls', () => {
    expect(safeShown('Program rules')).toBe('Program rules');
    expect(safeShown('\u0928\u092e\u0938\u094d\u0924\u0947 caf\u00e9')).toBe('\u0928\u092e\u0938\u094d\u0924\u0947 caf\u00e9');
    expect(safeShown(`a${RLO}b${PDF}c\u200bd`)).toBe('abc\u200bd');
    expect(safeShown(`\u061ca\u200eb\u200fc${RLE}d${LRO}e${RLI}f${PDI}g\u2066h\u2068i`)).toBe('abcdefghi');
    expect(autolink(`see ${RLO}https://example.com/a${PDF} now`)).not.toContain(RLO);
  });

  // Format characters people write: an emoji ZWJ sequence, Persian ZWNJ, the Arabic number sign and end of
  // ayah, a tag-sequence flag, a BOM. Each shows as written, through safeShown, through autolink's text and around a link.
  const WRITTEN: ReadonlyArray<readonly [string, string]> = [
    ['an emoji ZWJ sequence', 'Family \u{1f468}\u200d\u{1f469}\u200d\u{1f467}'],
    ['Persian ZWNJ', '\u0645\u06cc\u200c\u062e\u0648\u0627\u0647\u0645'],
    ['the Arabic number sign and end of ayah', '\u0600\u0661\u0662 and \u06dd'],
    ['a tag-sequence flag', '\u{1f3f4}\u{e0067}\u{e0062}\u{e0073}\u{e0063}\u{e0074}\u{e007f}'],
    ['a zero-width space and a soft hyphen', 'zero\u200bwidth soft\u00adhyphen'],
  ];
  it.each(WRITTEN)('%s shows as written (safeShown, autolink text, beside a link)', (_case, text) => {
    expect(safeShown(text)).toBe(text);
    expect(autolink(text)).toBe(text);
    const r = render(<p>{autolink(`${text} https://example.com/a ${text}`)}</p>);
    expect(r.container.textContent).toBe(`${text} https://example.com/a ${text}`);
    expect(r.container.querySelector('a')?.getAttribute('href')).toBe('https://example.com/a');
    r.unmount();
  });

  it('a BOM still ends a link (it is not part of the address)', () => {
    const r = render(<p>{autolink('https://bank.example.com\ufeff.evil.example/x')}</p>);
    expect(r.container.querySelector('a')?.getAttribute('href')).toBe('https://bank.example.com');
    r.unmount();
  });

  it('a commit hash holds too: the whole text is the mask (an accepted false mask); a UUID in its dashed form does not', () => {
    expect(autolink(`commit ${HEX}0123456789abcdef landed`)).toBe(BULLETS);
    expect(safeShown('id 123e4567e89b12d3a456426614174000')).toBe(BULLETS);
    expect(safeShown('id 123e4567-e89b-12d3-a456-426614174000')).toBe('id 123e4567-e89b-12d3-a456-426614174000');
  });

  it('is linear in the length of the text (a megabyte of text in well under the budget)', () => {
    const text = `${'0123456789a'} ${'bcdefghij'} `.repeat(50_000);
    const t0 = performance.now();
    expect(holdsId(text)).toBe(false);
    expect(safeShown(text)).toBe(text);
    expect(holdsId(`${text}${HEX}`)).toBe(true);
    expect(performance.now() - t0).toBeLessThan(3000);
  });
});

describe('every surface a link shows: rendered', () => {
  /** A sample of the generated ids for rendered surfaces: every format character at a rotating position, both
   *  directions, plus every bidi wrap (the per-character rule is covered whole above, on the same function). */
  const SAMPLE: string[] = [
    ...CF.flatMap((c, i) => [HEX.slice(0, 1 + (i % 23)) + c + HEX.slice(1 + (i % 23)), REV.slice(0, 1 + ((i * 7) % 23)) + c + REV.slice(1 + ((i * 7) % 23))]),
    ...BIDI_WRAPS.map(([, id]) => id),
  ];

  it('ExtLink: caller words and name, for a public and a secret address', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    for (const url of ['https://docs.example.test/start', `https://${HEX}.example.test/`]) {
      for (const id of SAMPLE) {
        const { container, unmount } = render(
          <ExtLink url={url} name={`open ${id}`}>
            {`see ${id}`}
          </ExtLink>,
        );
        const el = container.querySelector('a, button')!;
        expectNoId(container.innerHTML, el.textContent ?? '');
        expect(holdsId(el.getAttribute('aria-label') ?? '')).toBe(false);
        unmount();
      }
    }
  });

  it('ExtLink: the visible address, when the id is in its path, its host or written with format characters', () => {
    for (const id of SAMPLE) {
      for (const url of [`https://example.com/files/${id}/x`, `https://${id}.example.com/`, `ftp://${id}.example.com/`]) {
        const { container, unmount } = render(<ExtLink url={url} truncate />);
        expectNoId(container.innerHTML, container.textContent ?? '');
        unmount();
      }
    }
  });

  it('Link: string children, title and aria-label', () => {
    for (const id of SAMPLE) {
      const { container, unmount } = render(
        <Link href="/a" {...ATTRS(`t ${id}`)} aria-label={`n ${id}`}>
          {`see ${id}`}
        </Link>,
      );
      const a = container.querySelector('a')!;
      expectNoId(container.innerHTML, a.textContent ?? '');
      for (const attr of ['title', 'aria-label']) expect(holdsId(a.getAttribute(attr) ?? '')).toBe(false);
      unmount();
    }
  });

  it('Link: JSX children, an id across adjacent elements or inside an attribute of one, show the mask whole', () => {
    for (const id of SAMPLE) {
      const cut = Math.floor(id.length / 2);
      const cases = [
        <Fragment key="spans">
          <span>{id.slice(0, cut)}</span>
          <span>{id.slice(cut)}</span>
        </Fragment>,
        <span key="title" title={id}>
          Program rules
        </span>,
        <img key="alt" alt={id} src="data:," />,
        <Fragment key="frag">
          {'see '}
          {id}
        </Fragment>,
      ];
      for (const kids of cases) {
        const { container, unmount } = render(<Link href="/a">{kids}</Link>);
        const a = container.querySelector('a')!;
        expect(a.textContent).toBe(BULLETS);
        expectNoId(container.innerHTML, a.textContent ?? '');
        unmount();
      }
    }
  });

  it('Link: JSX children that change from an id to plain words show the words again', () => {
    const { container, rerender } = render(
      <Link href="/a">
        <span>{HEX}</span>
      </Link>,
    );
    expect(container.textContent).toBe(BULLETS);
    rerender(
      <Link href="/a">
        <span>Program rules</span>
      </Link>,
    );
    expect(container.textContent).toBe('Program rules');
  });

  it('Link: a child that changes its own text or attribute to hold an id after mount shows the mask (no Link render)', async () => {
    for (const kind of ['text', 'title', 'split'] as const) {
      let put: (v: string) => void = () => {};
      function Child() {
        const [v, setV] = useState('Program rules');
        put = setV;
        if (kind === 'title') return <span title={v}>Open</span>;
        if (kind === 'split') return <span>{v.slice(0, 10)}<b>{v.slice(10)}</b></span>;
        return <span>{v}</span>;
      }
      const { container, unmount } = render(
        <Link href="/a">
          <Child />
        </Link>,
      );
      expect(container.textContent).toBe(kind === 'title' ? 'Open' : 'Program rules');
      for (const id of [HEX, REV, `${HEX.slice(0, 4)}\u200b${HEX.slice(4)}`]) {
        await act(async () => {
          put(id);
        });
        await act(async () => {
          await Promise.resolve();
        });
        expect(container.querySelector('a')!.textContent, `${kind} ${JSON.stringify(id)}`).toBe(BULLETS);
        expectNoId(container.innerHTML, container.textContent ?? '');
      }
      unmount();
    }
  });

  it('autolink: prose holding the id anywhere (beside a link, in a link, split by format characters) is the mask, whole', () => {
    for (const id of SAMPLE) {
      for (const text of [`see https://example.com/a and ${id}`, `see https://example.com/${id} now`, `${id} https://example.com/`]) {
        expect(autolink(text)).toBe(BULLETS);
      }
    }
  });
});

describe('an id hidden by bidi controls, a zero-width split or split spans is still masked', () => {
  it('1: a bidi-reversed id as the words and name of a secret ExtLink', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const words = `${RLO}${REV}${PDF}`;
    const { container } = render(
      <ExtLink url={`https://${HEX}.io/`} name={words}>
        {words}
      </ExtLink>,
    );
    const b = container.querySelector('button')!;
    expectNoId(container.innerHTML, b.textContent ?? '');
    expect(holdsId(b.getAttribute('aria-label') ?? '')).toBe(false);
  });

  it('2: an id split by U+200C in a host the parser refuses, in autolink and in a public ExtLink', () => {
    const text = 'https://012345\u200c6789ab\u200ccdef01\u200c234567.io/';
    expect(autolink(text)).toBe(BULLETS);
    const split = '012345\u200c6789ab\u200ccdef01\u200c234567';
    const { container } = render(
      <ExtLink url="https://docs.example.test/start" name={split}>
        {split}
      </ExtLink>,
    );
    const a = container.querySelector('a')!;
    expectNoId(container.innerHTML, a.textContent ?? '');
    expect(holdsId(a.getAttribute('aria-label') ?? '')).toBe(false);
  });

  it('3: a Link with the id in its title and split across two spans', () => {
    const { container } = render(
      <Link href="/" {...ATTRS(HEX)}>
        <span>{HEX.slice(0, 12)}</span>
        <span>{HEX.slice(12)}</span>
      </Link>,
    );
    const a = container.querySelector('a')!;
    expect(a.textContent).toBe(BULLETS);
    expect(holdsId(a.getAttribute('title') ?? '')).toBe(false);
    expectNoId(container.innerHTML, a.textContent ?? '');
  });
});

describe('an id in an absolute address, split by a hidden element or held by a referenced element is still masked', () => {
  it('1: a Link whose absolute address holds an id is the secret button: no href, no id anywhere in the page', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    for (const href of [`https://${HEX}.example.test/`, `https://example.test/x/${HEX}`, `HTTPS://${HEX.toUpperCase()}.example.test/`, `https://${HEX.slice(0, 6)}%30${HEX.slice(7)}.example.test/`]) {
      for (const kids of ['Open', <span key="s">Open</span>]) {
        const { container, unmount } = render(
          <Link href={href} variant="nav">
            {kids}
          </Link>,
        );
        expect(container.querySelector('a, [href]')).toBeNull();
        expect(container.querySelectorAll('button')).toHaveLength(1);
        expectNoId(container.innerHTML, container.textContent ?? '');
        expect(container.innerHTML).not.toContain('example.test');
        unmount();
      }
    }
    const { container } = render(<Link href="https://example.test/docs">Docs</Link>);
    expect(container.querySelector('a')?.getAttribute('href')).toBe('https://example.test/docs');
  });

  it('2: a hidden element between the halves of an id contributes nothing: the link shows the mask whole', () => {
    const hide = [
      <span key="d" style={{ display: 'none' }}>g</span>,
      <span key="h" hidden>
        g
      </span>,
      <span key="v" style={{ visibility: 'hidden' }}>
        zz
      </span>,
      <span key="a" aria-hidden="true">
        -
      </span>,
      <b key="w">
        {' '}x{' '}
      </b>,
    ];
    for (const id of [HEX, REV]) {
      for (const h of hide) {
        const { container, unmount } = render(
          <Link href="/a">
            {id.slice(0, 12)}
            {h}
            {id.slice(12)}
          </Link>,
        );
        expect(container.querySelector('a')!.textContent).toBe(BULLETS);
        expectNoId(container.innerHTML, container.textContent ?? '');
        unmount();
      }
    }
  });

  it('3: a Link named or described by another element holding an id shows the mask and drops the reference', async () => {
    for (const attr of ['aria-labelledby', 'aria-describedby'] as const) {
      const { container, unmount } = render(
        <>
          <span id="ref-name" hidden>
            {HEX}
          </span>
          <Link href="/a" {...{ [attr]: 'ref-name' }}>
            Open
          </Link>
        </>,
      );
      const a = container.querySelector('a')!;
      expect(a.textContent).toBe(BULLETS);
      expect(a.getAttribute(attr)).toBeNull();
      unmount();
    }
    // A naming element that comes to hold an id after mount (outside the Link's own subtree).
    let put: (v: string) => void = () => {};
    function Name() {
      const [v, setV] = useState('Program rules');
      put = setV;
      return (
        <span id="late-name" hidden>
          {v}
        </span>
      );
    }
    const { container } = render(
      <>
        <Name />
        <Link href="/a" aria-labelledby="late-name">
          Open
        </Link>
      </>,
    );
    expect(container.querySelector('a')!.textContent).toBe('Open');
    expect(container.querySelector('a')!.getAttribute('aria-labelledby')).toBe('late-name');
    await act(async () => {
      put(`${HEX.slice(0, 5)}\u200b${HEX.slice(5)}`);
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(container.querySelector('a')!.textContent).toBe(BULLETS);
    expect(container.querySelector('a')!.getAttribute('aria-labelledby')).toBeNull();
  });

  it('a Link without an id keeps its plain words, its reference and its address', () => {
    const { container } = render(
      <>
        <span id="plain-name">Program rules</span>
        <Link href="/a" aria-labelledby="plain-name">
          Open <b>now</b>
        </Link>
      </>,
    );
    const a = container.querySelector('a')!;
    expect(a.textContent).toBe('Open now');
    expect(a.getAttribute('aria-labelledby')).toBe('plain-name');
    expect(a.getAttribute('href')).toBe('/a');
  });
});

// One malformed escape anywhere must not stop the others decoding. An id whose last character is written as
// an encoded compatibility form (fullwidth A = %EF%BC%A1, mathematical bold 0 = %F0%9D%9F%8E) beside a bad escape, at each
// position, in autolink text and in an ExtLink address: masked whole, never an href, no piece of the id in the page.
describe('holdsId: a malformed escape does not hide an encoded id', () => {
  const ID23 = HEX.slice(0, 23);
  const FORMS: ReadonlyArray<readonly [string, string]> = [
    ['fullwidth a', `${ID23.slice(0, 22)}7%EF%BC%A1`],
    ['mathematical bold 0', `${ID23}%F0%9D%9F%8E`],
    ['fullwidth A, double-encoded', `${ID23}%25EF%25BC%25A1`],
  ];
  const BAD = ['%E0%', '%ZZ', '%C3%28', '%F0%9F', '%'];
  const PLACES = (id: string, bad: string): string[] => [
    `${bad} //${id}.example.com now`,
    `Open //${id}.example.com now ${bad}`,
    `https://example.com/?r=//${id}.x.com&z=${bad}`,
    `https://example.com/${bad}/?r=//${id}.x.com`,
  ];
  for (const [name, id] of FORMS) {
    for (const bad of BAD) {
      it(`${name} beside ${JSON.stringify(bad)}: holdsId, autolink is the mask, ExtLink is the secret button`, () => {
        for (const text of PLACES(id, bad)) {
          expect(holdsId(text), text).toBe(true);
          expect(autolink(text), text).toBe(BULLETS);
          if (text.startsWith('https://')) {
            const r = render(<ExtLink url={text} />);
            expect(r.container.querySelector('[href]'), text).toBeNull();
            for (const p of [ID23.slice(0, 12), ID23.slice(12, 22)]) expect(r.container.innerHTML, text).not.toContain(p);
            r.unmount();
          }
        }
      });
    }
  }
});

describe('holdsId: no depth of percent-encoding hides an id (fixpoint, fail closed past the bound)', () => {
  const A = HEX.slice(0, 12);
  const B = HEX.slice(12, 24);
  /** `s` percent-encoded `n` times. */
  const encN = (s: string, n: number): string => {
    let out = s;
    for (let i = 0; i < n; i += 1) out = encodeURIComponent(out);
    return out;
  };
  const SEPS: ReadonlyArray<readonly [string, string]> = [
    ['TAB', '\t'],
    ['ZWSP', '​'],
  ];
  const PLACES = (id: string): string[] => [`see ${id} now`, `https://example.com/?id=${id}`, `https://${id}.example.com/`];
  for (const [name, sep] of SEPS) {
    for (let depth = 1; depth <= 8; depth += 1) {
      it(`an id split by a ${name} encoded ${depth} time(s): holdsId, safeShown and autolink mask it, ExtLink is the secret button`, () => {
        for (const text of PLACES(`${A}${encN(sep, depth)}${B}`)) {
          expect(holdsId(text), text).toBe(true);
          expect(safeShown(text), text).toBe(BULLETS);
          expect(autolink(text), text).toBe(BULLETS);
          if (text.startsWith('https://')) {
            const r = render(<ExtLink url={text} />);
            expect(r.container.querySelector('[href]'), text).toBeNull();
            for (const p of [A, B]) expect(r.container.innerHTML, text).not.toContain(p);
            r.unmount();
          }
        }
      });
    }
  }

  it('past the bound (9 layers still changing) a text fails closed: it holds, whatever it encodes', () => {
    expect(holdsId(`see ${A}${encN('\t', 9)}${B} now`)).toBe(true);
    // Fail closed: nothing hex-shaped is needed once the bound is passed.
    expect(holdsId(`a note ${encN(' ', 9)} done`)).toBe(true);
    expect(safeShown(`a note ${encN(' ', 9)} done`)).toBe(BULLETS);
  });

  it('within the bound, an encoded text with no id is not masked', () => {
    for (let depth = 1; depth <= 8; depth += 1) {
      const text = `a note ${encN(' and more', depth)} done`;
      expect(holdsId(text), text).toBe(false);
      expect(safeShown(text), text).toBe(text);
    }
    // A literal percent sign is no layer: "100%" and "50%25 off" settle.
    expect(holdsId('save 100% today')).toBe(false);
    expect(holdsId('save 50%25 off')).toBe(false);
  });
});

describe('holdsId: a TAB, LF or CR inside an escape hides no id (the URL parser drops them before it decodes)', () => {
  const ID23 = HEX.slice(0, 23);
  const LAST = HEX.slice(23);
  /** `s` percent-encoded `n` times. */
  const encN = (s: string, n: number): string => {
    let out = s;
    for (let i = 0; i < n; i += 1) out = encodeURIComponent(out);
    return out;
  };
  /** The id's last character as one escape (`%61`) or as its fullwidth form, a multibyte run (`%EF%BD%81`). */
  const KINDS: ReadonlyArray<readonly [string, string]> = [
    ['one escape', LAST],
    ['a multibyte run', String.fromCodePoint(LAST.codePointAt(0)! - 0x20 + 0xff00)],
  ];
  const DROPS: ReadonlyArray<readonly [string, string]> = [
    ['TAB', '\t'],
    ['LF', '\n'],
    ['CR', '\r'],
  ];
  const PLACES = (tail: string): string[] => [`https://${ID23}${tail}.example.com/`, `https://example.com/?id=${ID23}${tail}`, `see ${ID23}${tail} now`];
  for (const [kind, ch] of KINDS) {
    for (const [name, drop] of DROPS) {
      for (let depth = 1; depth <= 3; depth += 1) {
        it(`a ${name} at every place inside ${kind} encoded ${depth} time(s): masked everywhere, ExtLink is the secret button`, () => {
          // encodeURIComponent leaves an unreserved character as it is, so the first layer is written out by hand.
          const esc = encN(ch.length === 1 && ch.charCodeAt(0) < 0x80 ? `%${ch.charCodeAt(0).toString(16)}` : encodeURIComponent(ch), depth - 1);
          expect(esc.startsWith('%')).toBe(true);
          for (let at = 1; at < esc.length; at += 1) {
            for (const text of PLACES(`${esc.slice(0, at)}${drop}${esc.slice(at)}`)) {
              expect(holdsId(text), JSON.stringify(text)).toBe(true);
              expect(safeShown(text), JSON.stringify(text)).toBe(BULLETS);
              expect(autolink(text), JSON.stringify(text)).toBe(BULLETS);
              // At depth 1 the host form is secret by shape as well (secretShape reads the host as the URL parser does, which
              // undoes one layer); deeper, the parsed host still holds a `%` and is no host, and holdsId alone masks it.
              if (depth === 1 && text.startsWith(`https://${ID23}`)) expect(secretShape(text), JSON.stringify(text)).toBe(true);
              if (text.startsWith('https://')) {
                const r = render(<ExtLink url={text} />);
                expect(r.container.querySelector('[href]'), JSON.stringify(text)).toBeNull();
                for (const p of [ID23.slice(0, 12), ID23.slice(12)]) expect(r.container.innerHTML, JSON.stringify(text)).not.toContain(p);
                r.unmount();
              }
            }
          }
        });
      }
    }
  }

  it('the nested redirect form (%25 then a TAB) is masked too', () => {
    const text = `https://x.com/?r=https://${ID23}%25\t${LAST.charCodeAt(0).toString(16)}.e.com`;
    expect(holdsId(text)).toBe(true);
    const r = render(<ExtLink url={text} />);
    expect(r.container.querySelector('[href]')).toBeNull();
    r.unmount();
  });

  it('a TAB, LF or CR beside escapes with no id masks nothing', () => {
    for (const text of ['a\tnote %20 here', 'line one\r\nline %41 two', 'https://example.com/a%2\t0b?q=%4\n1']) {
      expect(holdsId(text), JSON.stringify(text)).toBe(false);
    }
  });
});

describe('design rule: detection reads every layer as a browser does, TAB/LF/CR dropped before each layer is undone', () => {
  const ID23 = HEX.slice(0, 23);
  const LAST = HEX.slice(23);
  /** `s` percent-encoded `n` times. */
  const encN = (s: string, n: number): string => {
    let out = s;
    for (let i = 0; i < n; i += 1) out = encodeURIComponent(out);
    return out;
  };
  /** The id's last character as one escape (`%37`; encodeURIComponent leaves it as it is) or as its fullwidth form's run. */
  const ESCAPES: ReadonlyArray<readonly [string, string]> = [
    ['one escape', `%${LAST.charCodeAt(0).toString(16)}`],
    ['a multibyte run', encodeURIComponent(String.fromCodePoint(LAST.codePointAt(0)! - 0x20 + 0xff00))],
  ];
  const SEPS: ReadonlyArray<readonly [string, string]> = [
    ['TAB', '\t'],
    ['LF', '\n'],
    ['CR', '\r'],
    ['CRLF', '\r\n'],
  ];
  for (const [kind, esc] of ESCAPES) {
    for (const [name, sep] of SEPS) {
      for (let depth = 1; depth <= 7; depth += 1) {
        it(`a ${name} inside ${kind} of a nested address encoded ${depth} time(s) (it shows only once a layer is undone): masked by every reader`, () => {
          for (let at = 1; at < esc.length; at += 1) {
            // A non-hex `g` before the id: the digits of `%2F` must not join the id into a run by accident.
            const inner = `https://g${ID23}${esc.slice(0, at)}${sep}${esc.slice(at)}.e.com/`;
            const url = `https://x.com/?r=${encN(inner, depth)}`;
            const q = JSON.stringify(url);
            // The separator is never written: it is %09/%0A/%0D (or deeper) in the address.
            expect(/[\t\n\r]/.test(url), q).toBe(false);
            for (const text of [url, `see ${url} now`]) {
              expect(holdsId(text), q).toBe(true);
              expect(safeShown(text), q).toBe(BULLETS);
              expect(autolink(text), q).toBe(BULLETS);
            }
            expect(secretShape(url), q).toBe(true);
            for (const node of [<ExtLink key="ext" url={url} />, <Link key="link" href={url}>Open</Link>]) {
              const r = render(node);
              expect(r.container.querySelector('[href]'), q).toBeNull();
              for (const p of [ID23.slice(0, 12), ID23.slice(12)]) expect(r.container.innerHTML, q).not.toContain(p);
              r.unmount();
            }
          }
        });
      }
    }
  }

  it('a label repeating the nested host (8 characters) is not shown for that secret address', () => {
    const url = `https://example.com/?next=https://${ID23}%25%09${LAST.charCodeAt(0).toString(16)}.example.com/`;
    const r = render(
      <ExtLink url={url} secret>
        {`${ID23.slice(-7)}${LAST}`}
      </ExtLink>,
    );
    expect(r.container.innerHTML).not.toContain(`${ID23.slice(-7)}${LAST}`);
    r.unmount();
  });

  it('id-free nested addresses with encoded separators are not masked, at every depth', () => {
    for (let depth = 1; depth <= 7; depth += 1) {
      for (const sep of ['\t', '\n', '\r']) {
        const url = `https://x.com/?r=${encN(`https://example.com/a%4${sep}1b/next`, depth)}`;
        expect(holdsId(url), JSON.stringify(url)).toBe(false);
        expect(secretShape(url), JSON.stringify(url)).toBe(false);
      }
    }
  });
});

describe('Link reads an href as the URL parser does before it decides it is absolute', () => {
  const ID = HEX;
  const FORMS = [
    `\u0000https://${ID}.example.com/`,
    ` https://${ID}.example.com/`,
    `\thttps://${ID}.example.com/`,
    `ht\ttps://${ID}.example.com/`,
    `https:\\\\${ID}.example.com\\`,
    `https:/\\${ID}.example.com/`,
    `//${ID}.example.com/`,
    `HTTPS://${ID}.example.com/`,
    `https://${ID}.example.com/ `,
  ];
  for (const href of FORMS) {
    it(`${JSON.stringify(href)} with a harmless label has no href and shows no id`, () => {
      const r = render(<Link href={href}>Open</Link>);
      for (const el of r.container.querySelectorAll('[href]')) expect(el.getAttribute('href') ?? '', JSON.stringify(href)).not.toMatch(/0123456789abcdef/i);
      expect(r.container.querySelector('[href]'), JSON.stringify(href)).toBeNull();
      expect(r.container.innerHTML).not.toContain(ID.slice(0, 12));
      r.unmount();
    });
  }

  it('a Hub path stays an ordinary link (only an address that leaves the Hub is judged by its host)', () => {
    const r = render(<Link href="/files/report">Open</Link>);
    expect(r.container.querySelector('a[href="/files/report"]')).not.toBeNull();
    r.unmount();
  });
});

describe('HREF RULE: a Hub path parses against an http and an https Hub and stays on both; anything else leaves the Hub', () => {
  const ID = HEX;
  const noIdHref = (href: string) => {
    const r = render(<Link href={href}>Open</Link>);
    expect(r.container.querySelector('[href]'), JSON.stringify(href)).toBeNull();
    expect(r.container.innerHTML, JSON.stringify(href)).not.toContain(ID.slice(0, 12));
    r.unmount();
  };
  // Relative to an http page, another host to an https one.
  const ONE_SCHEME = [`http:${ID}.e.com/`, `http:/${ID}.e.com/`, `http:\\${ID}.e.com/`, `HTTP:${ID}.e.com/`, `\thttp:${ID}.e.com/`, `h\nttp:${ID}.e.com/`, `http:e.com/${ID}`, `HtTp:e.com/?k=${ID}`, `https:${ID}.e.com/`, `https:/${ID}.e.com/`];
  // The parser refuses them: they fail closed, as the secret button.
  const REFUSED = [`https://${ID}.e.com:99999/`, `https://${ID} x.e.com/`, `https://${ID}^.e.com/`, `https://[${ID}]/`, `https://e.com:${ID}/`, `https://xn--${ID}.e.com/`, `https://${ID}.e.com%00/`];
  // A placeholder host spelled out, userinfo and default ports are no way onto the Hub either.
  const SPELLED = [`https://relative.invalid/${ID}`, `http://hub-a.invalid/p/${ID}`, `https://hub-b.invalid/p/${ID}`, `https://hub-b.invalid:443/?next=https://${ID}.e.com/`, `http://${ID}@hub-a.invalid/p/`, `https://${ID}.e.com:443/`];
  // Another scheme, or a fullwidth or backslash authority: the origin is "null" or foreign, so never a Hub path
  const OTHER_SCHEME = [`mailto:${ID}@e.com`, `data:text/plain,${ID}`, `javascript:alert('${ID}')`, `blob:https://e.com/${ID}`, `ws://${ID}.e.com/`, `https:\uFF0F\uFF0F${ID}.e.com/`, `\\\t\\${ID}.e.com/`];
  for (const [name, forms] of [['one scheme reads it as relative', ONE_SCHEME], ['the parser refuses it', REFUSED], ['it spells a host out', SPELLED], ['another scheme or a mangled authority', OTHER_SCHEME]] as const) {
    it(`${name}: with an id it has no href and shows no id`, () => {
      for (const href of forms) noIdHref(href);
    });
  }

  it('Hub paths stay ordinary links, an id in them included (they never leave the Hub)', () => {
    for (const href of ['/files/report', `/computers/${ID}`, `#/bots?sel=${ID}`, '?q=1', 'notes/a', './x', '../y']) {
      const r = render(<Link href={href}>Open</Link>);
      expect(r.container.querySelector('a[href]'), href).not.toBeNull();
      r.unmount();
    }
  });

  it('a fullwidth scheme is a relative path, as the browser reads it: it stays an ordinary link, not masked', () => {
    const href = `\uFF48\uFF54\uFF54\uFF50\uFF53://${ID}.e.com/`;
    const r = render(<Link href={href}>Open</Link>);
    expect(r.container.querySelector('a[href]'), href).not.toBeNull();
    expect(r.container.innerHTML).not.toContain('\u2022\u2022\u2022\u2022');
    r.unmount();
  });

  it('a mailto: href with an id renders as masked plain text: bullets, the fixed tooltip, no href, no button, no id', () => {
    const r = render(<Link href={`mailto:${ID}@e.com`}>Mail</Link>);
    const span = r.container.querySelector(`span[title="Not a web address"]`);
    expect(span).not.toBeNull();
    expect(span?.textContent).toBe('\u2022\u2022\u2022\u2022');
    expect(r.container.querySelector('[href]')).toBeNull();
    expect(r.container.querySelector('button')).toBeNull();
    expect(r.container.innerHTML).not.toContain(ID.slice(0, 12));
    r.unmount();
  });
});
