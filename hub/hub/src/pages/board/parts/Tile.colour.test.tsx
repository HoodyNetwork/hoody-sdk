// Which computer on a tile header: the stripe and a square mark before the
// computer name are the computer's colour (a raw row value never reaches a style); in All realms a realm chip shows a
// middle-cut name and opens a popover with the full name by click, Enter and tap. The header and the tile act only on
// pointer presses inside their own DOM: a press in the popover (a portal) never reaches the drag or body handlers.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRef } from 'react';
import type { RealmRow } from '@core';
import type { Catalog } from '../embed/catalog';
import catalog from '../embed/catalog.ui.json';
import { computerOf } from '../computers';
import strings from '../strings.en.json';
import type { FrameHandle } from './Frame';
import { Tile, type TileProps } from './Tile';
import { infoFor, type InfoCtx, type RealmCtx, type TileInfo } from './tileInfo';

let coarse = false;
vi.mock('@kit', async (orig) => {
  const kit = await orig<Record<string, unknown> & { useMedia: (q: string) => boolean }>();
  return { ...kit, useMedia: (q: string) => (q === '(pointer: coarse)' ? coarse : kit.useMedia(q)) };
});
beforeEach(() => { coarse = false; });

const S = strings as Record<string, string>;
const t = (k: string, v: Record<string, unknown> = {}) => (S[k] ?? k).replace(/\{\{(\w+)\}\}/g, (_, x: string) => String(v[x]));
const R1 = 'f1f1f1f1f1f1f1f1f1f1f1f1', R2 = 'f2f2f2f2f2f2f2f2f2f2f2f2';
const rows: RealmRow[] = [
  { id: R1, name: { kind: 'alias', text: 'Acme Production' }, tint: 'teal', computers: null },
  { id: R2, name: { kind: 'alias', text: 'Acme Product QA' }, tint: 'orange', computers: null },
];
// Stopped: the tile shows its card (no frame), the header is the same.
const raw = (id: string, name: string, color: unknown, realm: string) => ({ id, name, status: 'stopped', project_id: 'p1', server_name: 'n12', realm_ids: [realm], color });
const comps = [computerOf(raw('c1', 'atlas', '#3B82F6', R1))!, computerOf(raw('c2', 'borealis', '#F59E0B', R2))!, computerOf(raw('c3', 'cedar', 'red;x:url()', R1))!];
const ctx: InfoCtx = { computers: comps, failed: false, cat: catalog as unknown as Catalog, domain: 'hoody.example', origin: 'https://hub.example', scheme: 'light', t };
const info = (c: string, realm: RealmCtx): TileInfo => infoFor('s-' + c, { project: 'p1', computer: c, program: 'terminal', session: 1 }, ctx, realm);
const one: RealmCtx = { selected: R1, rows }, all: RealmCtx = { selected: 'all', rows };

function props(i: TileInfo, over: Partial<TileProps> = {}): TileProps {
  return {
    info: i, domId: 'tile-' + i.slot, active: true, maximised: false, hidden: false, narrow: false, inside: false, reloadKey: 0, frameState: 'loading',
    frameRef: createRef<FrameHandle>(), keys: true, menu: [], menuOpen: false, onMenuOpen: () => undefined, onActivate: () => undefined,
    onReload: () => undefined, onFrameState: () => undefined, onRegister: () => undefined, onBack: () => undefined, onRetry: () => undefined,
    cardActions: null, onOpenComputers: null, heldFrom: null, onOpenBilling: null, power: null, ...over,
  };
}
const stripe = (g: HTMLElement) => g.querySelector<HTMLElement>('[class*="stripe"]');

