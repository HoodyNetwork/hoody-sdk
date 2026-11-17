// Program options: every catalogue option is placed once (no gap), refused and Board-owned ones never appear, kept
// values pass the catalogue checks, and tile URLs carry the Board's own options but no credential.
import { describe, expect, it } from 'vitest';
import { buildEmbedUrl, checkOption } from './build';
import { FIRST_CLASS, startView, TILE_PROGRAMS, type Catalog } from './catalog';
import catalog from './catalog.ui.json';
import { BOARD_OWNED, BOARD_REFUSED, cleanParams, programOptions, tileUrl } from './options';
import { PLACEMENT, placedIds } from './placement';
import { parseProgramTile } from '../model/persist';

const CAT = catalog as unknown as Catalog;
const T = { id: 'c0ffee', project_id: 'p1a2b3', server_name: 'sg-sin-1' };
const D = { computersDomain: 'computers.hoody.com', origin: 'https://api.hoody.com' };

describe('every option of every tile program is placed', () => {
  it.each(TILE_PROGRAMS.map((p) => [p]))('%s: the placement names exactly the catalogue options, once each', (p) => {
    const placed = placedIds(PLACEMENT[p]).map(([id]) => id);
    expect(new Set(placed).size).toBe(placed.length);
    expect([...placed].sort()).toEqual(programOptions(CAT, p).map((o) => o.id).sort());
  });
  it.each(TILE_PROGRAMS.map((p) => [p]))('%s: no refused or Board-owned name is placed', (p) => {
    const refused = Object.keys(CAT.kits[p]?.refused ?? {});
    for (const [id] of placedIds(PLACEMENT[p])) {
      expect(refused).not.toContain(id);
      expect(BOARD_OWNED).not.toContain(id);
      expect(Object.keys(BOARD_REFUSED[p] ?? {})).not.toContain(id);
    }
  });
  it('every Board-refused option is still a user option of its program in the catalogue (else drop it from BOARD_REFUSED)', () => {
    for (const [p, ids] of Object.entries(BOARD_REFUSED) as Array<[(typeof TILE_PROGRAMS)[number], Record<string, string>]>) {
      const offered = new Set((CAT.kits[p]?.views ?? []).flatMap((v) => Object.keys(CAT.views[v]?.params ?? {})));
      const refused = CAT.kits[p]?.refused ?? {};
      for (const id of Object.keys(ids)) {
        expect(offered.has(id), `${p} ${id}`).toBe(true);
        expect(Object.prototype.hasOwnProperty.call(refused, id), `${p} ${id}`).toBe(false);
      }
    }
  });
  it('the first-class programs are the five of the spec', () => {
    expect([...FIRST_CLASS]).toEqual(['agent', 'terminal', 'display', 'files', 'browser']);
  });
  // display: 47 user options in the catalogue, 9 of them Board-refused.
  it('the option counts are the spec\'s (agent 31, terminal 34, display 38)', () => {
    expect(programOptions(CAT, 'agent')).toHaveLength(31);
    expect(programOptions(CAT, 'terminal')).toHaveLength(34);
    expect(programOptions(CAT, 'display')).toHaveLength(38);
    expect(Object.keys(BOARD_REFUSED.display ?? {})).toHaveLength(9);
  });
});

describe('Board-refused display options never reach a tile URL', () => {
  const refused = Object.keys(BOARD_REFUSED.display ?? {});
  const all = { record: true, record_codec: 'vp9', record_format: 'webm', record_fps: 10, reconnect_count: 3, slow_retry_delay: 5000, slow_retry_max_ms: 60000, soft_giveup_attempts: 2, soft_giveup_ms: 5000 };
  it('the fixture names all nine', () => expect(Object.keys(all).sort()).toEqual([...refused].sort()));
  it.each([['live', false], ['share', true]] as const)('%s URL: stored values and Board defaults both left out', (_n, share) => {
    const r = tileUrl(CAT, { program: 'display', session: 1, params: { ...all, toolbar: false } }, T, { ...D, share, defaults: all });
    expect('url' in r).toBe(true);
    const q = new URL((r as { url: string }).url).searchParams;
    for (const id of refused) expect(q.has(id), id).toBe(false);
    expect(q.get('toolbar')).toBe('false');
  });
});

describe('a stored display tile from before the current catalogue (load path)', () => {
  it('loads without the refused and Board-refused options and keeps the rest; nothing of them reaches its URL', () => {
    const t = parseProgramTile({ project: 'p1a2b3', computer: 'c0ffee', program: 'display', session: 1, params: {
      override_width: '1280', override_height: '720', web_notifications: true, notification_connection_type: 'polling', record: true, soft_giveup_ms: 5000, toolbar: false,
    } });
    expect(t && 'params' in t ? t.params : null).toEqual({ override_width: '1280', toolbar: false });
  });
});

