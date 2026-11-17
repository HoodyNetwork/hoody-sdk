// Vitest: the Board's "Download as HTML" file (boardHtml.ts): its name, the escaper, which tiles are frames and which
// are cards, and the generated document for a fixture Board with hostile names and addresses.
import { describe, expect, it } from 'vitest';
import { boardHtml, esc, htmlFileName, htmlTile, type HtmlText, type HtmlTile } from './boardHtml';
import { slotNode, split } from './model/tree';
import type { Tile } from './model/boards';

const text: HtmlText = {
  saved: 'Saved from Hoody on 2026-11-12', notSynced: 'not synced', openHub: 'Open in Hoody', openNew: 'Open in a new tab', empty: 'Empty',
  cardHub: 'This tile opens in Hoody.', cardNoAddress: 'This tile had no address when the file was saved.',
};
const day = new Date(2026, 10, 12, 9, 30);

describe('htmlFileName', () => {
  it('names the realm, the Board and the day, in an order that sorts', () => {
    expect(htmlFileName('Acme Production', ['Main', 'Ops Wall'], 1, day)).toBe('hoody-board_acme-production_ops-wall_2026-11-12.html');
  });
  it('says "all" with no realm', () => {
    expect(htmlFileName(null, ['Main'], 0, day)).toBe('hoody-board_all_main_2026-11-12.html');
  });
  it('drops accents, keeps ASCII only and falls back when nothing is left', () => {
    expect(htmlFileName('Équipe Été', ['Señal ñandú'], 0, day)).toBe('hoody-board_equipe-ete_senal-nandu_2026-11-12.html');
    expect(htmlFileName('日本', ['看板'], 0, day)).toBe('hoody-board_realm_board_2026-11-12.html');
    expect(htmlFileName('  ', ['💥'], 0, day)).toBe('hoody-board_realm_board_2026-11-12.html');
  });
  it('holds no path, quote or dot from a hostile name', () => {
    const n = htmlFileName('../../etc', ['a/b\\c:"d"<e>.html.exe'], 0, day);
    expect(n).toBe('hoody-board_etc_a-b-c-d-e-html-exe_2026-11-12.html');
    expect(n).toMatch(/^[a-z0-9_-]+\.html$/);
  });
  it('caps each part at 40 characters with no dash at the cut', () => {
    const n = htmlFileName('r'.repeat(39) + ' tail', ['b'.repeat(80)], 0, day);
    expect(n).toBe(`hoody-board_${'r'.repeat(39)}_${'b'.repeat(40)}_2026-11-12.html`);
  });
  it('numbers the second and later Boards whose names come out the same', () => {
    const names = ['Ops', 'ops!', 'Other', 'OPS'];
    expect(htmlFileName('A', names, 0, day)).toBe('hoody-board_a_ops_2026-11-12.html');
    expect(htmlFileName('A', names, 1, day)).toBe('hoody-board_a_ops-2_2026-11-12.html');
    expect(htmlFileName('A', names, 3, day)).toBe('hoody-board_a_ops-3_2026-11-12.html');
    expect(htmlFileName('A', names, 2, day)).toBe('hoody-board_a_other_2026-11-12.html');
  });
  it('pads the month and the day', () => {
    expect(htmlFileName('A', ['B'], 0, new Date(2027, 0, 5))).toBe('hoody-board_a_b_2027-01-05.html');
  });
});

describe('esc', () => {
  it('escapes every character that could leave text or an attribute', () => {
    expect(esc(`<script>alert("x")</script>&'\``)).toBe('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;&amp;&#39;&#96;');
  });
  it('leaves plain text and other scripts as they are', () => {
    expect(esc('Ops wall · 看板 é')).toBe('Ops wall · 看板 é');
  });
});

const prog: Tile = { project: 'p1', computer: 'c1', program: 'terminal', session: 1, tid: 'tabcd' };
const info = (tile: Tile | null, shareUrl: string | null, more: { conv?: boolean } = {}) =>
  ({ tile, name: 'n', computerName: 'atlas', shareUrl, ...(more.conv ? { conv: { computer: 'atlas.00a1', realm: 'global', sid: 's1' } } : {}) });

