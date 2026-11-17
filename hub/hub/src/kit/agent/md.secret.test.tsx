// Vitest: a key the raw text keeps apart, with markup, an escape or an invisible character between its
// parts, must not show joined once Prose draws it. The raw-text scrub misses a key split by markup, so parseMd checks each text
// block as it shows (the Bot channel renderer's rule). A block that would show a key becomes that text, scrubbed; every other
// block keeps its formatting.
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { scrubSecrets } from './code';
import { parseMd, safeHref, type MdBlock } from './md';
import { Prose } from './Reply';

const KEY = 'sk-abcdefghijklmnop';
const hidden = (b: MdBlock | undefined) => expect(b).toEqual({ k: b?.k, ...(b?.k === 'h' ? { level: b.level } : {}), c: [{ k: 'text', s: '[hidden] here' }] });

describe('a key split by markdown is hidden as it would show', () => {
  // A key whose tail is a token of another family (-ak-): its start goes with the family's marker, never left showing.
  it('a key whose tail is another family\'s token shows hidden whole in a paragraph', () => {
    const text = ['sk-12345678-ak-', 'Ab12Cd34Ef56Gh78Ij90 here'].join('');
    expect(scrubSecrets(text)).toBe('[hidden] here');
    hidden(parseMd(text)[0]);
  });
  it.each([
    ['bold in the middle', 'sk-abcd**efgh**ijklmnop here'],
    ['italic in the middle', 'sk-abcd*efgh*ijklmnop here'],
    ['inline code in the middle', 'sk-abcd`efgh`ijklmnop here'],
    ['an escape in the middle', 'sk-abcdefgh\\-ijklmnop here'],
  ])('%s: the raw scrub misses it, the paragraph shows it hidden', (_why, text) => {
    expect(scrubSecrets(text)).toBe(text);
    hidden(parseMd(text)[0]);
  });

  it.each([
    ['a zero-width space', 'sk-abcdefgh\u200bijklmnop here'],
    ['a word joiner', 'sk-abcdefgh\u2060ijklmnop here'],
    ['a soft hyphen', 'sk-abcdefgh\u00adijklmnop here'],
  ])('%s: the paragraph shows it hidden', (_why, text) => {
    hidden(parseMd(text)[0]);
  });

  it.each([
    ['a zero-width space', '\u200b'],
    ['a bell', '\u0007'],
    ['a word joiner', '\u2060'],
  ])('%s between a word and a key: the paragraph and the fence never show the key', (_why, mark) => {
    const shown = JSON.stringify(parseMd(`note${mark}${KEY} here\n\n\`\`\`\nnote${mark}${KEY}\n\`\`\``));
    expect(shown).not.toContain('ijklmnop');
    expect(shown.match(/\[hidden\]/g)).toHaveLength(2);
  });

  it('markup and an invisible character together: the paragraph shows it hidden', () => {
    const shown = JSON.stringify(parseMd('note\u200bsk-abcd**efgh**ijklmnop here'));
    expect(shown).not.toContain('ijklmnop');
    expect(shown).toContain('[hidden]');
  });

  it('a heading, a list item, a quote and a table cell are checked the same way', () => {
    const [h, ul, quote, table] = parseMd(['# sk-abcd**efgh**ijklmnop here', '', '- sk-abcd**efgh**ijklmnop here', '', '> sk-abcd**efgh**ijklmnop here', '', '| a | b |', '| --- | --- |', '| sk-abcd**efgh**ijklmnop here | ok |'].join('\n'));
    hidden(h);
    expect(ul).toEqual({ k: 'ul', items: [[{ k: 'text', s: '[hidden] here' }]] });
    expect(quote).toEqual({ k: 'quote', c: [{ k: 'p', c: [{ k: 'text', s: '[hidden] here' }] }] });
    expect(table).toMatchObject({ k: 'table', rows: [[[{ k: 'text', s: '[hidden] here' }], [{ k: 'text', s: 'ok' }]]] });
  });

  it('an ordered list item and a table header cell are checked the same way', () => {
    const [ol, table] = parseMd(['1. sk-abcd**efgh**ijklmnop here', '2. fine', '', '| sk-abcd**efgh**ijklmnop here | b |', '| --- | --- |', '| x | y |'].join('\n'));
    expect(ol).toEqual({ k: 'ol', start: 1, items: [[{ k: 'text', s: '[hidden] here' }], [{ k: 'text', s: 'fine' }]] });
    expect(table).toMatchObject({ k: 'table', head: [[{ k: 'text', s: '[hidden] here' }], [{ k: 'text', s: 'b' }]] });
  });

  it.each([
    ['a zero-width space', '\u200b'],
    ['a word joiner', '\u2060'],
    ['a soft hyphen', '\u00ad'],
  ])('fenced code split by %s: the fence shows it hidden and keeps its other lines', (_why, mark) => {
    const text = '```ts\nconst a = 1\nsk-abcdefgh' + mark + 'ijklmnop\n```';
    expect(parseMd(text)).toEqual([{ k: 'code', s: 'const a = 1\n[hidden]', lang: 'ts', open: false }]);
  });

  it('a fence that joins no key keeps its text as written, invisible characters included', () => {
    expect(parseMd('```\na\u200bb\n```')).toEqual([{ k: 'code', s: 'a\u200bb', lang: '', open: false }]);
  });

  it('a link label that joins a key loses its link and shows hidden', () => {
    hidden(parseMd('[sk-abcd**efgh**ijklmnop](https://example.com/) here')[0]);
  });

  it('formatting stays where nothing joins a key: an ordinary bold paragraph, and the block beside a hidden one', () => {
    const [plainBold, bad, after] = parseMd('a **bold** word\n\nsk-abcd**efgh**ijklmnop here\n\nnext **bold** one');
    expect(plainBold).toEqual({ k: 'p', c: [{ k: 'text', s: 'a ' }, { k: 'b', c: [{ k: 'text', s: 'bold' }] }, { k: 'text', s: ' word' }] });
    hidden(bad);
    expect(after).toEqual({ k: 'p', c: [{ k: 'text', s: 'next ' }, { k: 'b', c: [{ k: 'text', s: 'bold' }] }, { k: 'text', s: ' one' }] });
  });

  it('an emoji with its variation selector keeps its formatting when no key is near', () => {
    const [p] = parseMd('**ok** \u2764\ufe0f');
    expect(p).toEqual({ k: 'p', c: [{ k: 'b', c: [{ k: 'text', s: 'ok' }] }, { k: 'text', s: ' \u2764\ufe0f' }] });
  });

  it('Prose never draws the joined key (the Bots Activity bubble and the AI reply draw through it)', () => {
    const { container } = render(<Prose text={'sk-abcd**efgh**ijklmnop and sk-abcdefgh\u200bijklmnop'} />);
    const shown = (container.textContent ?? '').replace(/[\u200b\u2060\u00ad]/g, '');
    expect(shown).not.toContain(KEY);
    expect(shown).toContain('[hidden]');
  });

  it('the CodeBlock Prose draws for a fence never shows the joined key, plain or coloured', () => {
    const { container } = render(<Prose text={'```\nsk-abcdefgh\u200bijklmnop\n```\n\n```ts\nconst k = "sk-abcdefgh\u00adijklmnop"\n```'} />);
    const pres = [...container.querySelectorAll('pre')];
    expect(pres).toHaveLength(2);
    for (const pre of pres) {
      const shown = (pre.textContent ?? '').replace(/[\u200b\u2060\u00ad]/g, '');
      expect(shown).not.toContain(KEY);
      expect(shown).toContain('[hidden]');
    }
  });
});