describe('kept options (cleanParams)', () => {
  it('drops display options the catalogue now refuses and the ones the Board refuses, keeping the rest', () => {
    expect(cleanParams(CAT, 'display', undefined, {
      override_width: '1280', override_height: '720', web_notifications: true, notification_connection_type: 'polling',
      record: true, record_format: 'gif', reconnect_count: 5, soft_giveup_ms: 5000, slow_retry_delay: 3000,
      colorScheme: 'dark', quality_mode: 'best', scroll_speed: 1.5, clipboard_poll: false,
    })).toEqual({ override_width: '1280', colorScheme: 'dark', quality_mode: 'best', scroll_speed: 1.5, clipboard_poll: false });
  });
  it('clipboard_poll can only be turned off: the catalogue has no true, so the drawer offers Default and Off, never On', () => {
    expect(cleanParams(CAT, 'display', undefined, { clipboard_poll: true })).toEqual({});
  });
  it('keeps valid options of the view and drops the rest, never fixing a value', () => {
    expect(cleanParams(CAT, 'terminal', undefined, {
      fontSize: 14, cursorStyle: 'bar', theme: { background: 'black' },
      fontSize2: 1, shell: '/bin/sh', parent_keys: false, scrollback: 100001, rendererType: 'gpu', readonly: 'true',
    })).toEqual({ fontSize: 14, cursorStyle: 'bar', theme: { background: 'black' } });
  });
  it('drops options of another view of the kit and refused names', () => {
    expect(cleanParams(CAT, 'files', 'editor', { sort: 'name', theme: 'nord', path: '/etc/hosts', view: 'x', embedderOrigin: 'https://x.test' }))
      .toEqual({ theme: 'nord', path: '/etc/hosts' });
  });
  it('drops values over the size bound and non-objects', () => {
    expect(cleanParams(CAT, 'terminal', undefined, { title: 'x'.repeat(201) })).toEqual({});
    expect(cleanParams(CAT, 'terminal', undefined, { cwd: '/' + 'a'.repeat(3000) })).toEqual({});
    expect(cleanParams(CAT, 'terminal', undefined, null)).toEqual({});
    expect(cleanParams(CAT, 'terminal', undefined, ['fontSize'])).toEqual({});
  });
  it('an unknown view reads as the start view: Root keeps the listing options, not a folder path', () => {
    expect(cleanParams(CAT, 'files', 'nope', { sort: 'size', path: '/srv' })).toEqual({ sort: 'size' });
  });
  it('checkOption refuses by type, enum, bounds, pattern and format', () => {
    const p = CAT.views['terminal.session']!.params;
    expect(checkOption(p.fontSize!, 'fontSize', 7)).toBe('VALUE_INVALID');
    expect(checkOption(p.fontSize!, 'fontSize', 72)).toBeNull();
    expect(checkOption(p.cursorStyle!, 'cursorStyle', 'beam')).toBe('VALUE_INVALID');
    expect(checkOption(p.panel!, 'panel', 'ftp://x')).toBe('VALUE_INVALID');
    expect(checkOption(p.panel!, 'panel', 'https://ok.test/')).toBeNull();
    expect(checkOption(CAT.views['files.folder']!.params.path!, 'path', 'rel')).toBe('PATH_INVALID');
  });
});

