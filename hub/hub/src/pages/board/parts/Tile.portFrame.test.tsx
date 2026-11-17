// Vitest: a port or script tile frames a page, not a Hoody program, so it gets
// the narrow allow list (fullscreen and autoplay: no clipboard, no microphone) and is never registered for parent keys, as a web
// address tile; a program tile keeps the program allow list and its registration.
import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRef } from 'react';
import type { RealmRow } from '@core';
import { setProxyDomain } from '@core/hosts';
import type { Catalog } from '../embed/catalog';
import catalog from '../embed/catalog.ui.json';
import { computerOf } from '../computers';
import type { Tile as TileValue } from '../model/boards';
import strings from '../strings.en.json';
import { FRAME_ALLOW, FRAME_ALLOW_FOREIGN, type FrameHandle } from './Frame';
import { Tile, type TileProps } from './Tile';
import { infoFor, type InfoCtx, type RealmCtx } from './tileInfo';

const S = strings as Record<string, string>;
const t = (k: string, v: Record<string, unknown> = {}) => (S[k] ?? k).replace(/\{\{(\w+)\}\}/g, (_, x: string) => String(v[x]));
const R1 = 'f1f1f1f1f1f1f1f1f1f1f1f1';
const rows: RealmRow[] = [{ id: R1, name: { kind: 'alias', text: 'Acme' }, tint: 'teal', computers: null }];
const comp = computerOf({ id: 'c1', name: 'atlas', status: 'running', project_id: 'p1', server_name: 'n12', realm_ids: [R1], color: '#3B82F6' })!;
const ctx: InfoCtx = { computers: [comp], failed: false, cat: catalog as unknown as Catalog, domain: 'hoody.example', origin: 'https://hub.example', scheme: 'light', t };
const realm: RealmCtx = { selected: R1, rows };

function frameOf(tile: TileValue, onRegister = vi.fn()): { f: HTMLIFrameElement; onRegister: ReturnType<typeof vi.fn> } {
  const info = infoFor('s1', tile, ctx, realm);
  const p: TileProps = {
    info, domId: 'tile-s1', active: true, maximised: false, hidden: false, narrow: false, inside: false, reloadKey: 0, frameState: 'loaded',
    frameRef: createRef<FrameHandle>(), keys: true, menu: [], menuOpen: false, onMenuOpen: () => undefined, onActivate: () => undefined,
    onReload: () => undefined, onFrameState: () => undefined, onRegister, onBack: () => undefined, onRetry: () => undefined,
    cardActions: null, onOpenComputers: null, heldFrom: null, onOpenBilling: null, power: null,
  };
  const { container } = render(<Tile {...p} />);
  const f = container.querySelector('iframe');
  if (!f) throw new Error('no frame for ' + JSON.stringify(tile));
  return { f, onRegister };
}
/** The registrations that name an origin parent keys are accepted from (a foreign frame and a withdrawal hand ''). */
const registered = (fn: ReturnType<typeof vi.fn>) => fn.mock.calls.filter((c) => c[1] !== '');

describe('the exact allow string of each tile kind', () => {
  beforeEach(() => { setProxyDomain('hoody.example'); });
  afterEach(() => { setProxyDomain(null); });
  const NARROW = 'fullscreen; autoplay';
  const PROGRAM = 'clipboard-read; clipboard-write; fullscreen; microphone; autoplay';
  it.each<[string, TileValue, string]>([
    ['an HTTP port', { project: 'p1', computer: 'c1', protocol: 'http', port: 3000 }, NARROW],
    ['an exec script', { project: 'p1', computer: 'c1', protocol: 'exec', port: 1, path: '/sys/report' }, NARROW],
    ['a web address', { url: 'https://docs.hoody.example/' }, NARROW],
    ['a terminal', { project: 'p1', computer: 'c1', program: 'terminal', session: 1 }, PROGRAM],
    ['a files program', { project: 'p1', computer: 'c1', program: 'files', session: 1 }, PROGRAM],
  ])('%s', (_, tile, allow) => {
    expect(frameOf(tile).f.getAttribute('allow')).toBe(allow);
  });
  it('the constants say the same', () => {
    expect(FRAME_ALLOW_FOREIGN).toBe(NARROW);
    expect(FRAME_ALLOW).toBe(PROGRAM);
  });
});

describe('frame permissions by what a tile frames', () => {
  beforeEach(() => { setProxyDomain('hoody.example'); });
  afterEach(() => { setProxyDomain(null); });
  it.each<[string, TileValue]>([
    ['an HTTP port', { project: 'p1', computer: 'c1', protocol: 'http', port: 3000 }],
    ['an HTTP port on a page', { project: 'p1', computer: 'c1', protocol: 'http', port: 3000, path: '/app' }],
    ['an exec script', { project: 'p1', computer: 'c1', protocol: 'exec', port: 1, path: '/sys/report' }],
  ])('%s gets the narrow allow list and no parent keys', (_, tile) => {
    const { f, onRegister } = frameOf(tile);
    expect(f.getAttribute('allow')).toBe(FRAME_ALLOW_FOREIGN);
    expect(f.getAttribute('allow')).not.toMatch(/clipboard|microphone/);
    expect(registered(onRegister)).toEqual([]);
  });
  it('a port tile on a page frames that page', () => {
    const { f } = frameOf({ project: 'p1', computer: 'c1', protocol: 'http', port: 3000, path: '/app' });
    expect(f.getAttribute('src')).toMatch(/-http-3000\.n12\.hoody\.example\/app$/);
  });
  it('a program tile keeps the program allow list and is registered', () => {
    const { f, onRegister } = frameOf({ project: 'p1', computer: 'c1', program: 'terminal', session: 1 });
    expect(f.getAttribute('allow')).toBe(FRAME_ALLOW);
    expect(registered(onRegister).length).toBeGreaterThan(0);
  });
});