describe('htmlTile', () => {
  it('frames a web address and an HTTP port', () => {
    expect(htmlTile(info({ url: 'https://example.org/a' }, 'https://example.org/a'), text)).toMatchObject({ kind: 'frame', url: 'https://example.org/a' });
    expect(htmlTile(info({ project: 'p1', computer: 'c1', protocol: 'http', port: 8080 }, 'https://p.example.net/'), text)).toMatchObject({ kind: 'frame', url: 'https://p.example.net/' });
  });
  it('frames a program, an agent and an exec script on their address too', () => {
    expect(htmlTile(info(prog, 'https://t.example.net/'), text)).toMatchObject({ kind: 'frame', url: 'https://t.example.net/' });
    expect(htmlTile(info({ ...prog, program: 'agent' }, 'https://a.example.net/'), text)).toMatchObject({ kind: 'frame', url: 'https://a.example.net/' });
    expect(htmlTile(info({ project: 'p1', computer: 'c1', protocol: 'exec', port: 1, path: '/run' }, 'https://e.example.net/run'), text)).toMatchObject({ kind: 'frame', url: 'https://e.example.net/run' });
  });
  it('makes a conversation a card that opens in Hoody', () => {
    expect(htmlTile(info({ url: 'https://hub.example/auth/home#/ai/c/s1' }, 'https://hub.example/auth/home#/ai/c/s1', { conv: true }), text)).toMatchObject({ kind: 'card', note: text.cardHub });
  });
  it('gives a tile with no address (stopped computer, SSH terminal, Bot) a card with no link', () => {
    expect(htmlTile(info(prog, null), text)).toMatchObject({ kind: 'card', url: null, note: text.cardNoAddress });
    expect(htmlTile(info({ project: 'p1', computer: 'c1', realm: 'global', bot: 'b1' }, null), text)).toMatchObject({ kind: 'card', url: null });
  });
  it('refuses an address that is not http or https, whatever the tile says', () => {
    for (const bad of ['javascript:alert(1)', 'data:text/html,<script>1</script>', 'file:///etc/passwd', 'https:example.org', ' ']) {
      expect(htmlTile(info({ url: bad }, bad), text)).toMatchObject({ kind: 'card', url: null, note: text.cardNoAddress });
    }
  });
  it('names an empty slot', () => {
    expect(htmlTile(info(null, null), text)).toMatchObject({ kind: 'empty', url: null });
  });
});

const tiles = (o: Record<string, Partial<HtmlTile>>): Record<string, HtmlTile> =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { kind: 'card', name: k, computer: '', url: null, note: '', ...v } as HtmlTile]));
const cspOf = (html: string): string => new DOMParser().parseFromString(html, 'text/html').querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute('content') ?? '';
const sha = async (s: string) => btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))));

