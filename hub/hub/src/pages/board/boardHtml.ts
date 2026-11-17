// A Board saved as one static HTML file ("Download as HTML"): a copy to open from disk, never synced, never edited.
//
// Contract, in plain words:
//   - htmlFileName → `hoody-board_<realm>_<board>_<YYYY-MM-DD>.html`, ASCII lower-case, each name at most 40 characters;
//     "all" with no realm; a second Board whose name comes out the same gets "-2".
//   - htmlTile decides what a tile is in the file. Only the tile's share address is read (the Copy link address: no
//     Board options and never a token), and only when webUrl admits it (http or https). Every tile with an address is
//     a frame on that address (the file keeps the links AND frames them): a web address, a
//     port, a program, an agent, an exec script. Its header keeps "Open in a new tab" for a page that refuses to be
//     framed from a file. A conversation is a card that opens in Hoody (a Hub page is never framed). A tile with no
//     address (computer not running, SSH terminal, Bot) is a card with no link.
//   - boardHtml builds the page: a policy that allows nothing but the framed origins and the one style (by its hash),
//     a bar, the split tree as nested flex boxes, each tile a header and a frame or a card. No script, no style
//     attribute, no request of its own. Every value goes through esc; an address goes through webUrl again here.
//   - Nothing else enters the file: no id, nothing from storage, no session value.
import { webUrl, type Tile } from './model/boards';
import { isSlot, type Node } from './model/tree';
import { FRAME_SANDBOX } from './parts/Frame';

/** The file's fixed words, from the page's strings. */
export interface HtmlText {
  readonly saved: string;
  readonly notSynced: string;
  readonly openHub: string;
  readonly openNew: string;
  readonly empty: string;
  readonly cardHub: string;
  readonly cardNoAddress: string;
}

export interface HtmlTile {
  readonly kind: 'frame' | 'card' | 'empty';
  readonly name: string;
  readonly computer: string;
  readonly url: string | null;
  /** A card's one sentence. */
  readonly note: string;
}

export interface HtmlInput {
  readonly board: string;
  /** The realm's name, or null in All realms. */
  readonly realm: string | null;
  /** The served Hub's Board page, or '' for no link. */
  readonly hubUrl: string;
  readonly text: HtmlText;
  readonly layout: Node;
  readonly tiles: Readonly<Record<string, HtmlTile>>;
}

const PART_MAX = 40;
const slug = (s: string): string => s.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+/, '').slice(0, PART_MAX).replace(/-+$/, '');
const two = (n: number): string => String(n).padStart(2, '0');

/** The file's name for the Board at `index` of `boards` (the realm's Board names, in order), on the local day of `now`. */
export function htmlFileName(realm: string | null, boards: readonly string[], index: number, now: Date): string {
  const own = slug(boards[index] ?? '') || 'board';
  const nth = boards.slice(0, index).filter((b) => (slug(b) || 'board') === own).length + 1;
  const where = realm === null ? 'all' : slug(realm) || 'realm';
  return `hoody-board_${where}_${own}${nth > 1 ? `-${nth}` : ''}_${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}.html`;
}