describe('tile header: which computer', () => {
  it('stripe and mark carry each computer’s own colour; the mark sits before the computer name', () => {
    render(<><Tile {...props(info('c1', one))} /><Tile {...props(info('c2', one))} /></>);
    const a = screen.getByRole('group', { name: 'terminal-1 · atlas' }), b = screen.getByRole('group', { name: 'terminal-1 · borealis' });
    expect(stripe(a)?.style.getPropertyValue('--board-computer')).toBe('#3B82F6');
    expect(stripe(b)?.style.getPropertyValue('--board-computer')).toBe('#F59E0B');
    const mark = a.querySelector<HTMLElement>('[data-computer-color]');
    expect(mark?.style.getPropertyValue('--computer')).toBe('#3B82F6');
    expect(mark?.nextElementSibling?.textContent).toBe('atlas');
    expect(b.querySelector('[data-computer-color]')?.getAttribute('data-computer-color')).toBe('#F59E0B');
    // One realm: no realm chip.
    expect(within(a).queryByRole('button', { name: /Acme/ })).toBeNull();
  });

  it('a row colour that is not a hex colour reaches no style: grey stripe, no mark', () => {
    render(<Tile {...props(info('c3', one))} />);
    const g = screen.getByRole('group', { name: 'terminal-1 · cedar' });
    expect(stripe(g)?.getAttribute('style') ?? '').not.toMatch(/url|red|--board-computer/);
    expect(g.querySelector('[data-computer-color]')).toBeNull();
    expect(g.innerHTML).not.toContain('url(');
  });

  it('even an info whose colour was never normalised draws nothing raw (the stripe normalises again)', () => {
    render(<Tile {...props({ ...info('c1', one), color: 'red;x:url()' })} />);
    const g = screen.getByRole('group', { name: 'terminal-1 · atlas' });
    expect(stripe(g)?.getAttribute('style')).toBeNull();
    expect(g.querySelector('[data-computer-color]')).toBeNull();
  });

  it('All realms: two realms sharing a start show different cut names; the group names carry the full ones', () => {
    render(<><Tile {...props(info('c1', all))} /><Tile {...props(info('c2', all))} /></>);
    const a = screen.getByRole('group', { name: 'terminal-1 · atlas, realm Acme Production' });
    const b = screen.getByRole('group', { name: 'terminal-1 · borealis, realm Acme Product QA' });
    expect(within(a).getByRole('button', { name: 'Acme Pr…ction' })).toBeVisible();
    expect(within(b).getByRole('button', { name: 'Acme Pr…ct QA' })).toBeVisible();
  });

  it('the chip opens its popover with the full name by click, by Enter, and by tap', async () => {
    const user = userEvent.setup();
    render(<><Tile {...props(info('c1', all))} /><Tile {...props(info('c2', all))} /></>);
    await user.click(screen.getByRole('button', { name: 'Acme Pr…ction' }));
    let dlg = await screen.findByRole('dialog', { name: 'Realm' });
    expect(within(dlg).getByText('Acme Production')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    screen.getByRole('button', { name: 'Acme Pr…ct QA' }).focus();
    await user.keyboard('{Enter}');
    dlg = await screen.findByRole('dialog', { name: 'Realm' });
    expect(within(dlg).getByText('Acme Product QA')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    coarse = true;
    await user.pointer([{ keys: '[TouchA>]', target: screen.getByRole('button', { name: 'Acme Pr…ction' }) }, { keys: '[/TouchA]' }]);
    dlg = await screen.findByRole('dialog', { name: 'Realm' });
    expect(within(dlg).getByText('Acme Production')).toBeInTheDocument();
  });

  it('the chip is in the tab order only while the tile is active, like the header’s other buttons', () => {
    render(<Tile {...props(info('c1', all), { active: false })} />);
    expect(screen.getByRole('button', { name: 'Acme Pr…ction' })).toHaveAttribute('tabindex', '-1');
  });

  it('a press inside the open popover reaches neither the header’s drag nor the tile body; a press on the header still does', async () => {
    const user = userEvent.setup();
    const onHead = vi.fn(), onBody = vi.fn();
    render(<Tile {...props(info('c1', all), { onHeadPointerDown: onHead, onBodyPointerDown: onBody })} />);
    await user.click(screen.getByRole('button', { name: 'Acme Pr…ction' }));
    onHead.mockClear(); onBody.mockClear();
    const text = within(await screen.findByRole('dialog', { name: 'Realm' })).getByText('Acme Production');
    fireEvent.pointerDown(text, { button: 0, clientX: 5, clientY: 5 });
    expect(onHead).not.toHaveBeenCalled();
    expect(onBody).not.toHaveBeenCalled();
    // Closed again, a press on the header's own text still reaches the drag handler.
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.pointerDown(screen.getByText('terminal-1'), { button: 0 });
    expect(onHead).toHaveBeenCalledTimes(1);
    expect(onBody).not.toHaveBeenCalled();
  });
});

// The stripe's own rules (jsdom computes no CSS; colour.spec.ts measures them drawn).
describe('tile stripe stylesheet', () => {
  it('4 px of the computer colour with a ring line; only the stripe leaf is exempt from forced colours', () => {
    const css = readFileSync(join(import.meta.dirname, 'board.module.css'), 'utf8');
    const stripeRule = /\n\.stripe\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(stripeRule).toMatch(/background:\s*var\(--board-computer, var\(--hx-line-strong\)\)/);
    expect(stripeRule).toMatch(/border-inline-end:\s*var\(--bw\) solid var\(--hx-swatch-ring\)/);
    expect(stripeRule).toMatch(/width:\s*calc\(var\(--sp-1\) \+ var\(--bw\)\)/);
    expect(css).not.toMatch(/--board-realm/);
    const forced = [...css.matchAll(/@media \(forced-colors: active\)\s*\{([\s\S]*?)\n\}/g)].map((m) => m[1]).join('\n');
    expect(forced).toMatch(/\.stripe\s*\{[^}]*forced-color-adjust:\s*none/);
    // forced-color-adjust inherits: never on the header, a label or the chip.
    expect(css.match(/forced-color-adjust/g)).toHaveLength(1);
  });
});