describe('tile URLs', () => {
  it('a terminal tile carries the parent keys and this page\'s origin, then the kept options', () => {
    expect(tileUrl(CAT, { program: 'terminal', session: 2, params: { fontSize: 14 } }, T, D))
      .toEqual({ url: 'https://p1a2b3-c0ffee-terminal-2.sg-sin-1.computers.hoody.com/?fontSize=14&parent_keys=true&parent_origin=https%3A%2F%2Fapi.hoody.com' });
  });
  it('the share link (Copy link) leaves the Board\'s own options out', () => {
    expect(tileUrl(CAT, { program: 'terminal', session: 2, params: { fontSize: 14 } }, T, { ...D, share: true }))
      .toEqual({ url: 'https://p1a2b3-c0ffee-terminal-2.sg-sin-1.computers.hoody.com/?fontSize=14' });
  });
  it('display passthrough options go in the query, after the typed ones', () => {
    const r = tileUrl(CAT, { program: 'display', session: 1, params: { encoding: 'webp', toolbar: false } }, T, { ...D, share: true });
    expect(r).toEqual({ url: 'https://p1a2b3-c0ffee-display-1.sg-sin-1.computers.hoody.com/?toolbar=false&encoding=webp' });
  });
  it('a files tile names its folder and tells files the embedder', () => {
    expect(tileUrl(CAT, { program: 'files', session: 1, view: 'folder', params: { path: '/home/user/a b' } }, T, D))
      .toEqual({ url: 'https://p1a2b3-c0ffee-files-1.sg-sin-1.computers.hoody.com/home/user/a%20b?embedderOrigin=https%3A%2F%2Fapi.hoody.com' });
  });
  it('a files folder tile without a path is refused, never guessed', () => {
    expect(tileUrl(CAT, { program: 'files', session: 1, view: 'folder' }, T, D)).toEqual({ refused: 'REQUIRED_MISSING', field: 'path' });
  });
  it('every offered program\'s start view builds a URL with no option set; files and code start at their root', () => {
    for (const p of TILE_PROGRAMS) {
      const view = startView(CAT, p);
      if (view === undefined) continue;
      expect(tileUrl(CAT, { program: p, session: 1, view }, T, D)).toHaveProperty('url');
    }
    expect(TILE_PROGRAMS.filter((p) => startView(CAT, p) !== undefined)).toEqual([...TILE_PROGRAMS]);
    expect([startView(CAT, 'files'), startView(CAT, 'code'), startView(CAT, 'terminal')]).toEqual(['root', 'root', 'session']);
  });
  it('a tile with no view (a Recent pick) reads as the start view, so every program builds a URL', () => {
    for (const p of TILE_PROGRAMS) expect(tileUrl(CAT, { program: p, session: 1 }, T, D)).toHaveProperty('url');
    expect(tileUrl(CAT, { program: 'files', session: 1 }, T, D)).toEqual(tileUrl(CAT, { program: 'files', session: 1, view: 'root' }, T, D));
    expect(tileUrl(CAT, { program: 'code', session: 1, view: 'nonesuch' }, T, D)).toEqual(tileUrl(CAT, { program: 'code', session: 1, view: 'root' }, T, D));
  });
  it('no URL carries a token or a forbidden origin', () => {
    const r = tileUrl(CAT, { program: 'agent', session: 1, params: { hdy_token: 'secret' } as never }, T, { ...D, origin: 'javascript:alert(1)' });
    expect(r).toEqual({ url: 'https://p1a2b3-c0ffee-agent-1.sg-sin-1.computers.hoody.com/?parent_keys=true' });
  });
  it('a session outside the program\'s range is refused', () => {
    expect(tileUrl(CAT, { program: 'browser', session: 10000 }, T, D)).toEqual({ refused: 'INDEX_OUT_OF_RANGE', field: 'index' });
  });
  // Real 24-character ids: a terminal number above 9999 makes "<project>-<computer>-terminal-<N>" 64 or more characters.
  const P24 = 'fedcba9876543210fedcba98', C24 = '0123456789abcdef01234567';
  const L = { id: C24, project_id: P24, server_name: 'sg-sin-1' };
  it('a terminal whose long host label would pass 63 characters takes core\'s short t-<N> host; the rest keep the long form', () => {
    const at = (program: 'terminal' | 'display', session: number, t = L) => tileUrl(CAT, { program, session }, t, { ...D, share: true });
    expect(at('terminal', 15001)).toEqual({ url: `https://${P24}-${C24}-t-15001.sg-sin-1.computers.hoody.com/` });
    expect(at('terminal', 65535)).toEqual({ url: `https://${P24}-${C24}-t-65535.sg-sin-1.computers.hoody.com/` });
    expect(at('terminal', 9999)).toEqual({ url: `https://${P24}-${C24}-terminal-9999.sg-sin-1.computers.hoody.com/` });
    expect(at('display', 15001)).toEqual({ url: `https://${P24}-${C24}-display-15001.sg-sin-1.computers.hoody.com/` });
    expect(at('terminal', 15001, T)).toEqual({ url: 'https://p1a2b3-c0ffee-terminal-15001.sg-sin-1.computers.hoody.com/' });
  });
  it('the live terminal tile at 15001 keeps the Board\'s own options on the short host', () => {
    expect(tileUrl(CAT, { program: 'terminal', session: 15001 }, L, D))
      .toEqual({ url: `https://${P24}-${C24}-t-15001.sg-sin-1.computers.hoody.com/?parent_keys=true&parent_origin=https%3A%2F%2Fapi.hoody.com` });
  });
  it('the SDK port itself still refuses that label (parity with the SDK builder): only the Board\'s tile URL takes the short host', () => {
    expect(buildEmbedUrl(CAT, 'terminal', L, { index: 15001 }, { computersDomain: D.computersDomain })).toEqual({ refused: 'HOST_LABEL_TOO_LONG', field: 'target' });
  });
});