describe('a link address that hides a key behind what URL() encodes', () => {
  it('a key split by an invisible character is no link', () => {
    expect(safeHref('https://x.test/sk-live\u200b0123456789abcdef')).toBeNull();
    expect(safeHref('https://x.test/s%E2%80%8Bk-live0123456789abcdef')).toBeNull();
  });
  it('one malformed escape elsewhere does not turn the decoded check off', () => {
    expect(safeHref('https://example.com/p/sk-live0123%E2%80%8B456789abcdef?off=50%')).toBeNull();
    expect(safeHref('https://example.com/p/sk-live0123%E2%80%8B456789abcdef?x=%E0%A4%A')).toBeNull();
    expect(safeHref('https://example.com/p/sk-live0123%E2%80%8B456789abcdef?x=%FF')).toBeNull();
  });
  it('a refused address whose key only shows decoded is hidden whole, never shown encoded', () => {
    for (const text of ['see https://x.test/sk%2Dabcdefghijklmnop now', 'see https://x.test/s%6B-abcdefghijklmnop now']) {
      const { container, unmount } = render(<Prose text={text} />);
      const shown = container.textContent ?? '';
      expect(shown).toContain('[hidden]');
      expect(shown).not.toContain('abcdefghijklmnop');
      expect(container.querySelector('a')).toBeNull();
      unmount();
    }
  });
  it('the same address in markdown link text or as a link target shows no key', () => {
    const enc = 'https://x.test/sk%2Dabcdefghijklmnop';
    for (const text of [`see [${enc}](https://ok.test/) now`, `see [](${enc}) now`, `see [${enc}](${enc}) now`]) {
      const { container, unmount } = render(<Prose text={text} />);
      const shown = container.textContent ?? '';
      expect(shown).toContain('[hidden]');
      expect(shown).not.toContain('abcdefghijklmnop');
      expect(shown).not.toContain('sk%2D');
      for (const a of container.querySelectorAll('a')) expect(a.getAttribute('href')).toBe('https://ok.test/');
      unmount();
    }
  });
  it('a plain safe address renders unchanged, as a link', () => {
    const { container } = render(<Prose text="see https://x.test/docs/page?q=1 now" />);
    expect(container.textContent).toBe('see https://x.test/docs/page?q=1 now');
    expect(container.querySelector('a')?.getAttribute('href')).toBe('https://x.test/docs/page?q=1');
  });
  it('a refused address whose key shows as written keeps the rest of the address', () => {
    const { container } = render(<Prose text={`see https://x.test/${KEY} now`} />);
    expect(container.textContent).toContain('x.test/[hidden]');
    expect(container.textContent).not.toContain(KEY);
  });
  it('an ordinary encoded address and one that does not decode stay links', () => {
    expect(safeHref('https://x.test/caf%C3%A9?q=a%20b')?.host).toBe('x.test');
    expect(safeHref('https://x.test/100%25/%E0%A4%A')?.host).toBe('x.test');
  });
});