describe('boardHtml', () => {
  const layout = split('row', 1 / 3, slotNode('a'), split('col', 0.5, slotNode('b'), slotNode('c')));
  const input = {
    board: 'Ops wall', realm: 'Acme', hubUrl: 'https://hub.example/auth/home#/board', text, layout,
    tiles: tiles({
      a: { kind: 'frame', name: 'example.org', url: 'https://example.org/a?x=1&y=2' },
      b: { kind: 'frame', name: 'terminal-1', computer: 'atlas', url: 'https://t.example.net/' },
      c: { kind: 'empty', name: text.empty },
    }),
  };

  it('is one static page: the bar, the Board and realm names, each tile, and no script', async () => {
    const html = await boardHtml(input);
    expect(html.startsWith('<!doctype html>')).toBe(true);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    expect(doc.title).toBe('Ops wall · Acme');
    expect(doc.querySelector('header')?.textContent).toContain('Saved from Hoody on 2026-11-12');
    expect(doc.querySelector('header')?.textContent).toContain('not synced');
    expect(doc.querySelector('header a')?.getAttribute('href')).toBe('https://hub.example/auth/home#/board');
    expect(doc.querySelector('h1')?.textContent).toBe('Ops wall');
    expect(doc.querySelectorAll('script, link, img, form, object, embed, base').length).toBe(0);
    expect(doc.querySelectorAll('style').length).toBe(1);
    expect(doc.querySelectorAll('[style], [onclick], [onload], [onerror]').length).toBe(0);
    expect(doc.querySelectorAll('section').length).toBe(3);
  });
  it('frames every tile with an address, sandboxed, and keeps "Open in a new tab" on every tile with an address', async () => {
    const doc = new DOMParser().parseFromString(await boardHtml(input), 'text/html');
    const frames = [...doc.querySelectorAll('iframe')];
    expect(frames.map((f) => f.getAttribute('src'))).toEqual(['https://example.org/a?x=1&y=2', 'https://t.example.net/']);
    expect(frames[0]?.getAttribute('sandbox')).toContain('allow-scripts');
    expect(frames[0]?.getAttribute('referrerpolicy')).toBe('no-referrer');
    expect(frames[0]?.getAttribute('title')).toBe('example.org');
    const links = [...doc.querySelectorAll('main a')];
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['https://example.org/a?x=1&y=2', 'https://t.example.net/']);
    for (const a of links) { expect(a.getAttribute('target')).toBe('_blank'); expect(a.getAttribute('rel')).toBe('noopener noreferrer'); }
    expect(doc.querySelector('main')?.textContent).toContain(text.empty);
  });
  it('carries a strict policy: nothing but the tile origins in frames and the one style by its hash', async () => {
    const html = await boardHtml(input);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const csp = doc.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute('content') ?? '';
    const style = /<style>([\s\S]*?)<\/style>/.exec(html)?.[1] ?? '';
    expect(csp).toBe(`default-src 'none'; frame-src https://example.org https://t.example.net; style-src 'sha256-${await sha(style)}'; base-uri 'none'; form-action 'none'`);
    // The policy comes before anything it governs.
    expect(html.indexOf('Content-Security-Policy')).toBeLessThan(html.indexOf('<style>'));
  });
  it("frames nothing ('none') when no tile is a frame", async () => {
    const html = await boardHtml({ ...input, tiles: tiles({ a: {}, b: {}, c: {} }) });
    expect(cspOf(html)).toContain("frame-src 'none'");
    expect(html).not.toContain('<iframe');
  });
  it('lays the split tree out with its ratios, as numbers only', async () => {
    const html = await boardHtml(input);
    const style = /<style>([\s\S]*?)<\/style>/.exec(html)?.[1] ?? '';
    expect(style).toContain('.g1{flex-grow:0.333}');
    expect(style).toContain('.g2{flex-grow:0.667}');
    const doc = new DOMParser().parseFromString(html, 'text/html');
    expect(doc.querySelector('main > .row > .g1 h2')?.textContent).toBe('example.org');
    expect(doc.querySelectorAll('main > .row > .g2.col > .row > section').length).toBe(2);
  });
  it('clamps a ratio that is not a sane number', async () => {
    const html = await boardHtml({ ...input, layout: split('row', Number.NaN, slotNode('a'), split('col', 7, slotNode('b'), slotNode('c'))) });
    const style = /<style>([\s\S]*?)<\/style>/.exec(html)?.[1] ?? '';
    expect(style).toContain('.g1{flex-grow:0.500}');
    expect(style).toContain('.g3{flex-grow:0.900}');
    expect(style).not.toMatch(/NaN|Infinity/);
  });
  it('escapes hostile names and never lets one leave its place', async () => {
    const evil = `"><script>alert(1)</script></style></title><img src=x onerror=alert(2)>'`;
    const html = await boardHtml({
      ...input, board: evil, realm: evil,
      tiles: tiles({ a: { kind: 'frame', name: evil, computer: evil, url: `https://example.org/?q="><script>x</script>` }, b: { kind: 'card', name: evil, note: evil, url: 'https://t.example.net/' }, c: { kind: 'empty', name: evil } }),
    });
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/<img/i);
    expect(html.match(/<\/style>/g)?.length).toBe(1);
    expect(html.match(/<\/title>/g)?.length).toBe(1);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    expect(doc.querySelectorAll('script, img, [onerror]').length).toBe(0);
    expect(doc.querySelector('h1')?.textContent).toBe(evil);
    expect(doc.querySelector('iframe')?.getAttribute('src')).toBe(`https://example.org/?q="><script>x</script>`);
    expect(doc.querySelector('iframe')?.getAttribute('title')).toBe(evil);
  });
  it('drops an address that is not http or https, even if a caller passes one', async () => {
    for (const bad of ['javascript:alert(1)', 'data:text/html,x', 'JaVaScRiPt:alert(1)', '//example.org']) {
      const html = await boardHtml({ ...input, hubUrl: bad, tiles: tiles({ a: { kind: 'frame', url: bad }, b: { kind: 'card', url: bad }, c: {} }) });
      expect(html).not.toContain('<iframe');
      expect(html).not.toMatch(/href=/);
      expect(html.toLowerCase()).not.toContain('javascript:');
      expect(cspOf(html)).toContain("frame-src 'none'");
    }
  });
  it('holds nothing but what it was given: no token name, no storage key, no id', async () => {
    const html = await boardHtml(input);
    for (const word of ['hdy_', 'token', 'hub_', 'hub.v3', 'localStorage', 'tabcd', 'p1', 'c1']) expect(html).not.toContain(word);
  });
  it("wears the Hub's look: its grounds and text colours in light and dark, sharp corners, mono capitals for labels, no font file", async () => {
    const style = /<style>([\s\S]*?)<\/style>/.exec(await boardHtml(input))?.[1] ?? '';
    for (const v of ['#f0f0f0', '#edeaea', '#272727', '#606060', '#0741ff', '#111112', '#18181a', '#ededed', '#9d9d9d', '#8da6ff']) expect(style).toContain(v);
    expect(style).toContain('text-transform:uppercase');
    expect(style).toContain('ui-monospace');
    expect(style).not.toMatch(/border-radius|url\(|@import|@font-face/);
  });
  it('gives the same bytes for the same Board', async () => {
    expect(await boardHtml(input)).toBe(await boardHtml(input));
  });
});
