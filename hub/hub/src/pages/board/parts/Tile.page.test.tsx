// A frame that shows a document (a web address, an HTTP port, an exec script) gets the browser
// tab ground (Frame `page`, board.module.css .framePage: light color-scheme over Canvas), so a JSON or text answer that
// sets no colours reads black on white in every theme. A Hoody program's frame keeps the dark program ground.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRef } from 'react';
import type { RealmRow } from '@core';
import { setProxyDomain } from '@core/hosts';
import type { Catalog } from '../embed/catalog';
import catalog from '../embed/catalog.ui.json';
import { computerOf } from '../computers';
import type { Tile as TileValue } from '../model/boards';
import strings from '../strings.en.json';
import type { FrameHandle } from './Frame';
import { Tile, type TileProps } from './Tile';
import { infoFor, type InfoCtx, type RealmCtx } from './tileInfo';

const S = strings as Record<string, string>;
const t = (k: string, v: Record<string, unknown> = {}) => (S[k] ?? k).replace(/\{\{(\w+)\}\}/g, (_, x: string) => String(v[x]));
const R1 = 'f1f1f1f1f1f1f1f1f1f1f1f1';
const rows: RealmRow[] = [{ id: R1, name: { kind: 'alias', text: 'Acme' }, tint: 'teal', computers: null }];
const comp = computerOf({ id: 'c1', name: 'atlas', status: 'running', project_id: 'p1', server_name: 'n12', realm_ids: [R1], color: '#3B82F6' })!;
const ctx: InfoCtx = { computers: [comp], failed: false, cat: catalog as unknown as Catalog, domain: 'hoody.example', origin: 'https://hub.example', scheme: 'light', t };
const realm: RealmCtx = { selected: R1, rows };

function frameOf(tile: TileValue): HTMLIFrameElement {
  const info = infoFor('s1', tile, ctx, realm);
  const p: TileProps = {
    info, domId: 'tile-s1', active: true, maximised: false, hidden: false, narrow: false, inside: false, reloadKey: 0, frameState: 'loaded',
    frameRef: createRef<FrameHandle>(), keys: true, menu: [], menuOpen: false, onMenuOpen: () => undefined, onActivate: () => undefined,
    onReload: () => undefined, onFrameState: () => undefined, onRegister: () => undefined, onBack: () => undefined, onRetry: () => undefined,
    cardActions: null, onOpenComputers: null, heldFrom: null, onOpenBilling: null, power: null,
  };
  const { container } = render(<Tile {...p} />);
  const f = container.querySelector('iframe');
  if (!f) throw new Error('no frame for ' + JSON.stringify(tile));
  return f;
}
const isPage = (f: HTMLIFrameElement) => /framePage/.test(f.className);

describe('frame ground: documents get a browser tab ground, programs the program ground', () => {
  beforeEach(() => { setProxyDomain('hoody.example'); });
  afterEach(() => { setProxyDomain(null); });
  it.each<[string, TileValue]>([
    ['an exec script', { project: 'p1', computer: 'c1', protocol: 'exec', port: 1, path: '/sys/btrfsreport' }],
    ['an HTTP port', { project: 'p1', computer: 'c1', protocol: 'http', port: 3000 }],
    // A web address the Hub frames: under the computer proxy domain (an outside site draws a card instead).
    ['a web address', { url: 'https://docs.hoody.example/' }],
  ])('%s frame shows on the page ground', (_, tile) => {
    const f = frameOf(tile);
    expect(isPage(f)).toBe(true);
    expect(f.className).toMatch(/frame/);
  });

  it('a terminal frame keeps the program ground', () => {
    const f = frameOf({ project: 'p1', computer: 'c1', program: 'terminal', session: 1 });
    expect(isPage(f)).toBe(false);
    expect(f.className).toMatch(/frame/);
  });

  it('the header gives way with the key hint first: the tile title is cut only once the hint is gone', () => {
    const css = readFileSync(join(__dirname, 'board.module.css'), 'utf8');
    const shrink = (cls: string): number => {
      const rule = new RegExp(`\\.${cls}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? '';
      const m = /flex:\s*\d+\s+(\d+)/.exec(rule) ?? /flex-shrink:\s*(\d+)/.exec(rule);
      return Number(m?.[1] ?? 1);
    };
    expect(shrink('hint')).toBeGreaterThanOrEqual(100 * shrink('label'));
  });

  it('a program frame never shows an opaque browser canvas over the program ground in a dark Hub', () => {
    // A frame document with no colour scheme of its own (a page still loading, an error page) is painted on an opaque
    // Canvas when the frame element's scheme differs from it: white over the dark ground in a dark Hub. The program
    // frame takes the documents' default scheme, so until the program paints, the tile shows the program ground.
    const css = readFileSync(join(__dirname, 'board.module.css'), 'utf8');
    const rule = /\.frame\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(rule).toMatch(/color-scheme:\s*normal/);
  });

  it('the page ground is light over the system Canvas, never the program ground', () => {
    const css = readFileSync(join(__dirname, 'board.module.css'), 'utf8');
    const rule = /\.framePage\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(rule).toMatch(/color-scheme:\s*light/);
    expect(rule).toMatch(/background:\s*Canvas/);
    expect(rule).not.toMatch(/--hx-app/);
    // it comes after .frame, so it wins at equal specificity
    expect(css.indexOf('.framePage')).toBeGreaterThan(css.indexOf('.frame {'));
  });
});