const ESC: Readonly<Record<string, string>> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };
/** Text for an element or a quoted attribute. */
export const esc = (s: string): string => String(s).replace(/[&<>"'`]/g, (c) => ESC[c] as string);

/** What one tile is in the file, from what the Board shows of it. */
export function htmlTile(i: { readonly tile: Tile | null; readonly name: string; readonly computerName: string; readonly shareUrl: string | null; readonly conv?: unknown }, text: HtmlText): HtmlTile {
  if (!i.tile) return { kind: 'empty', name: text.empty, computer: '', url: null, note: '' };
  const url = i.shareUrl === null ? null : webUrl(i.shareUrl);
  const base = { name: i.name, computer: i.computerName, url };
  if (!url) return { ...base, kind: 'card', note: text.cardNoAddress };
  if (i.conv) return { ...base, kind: 'card', note: text.cardHub };
  return { ...base, kind: 'frame', note: '' };
}

// The look is the Hub's, as plain values copied from kit/tokens.css (the file loads no stylesheet and no font and
// defines no custom property): ground, card, ink, muted text, line and link, light first and the dark block repeating
// only the colours; sharp corners, 1px lines, labels in mono capitals.
const MONO = 'ui-monospace,"SF Mono",menlo,consolas,monospace';
const CSS = [
  ':root{color-scheme:light dark}',
  '*{box-sizing:border-box}',
  'html,body{height:100%;margin:0}',
  'body{display:flex;flex-direction:column;background:#f0f0f0;color:#272727;font:14px/1.4 system-ui,sans-serif}',
  'a{color:#0741ff}',
  'header{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 16px;padding:10px 12px;border-bottom:1px solid #00000017}',
  'h1{margin:0;font-size:16px;font-weight:600;overflow-wrap:anywhere}',
  `header p,h2,section>div a,header a{font:12px/1.4 ${MONO};letter-spacing:.06em;text-transform:uppercase}`,
  'header p{margin:0;color:#606060}',
  'main{flex:1 1 0;min-height:0;display:flex;padding:4px}',
  '.row,.col{display:flex;flex:1 1 0;min-width:0;min-height:0}',
  '.col{flex-direction:column}',
  'section{flex:1 1 0;min-width:0;min-height:0;display:flex;flex-direction:column;margin:2px;background:#edeaea;border:1px solid #6b6b6b8f;overflow:hidden}',
  'section>div{display:flex;align-items:baseline;gap:12px;padding:7px 10px;border-bottom:1px solid #00000017}',
  'h2{flex:1 1 0;min-width:0;margin:0;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
  'h2 span{color:#606060;font-weight:400}',
  'section>div a{white-space:nowrap}',
  'iframe{flex:1 1 0;min-height:0;width:100%;border:0;background:#fff}',
  'section>p{margin:auto;padding:16px;max-width:40ch;text-align:center;color:#606060}',
  '@media (prefers-color-scheme:dark){body{background:#111112;color:#ededed}a{color:#8da6ff}header,section>div{border-color:#ffffff12}section{background:#18181a;border-color:#ffffff3d}header p,h2 span,section>p{color:#9d9d9d}}',
  '@media (max-width:700px){html,body{height:auto}main,.row,.col{display:block}section{min-height:70vh}section.x{min-height:0}}',
].join('\n');

const grow = (r: number): string => (Number.isFinite(r) ? Math.min(0.9, Math.max(0.1, r)) : 0.5).toFixed(3);

async function sha256(s: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

/** The whole file. */
export async function boardHtml(input: HtmlInput): Promise<string> {
  const { text } = input;
  const origins = new Set<string>();
  const grows: string[] = [];
  const link = (url: string, label: string): string => `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>`;
  const tileOf = (slot: string): string => {
    const t = input.tiles[slot];
    const url = t?.url ? webUrl(t.url) : null;
    if (!t || t.kind === 'empty') return `<section class="x"><p>${esc(t?.name || text.empty)}</p></section>`;
    const head = `<div><h2>${esc(t.name)}${t.computer ? ` <span>· ${esc(t.computer)}</span>` : ''}</h2>${url ? link(url, text.openNew) : ''}</div>`;
    if (t.kind === 'frame' && url) {
      origins.add(new URL(url).origin);
      return `<section>${head}<iframe src="${esc(url)}" title="${esc(t.name)}" sandbox="${FRAME_SANDBOX}" allow="fullscreen" referrerpolicy="no-referrer" loading="lazy"></iframe></section>`;
    }
    return `<section class="x">${head}<p>${esc(url ? t.note : text.cardNoAddress)}</p></section>`;
  };
  // Each split child sits in a box whose class carries its share (.gN), so no element has a style attribute.
  const boxed = (n: Node, share: number): string => {
    grows.push(`.g${grows.length + 1}{flex-grow:${grow(share)}}`);
    const cls = `g${grows.length}`;
    return isSlot(n) ? `<div class="${cls} row">${tileOf(n.slot)}</div>` : `<div class="${cls} ${n.dir === 'col' ? 'col' : 'row'}">${pair(n)}</div>`;
  };
  const pair = (n: Exclude<Node, { slot: string }>): string => {
    const r = Number(grow(n.ratio));
    return boxed(n.a, r) + boxed(n.b, 1 - r);
  };
  const body = isSlot(input.layout) ? tileOf(input.layout.slot) : `<div class="${input.layout.dir === 'col' ? 'col' : 'row'}">${pair(input.layout)}</div>`;
  const style = CSS + (grows.length ? '\n' + grows.join('\n') : '');
  const hub = input.hubUrl ? webUrl(input.hubUrl) : null;
  const csp = `default-src 'none'; frame-src ${origins.size ? [...origins].sort().join(' ') : "'none'"}; style-src 'sha256-${await sha256(style)}'; base-uri 'none'; form-action 'none'`;
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    `<meta http-equiv="Content-Security-Policy" content="${esc(csp)}">`,
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="referrer" content="no-referrer">',
    `<title>${esc(input.realm === null ? input.board : `${input.board} · ${input.realm}`)}</title>`,
    `<style>${style}</style>`,
    '</head>',
    '<body>',
    `<header><h1>${esc(input.board)}</h1><p>${esc(text.saved)} · ${esc(text.notSynced)}</p>${hub ? link(hub, text.openHub) : ''}</header>`,
    `<main>${body}</main>`,
    '</body>',
    '</html>',
    '',
  ].join('\n');
}
