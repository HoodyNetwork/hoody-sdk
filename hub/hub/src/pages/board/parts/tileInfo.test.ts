// infoFor: only a live tile of a computer in the selected realm's list gets frame and share addresses; a stopped,
// unknown or gone tile gets none (the view never frames it). Two tiles of one session get numbered frame titles.
import { describe, expect, it } from 'vitest';
import type { Catalog } from '../embed/catalog';
import catalog from '../embed/catalog.ui.json';
import type { BoardComputer } from '../computers';
import { addTile, freshRealm, isRefusal, type Board, type TileRef } from '../model/boards';
import strings from '../strings.en.json';
import { TERM_THEMES } from '../options/themes';
import { boardInfo, infoFor, shellShown, shellTarget, terminalTools, type InfoCtx, type RealmCtx } from './tileInfo';

const S = strings as Record<string, string>;
const t = (k: string, v: Record<string, unknown> = {}) => (S[k] ?? k).replace(/\{\{(\w+)\}\}/g, (_, x: string) => String(v[x]));
const pc = (id: string, name: string, status: string) => ({ id, name, status, project_id: 'p1', server_name: 'n12', realm_ids: [] }) as unknown as BoardComputer;
const live = pc('c1', 'atlas', 'running');
const stopped = pc('c2', 'cedar', 'stopped');
const ctx: InfoCtx = { computers: [live, stopped], failed: false, cat: catalog as unknown as Catalog, domain: 'hoody.example', origin: 'https://hub.example', scheme: 'light', t };
const one: RealmCtx = { selected: '0123456789abcdef01234567', rows: null };
const tile = (computer: string, session = 1): TileRef => ({ project: 'p1', computer, program: 'terminal', session });

describe('infoFor', () => {
  it('a live tile gets its frame address (Board options) and a share address without them, never a token', () => {
    const i = infoFor('s', tile('c1'), ctx, one);
    expect(i.state).toBe('live');
    expect(i.title).toBe('terminal-1 on atlas');
    expect(i.url).toContain('parent_keys=true');
    expect(i.shareUrl).not.toContain('parent_');
    expect(`${i.url} ${i.shareUrl}`).not.toMatch(/token/i);
  });
  it('a stopped computer, a computer outside the list and a failed read build no address', () => {
    expect(infoFor('s', tile('c2'), ctx, one)).toMatchObject({ url: null, shareUrl: null });
    expect(infoFor('s', tile('c9'), ctx, one)).toMatchObject({ state: 'gone', url: null, shareUrl: null });
    expect(infoFor('s', tile('c1'), { ...ctx, computers: null, failed: true }, one)).toMatchObject({ state: 'unknown', url: null });
  });
  it('the same session three times: the first keeps its plain label and title, the later ones get (2) and (3)', () => {
    let b: Board = freshRealm(() => 0.5).boards[0] as Board;
    for (const x of [tile('c1'), tile('c1'), tile('c1'), tile('c2')]) { const r = addTile(b, x, Math.random); if (!isRefusal(r)) b = r.board; }
    const infos = boardInfo(b, ctx, one);
    expect(infos.map((i) => i.title)).toEqual(['terminal-1 on atlas', 'terminal-1 on atlas (2)', 'terminal-1 on atlas (3)', 'terminal-1 on cedar']);
    expect(infos.map((i) => i.label)).toEqual(['terminal-1 · atlas', 'terminal-1 · atlas (2)', 'terminal-1 · atlas (3)', 'terminal-1 · cedar']);
  });
});

