import { describe, expect, it } from 'vitest';
import { inline, parseMd, plain, safeHref } from './md';

describe('links are http(s) only', () => {
  it('keeps http and https, refuses the rest', () => {
    expect(safeHref('https://example.com/a')).toEqual({ href: 'https://example.com/a', host: 'example.com' });
    expect(safeHref('javascript:alert(1)')).toBeNull();
    expect(safeHref('data:text/html,x')).toBeNull();
    expect(safeHref('/relative')).toBeNull();
  });
  it('a markdown link with another scheme stays text; an image is a link, never an image', () => {
    // The address's own parentheses balance, so the whole of it is refused and nothing of it is left over as text.
    expect(inline('[x](javascript:alert(1))')).toEqual([{ k: 'text', s: 'x' }]);
    // The node also carries the reader's read and whether the address was bare (a host marks by them).
    const img = inline('![chart](https://example.com/c.png)');
    expect(img).toHaveLength(1);
    expect(img[0]).toMatchObject({ k: 'a', href: 'https://example.com/c.png', host: 'example.com', c: [{ k: 'text', s: 'chart' }], bare: false });
  });
  it('bare https links, trailing punctuation left out', () => {
    const r = inline('see https://example.com/x. ok');
    expect(r[1]).toMatchObject({ k: 'a', href: 'https://example.com/x' });
    expect(plain(r)).toBe('see https://example.com/x. ok');
  });
});

describe('a link address with parentheses', () => {
  const link = (s: string) => inline(s).filter((n) => n.k === 'a');
  it('is read to the parenthesis that balances it', () => {
    const r = inline('[order](https://shop.example/orders/a(b)?q=1)');
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ k: 'a', href: 'https://shop.example/orders/a(b)?q=1', c: [{ k: 'text', s: 'order' }] });
    expect(plain(r)).toBe('order');
    expect(link('see [Foo](https://wiki.example/w/Foo_(bar)) here')[0]).toMatchObject({ href: 'https://wiki.example/w/Foo_(bar)' });
    expect(plain(inline('see [Foo](https://wiki.example/w/Foo_(bar)) here'))).toBe('see Foo here');
    expect(link('[n](https://h.example/a((b))c)')[0]).toMatchObject({ href: 'https://h.example/a((b))c' });
  });
  it('ends at the first ) when there are none in the address, so text after it stays text', () => {
    const r = inline('[x](https://h.example/a) and (b) more');
    expect(link('[x](https://h.example/a) and (b) more')[0]).toMatchObject({ href: 'https://h.example/a' });
    expect(plain(r)).toBe('x and (b) more');
  });
  it('keeps the first ) when the address never balances, or after a space (a title), as before', () => {
    expect(link('[x](https://h.example/a(b)')[0]).toMatchObject({ href: 'https://h.example/a(b' });
    expect(link('[x](https://h.example/a(b c)')[0]).toMatchObject({ href: 'https://h.example/a(b' });
    expect(plain(inline('[x](https://h.example/a(b c) tail)'))).toBe('x tail)');
    // Any whitespace ends the address, as the target is split on it: a no-break space or a carriage return too.
    for (const ws of [' ', '\t', '\n', '\r', '\u00a0', '\u2003']) {
      expect(plain(inline(`[x](https://h.example/a(b${ws}title)tail)`)), JSON.stringify(ws)).toBe('xtail)');
    }
    expect(plain(inline('[x](https://h.example/a "t (1)")'))).toBe('x")');
  });
  it('a refused address with parentheses leaves none of itself behind', () => {
    expect(plain(inline('[x](data:text/html,(a)(b)) after'))).toBe('x after');
  });
});

describe('inline', () => {
  it('code, bold, italic; snake_case stays text', () => {
    expect(inline('run `ls -la` now')).toEqual([{ k: 'text', s: 'run ' }, { k: 'code', s: 'ls -la' }, { k: 'text', s: ' now' }]);
    expect(inline('**chart.js** done')[0]).toEqual({ k: 'b', c: [{ k: 'text', s: 'chart.js' }] });
    expect(inline('an *idea*')[1]).toEqual({ k: 'i', c: [{ k: 'text', s: 'idea' }] });
    expect(inline('my_file_name')).toEqual([{ k: 'text', s: 'my_file_name' }]);
    expect(inline('2 * 3 * 4')).toEqual([{ k: 'text', s: '2 * 3 * 4' }]);
  });
});

describe('blocks', () => {
  it('headings, lists, quotes, rules, paragraphs', () => {
    const b = parseMd('# Title\n\nSome text\nmore\n\n- one\n- two\n\n1. a\n2. b\n\n> said\n\n---');
    expect(b.map((x) => x.k)).toEqual(['h', 'p', 'ul', 'ol', 'quote', 'hr']);
    expect(b[0]).toEqual({ k: 'h', level: 1, c: [{ k: 'text', s: 'Title' }] });
    expect(parseMd('### Deep ##\n\n###### Six').map((x) => x.k === 'h' && [x.level, x.c])).toEqual([[3, [{ k: 'text', s: 'Deep' }]], [6, [{ k: 'text', s: 'Six' }]]]);
    expect(b[2]).toMatchObject({ k: 'ul', items: [[{ k: 'text', s: 'one' }], [{ k: 'text', s: 'two' }]] });
  });
  it('a table', () => {
    const b = parseMd('| a | b |\n| --- | --- |\n| 1 | 2 |');
    expect(b[0]).toMatchObject({ k: 'table', head: [[{ s: 'a' }], [{ s: 'b' }]], rows: [[[{ s: '1' }], [{ s: '2' }]]] });
  });
  it('a fence still being written is an open code block, never raw backticks', () => {
    const b = parseMd('Here:\n\n```html\n<ul id="pcs">');
    expect(b[1]).toMatchObject({ k: 'code', lang: 'html', open: true });
    expect(JSON.stringify(b)).not.toContain('```');
  });
});