describe('Board defaults: a terminal follows the Hub\'s light or dark look and hides its toolbar unless the tile says otherwise', () => {
  const q = (url: string | null) => new URL(url ?? 'about:blank').searchParams;
  const theme = (url: string | null) => JSON.parse(q(url).get('theme') ?? 'null') as unknown;
  it('light Hub: the Hoody light palette and no toolbar; dark Hub: the Hoody dark palette', () => {
    const l = infoFor('s', tile('c1'), ctx, one);
    expect(theme(l.url)).toEqual(TERM_THEMES.hoodyLight);
    expect(q(l.url).get('hide-toolbar')).toBe('true');
    const d = infoFor('s', tile('c1'), { ...ctx, scheme: 'dark' }, one);
    expect(theme(d.url)).toEqual(TERM_THEMES.hoodyDark);
  });
  it('a theme or toolbar choice kept on the tile wins over the Board default', () => {
    const kept: TileRef = { ...tile('c1'), params: { theme: TERM_THEMES.nord as unknown as Record<string, string>, 'hide-toolbar': false } };
    const i = infoFor('s', kept, { ...ctx, scheme: 'dark' }, one);
    expect(theme(i.url)).toEqual(TERM_THEMES.nord);
    expect(q(i.url).get('hide-toolbar')).toBe('false');
  });
  it('the share address carries no Board default, and other programs get none', () => {
    const i = infoFor('s', tile('c1'), ctx, one);
    expect(q(i.shareUrl).get('theme')).toBeNull();
    expect(q(i.shareUrl).get('hide-toolbar')).toBeNull();
    const f = infoFor('s', { ...tile('c1'), program: 'files' }, ctx, one);
    expect(q(f.url).get('theme')).toBeNull();
    expect(q(f.url).get('hide-toolbar')).toBeNull();
  });
  it('an agent tile follows the Hub look too (its toolbar is the program\'s own business)', () => {
    const a = infoFor('s', { ...tile('c1'), program: 'agent' }, { ...ctx, scheme: 'dark' }, one);
    expect(theme(a.url)).toEqual(TERM_THEMES.hoodyDark);
    expect(q(a.url).get('hide-toolbar')).toBeNull();
  });
});

describe('terminalTools: the terminal\'s own Screenshot and Raw output, reached from the tile', () => {
  it('a live terminal gets its kit\'s screenshot (not saved on the computer) and raw output addresses on its own origin', () => {
    const i = infoFor('s', tile('c1', 3), ctx, one);
    const origin = new URL(i.url as string).origin;
    expect(terminalTools(i)).toEqual({
      screenshot: `${origin}/api/v1/terminal/screenshot?terminal_id=3&format=png&save=false`,
      rawPage: `${origin}/api/v1/terminal/raw?terminal_id=3&format=html`,
      rawDownload: `${origin}/api/v1/terminal/raw?terminal_id=3&format=download`,
    });
  });
  it('an SSH tile frames its session but offers no Change shell and no share address (that number may start a plain shell)', () => {
    const plain = infoFor('s', tile('c1', 3), ctx, one);
    const ssh = infoFor('s', { ...tile('c1', 3), ssh: { host: 'db.example.com', user: 'ops', port: 22 } }, ctx, one);
    expect(shellTarget(plain)).toMatchObject({ session: 3 });
    expect(plain.shareUrl).not.toBeNull();
    expect(ssh.url).not.toBeNull();
    expect(shellTarget(ssh)).toBeNull();
    expect(ssh.shareUrl).toBeNull();
  });
  it('a terminal an app launch placed (8001-9999) offers no Change shell, Restart terminal or Shell row: the terminal list never shows it', () => {
    for (const n of [8001, 8003, 9999]) {
      const launched = infoFor('s', tile('c1', n), ctx, one);
      expect(shellShown(launched)).toBeNull();
      expect(shellTarget(launched)).toBeNull();
      expect(terminalTools(launched)).not.toBeNull();
    }
    expect(shellTarget(infoFor('s', tile('c1', 8000), ctx, one))).toMatchObject({ session: 8000 });
  });
  it('a stopped terminal, an agent and other programs get none', () => {
    expect(terminalTools(infoFor('s', tile('c2'), ctx, one))).toBeNull();
    expect(terminalTools(infoFor('s', { ...tile('c1'), program: 'agent' }, ctx, one))).toBeNull();
    expect(terminalTools(infoFor('s', { ...tile('c1'), program: 'files' }, ctx, one))).toBeNull();
  });
});
