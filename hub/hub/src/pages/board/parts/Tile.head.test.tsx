// Tile header: saved options are a count on the options button (its name
// "Options for X (N changed)", a dot and the number, no separate chip); the order is name · computer, ⇕ session, the
// state dot, then options, maximise, reload, open-out, ⋯ as one group at the end; no key cap shows in the header (O, Z,
// R in tooltips and aria-keyshortcuts). Toolbar sizes are left out here.
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import type { RealmRow } from '@core';
import type { Catalog } from '../embed/catalog';
import catalog from '../embed/catalog.ui.json';
import { computerOf } from '../computers';
import strings from '../strings.en.json';
import type { FrameHandle } from './Frame';
import { Tile, type TileProps } from './Tile';
import { infoFor, type InfoCtx, type RealmCtx, type TileInfo } from './tileInfo';

const S = strings as Record<string, string>;
const t = (k: string, v: Record<string, unknown> = {}) => (S[k] ?? k).replace(/\{\{(\w+)\}\}/g, (_, x: string) => String(v[x]));
const R1 = 'f1f1f1f1f1f1f1f1f1f1f1f1';
const rows: RealmRow[] = [{ id: R1, name: { kind: 'alias', text: 'Acme' }, tint: 'teal', computers: null }];
const comps = [computerOf({ id: 'c1', name: 'atlas', status: 'stopped', project_id: 'p1', server_name: 'n12', realm_ids: [R1], color: '#3B82F6' })!];
const ctx: InfoCtx = { computers: comps, failed: false, cat: catalog as unknown as Catalog, domain: 'hoody.example', origin: 'https://hub.example', scheme: 'light', t };
const one: RealmCtx = { selected: R1, rows };
const info = (): TileInfo => infoFor('s-c1', { project: 'p1', computer: 'c1', program: 'terminal', session: 1 }, ctx, one);

function props(over: Partial<TileProps> = {}): TileProps {
  const i = info();
  return {
    info: i, domId: 'tile-' + i.slot, active: true, maximised: false, hidden: false, narrow: false, inside: false, reloadKey: 0, frameState: 'loading',
    frameRef: createRef<FrameHandle>(), keys: true, menu: [], menuOpen: false, onMenuOpen: () => undefined, onActivate: () => undefined,
    onReload: () => undefined, onFrameState: () => undefined, onRegister: () => undefined, onBack: () => undefined, onRetry: () => undefined,
    cardActions: null, onOpenComputers: null, heldFrom: null, onOpenBilling: null, power: null,
    onOptions: () => undefined, onSession: () => undefined, onMax: () => undefined, ...over,
  };
}
const tile = () => screen.getByRole('group', { name: 'terminal-1 · atlas' });
const head = () => tile().firstElementChild as HTMLElement;
const optionsName = (n: number) => t('tile.optionsChanged_other', { name: 'terminal-1', count: n });

describe('tile header: saved options are a count on the options button', () => {
  it('4 saved: one button named "Options for terminal-1 (4 changed)" showing 4; no separate chip; it opens the options', () => {
    const onOptions = vi.fn();
    render(<Tile {...props({ changed: 4, onOptions })} />);
    const b = within(tile()).getByRole('button', { name: optionsName(4) });
    // The count follows the options icon on the button: a dot (hidden from assistive tech) and the number.
    expect(b.textContent).toBe('4');
    expect(b.querySelector('span[aria-hidden="true"]:empty')).not.toBeNull();
    expect(within(tile()).queryAllByRole('button', { name: /changed/ })).toEqual([b]);
    expect(within(tile()).queryByRole('button', { name: t('tile.optionsFor', { name: 'terminal-1' }) })).toBeNull();
    fireEvent.click(b);
    expect(onOptions).toHaveBeenCalledTimes(1);
  });

  it('the count button\'s tooltip is its name, with O while the Board\'s keys are on (no key cap in the button)', async () => {
    const r = render(<Tile {...props({ changed: 3 })} />);
    const b = within(tile()).getByRole('button', { name: optionsName(3) });
    while (document.activeElement !== b) await userEvent.tab();
    const tip = await screen.findByRole('tooltip');
    expect(tip.firstChild?.textContent).toBe(optionsName(3));
    expect(tip.querySelector('kbd')?.textContent).toBe('O');
    expect(b.querySelector('kbd')).toBeNull();
    r.unmount();
    render(<Tile {...props({ changed: 3, keys: false })} />);
    const b2 = within(tile()).getByRole('button', { name: optionsName(3) });
    while (document.activeElement !== b2) await userEvent.tab();
    const tip2 = await screen.findByRole('tooltip');
    expect(tip2.textContent).toBe(optionsName(3));
  });

  it('a count coming or going swaps the plain icon button and the count button', () => {
    const r = render(<Tile {...props({ changed: 0 })} />);
    expect(within(tile()).getByRole('button', { name: t('tile.optionsFor', { name: 'terminal-1' }) }).textContent).toBe('');
    r.rerender(<Tile {...props({ changed: 2 })} />);
    expect(within(tile()).getByRole('button', { name: optionsName(2) }).textContent).toBe('2');
    r.rerender(<Tile {...props({ changed: 0 })} />);
    expect(within(tile()).queryByRole('button', { name: /changed\)$/ })).toBeNull();
  });

  it('none saved: the plain options icon button, no count', () => {
    render(<Tile {...props({ changed: 0 })} />);
    expect(within(tile()).getByRole('button', { name: t('tile.optionsFor', { name: 'terminal-1' }) })).toBeTruthy();
    expect(within(tile()).queryByRole('button', { name: /changed\)$/ })).toBeNull();
  });

  it('a tile without a session picker keeps its count (options reachable), and shows no options when nothing is saved', () => {
    const r = render(<Tile {...props({ changed: 2, onSession: undefined })} />);
    expect(within(tile()).getByRole('button', { name: optionsName(2) })).toBeTruthy();
    r.rerender(<Tile {...props({ changed: 0, onSession: undefined })} />);
    expect(within(tile()).queryByRole('button', { name: /^Options for/ })).toBeNull();
  });

  it('a narrow tile shows neither', () => {
    render(<Tile {...props({ changed: 3, narrow: true })} />);
    expect(within(tile()).queryByRole('button', { name: /^Options for/ })).toBeNull();
  });
});

describe('tile header: order, one end group, no key caps', () => {
  it('session, then the state dot, then options, maximise, reload, ⋯ (one group at the end)', () => {
    render(<Tile {...props({ changed: 1 })} />);
    const h = head();
    const order = [...h.querySelectorAll<HTMLElement>('button, [role="img"]')].map((el) => el.getAttribute('aria-label') ?? el.textContent ?? '');
    const at = (x: string | RegExp) => order.findIndex((n) => (typeof x === 'string' ? n === x : x.test(n)));
    const session = at(t('tile.sessionOf', { name: 'terminal-1' }));
    const dot = order.findIndex((_, i) => h.querySelectorAll('button, [role="img"]')[i]!.getAttribute('role') === 'img');
    const options = at(optionsName(1));
    const max = at(t('tile.maximise'));
    const reload = at(t('tile.reload'));
    const menu = at(t('tile.menu'));
    expect(session).toBeGreaterThanOrEqual(0);
    expect([session < dot, dot < options, options < max, max < reload, reload < menu]).toEqual([true, true, true, true, true]);
  });

  it('the header holds every header control, and options, maximise, reload and ⋯ share one end group', () => {
    render(<Tile {...props({ changed: 1 })} />);
    const end = within(tile()).getByRole('button', { name: t('tile.menu') }).closest<HTMLElement>('[class*="actions"]')!;
    for (const n of [optionsName(1), t('tile.maximise'), t('tile.reload')]) expect(end.contains(within(tile()).getByRole('button', { name: n }))).toBe(true);
    expect(end.contains(within(tile()).getByRole('button', { name: t('tile.sessionOf', { name: 'terminal-1' }) }))).toBe(false);
    expect(head().contains(end)).toBe(true);
  });

  const plainName = t('tile.optionsFor', { name: 'terminal-1' });
  const keysOf = (name: string | RegExp) => within(tile()).getByRole('button', { name }).getAttribute('aria-keyshortcuts');

  it('no key cap in the header; on the active tile O, Z and R are named for assistive tech (count and plain options)', () => {
    const r = render(<Tile {...props({ changed: 1 })} />);
    expect(head().querySelector('kbd')).toBeNull();
    expect([keysOf(optionsName(1)), keysOf(t('tile.maximise')), keysOf(t('tile.reload'))]).toEqual(['O', 'Z', 'R']);
    r.rerender(<Tile {...props({ changed: 0 })} />);
    expect(head().querySelector('kbd')).toBeNull();
    expect([keysOf(plainName), keysOf(t('tile.maximise')), keysOf(t('tile.reload'))]).toEqual(['O', 'Z', 'R']);
  });

  it('keys off: options and maximise name no key (count and plain); R stays (it is not one of the Board keys)', () => {
    const r = render(<Tile {...props({ changed: 1, keys: false })} />);
    expect([keysOf(optionsName(1)), keysOf(t('tile.maximise')), keysOf(t('tile.reload'))]).toEqual([null, null, 'R']);
    r.rerender(<Tile {...props({ changed: 0, keys: false })} />);
    expect([keysOf(plainName), keysOf(t('tile.maximise'))]).toEqual([null, null]);
  });

  it('an inactive tile names no key (the keys act on the active tile) and keeps its header controls out of the tab order', () => {
    const r = render(<Tile {...props({ changed: 1, active: false })} />);
    const names = [optionsName(1), t('tile.maximise'), t('tile.reload'), t('tile.sessionOf', { name: 'terminal-1' })];
    for (const n of names) {
      const b = within(tile()).getByRole('button', { name: n });
      expect(b.hasAttribute('aria-keyshortcuts'), n).toBe(false);
      // Out of the tab order: excluded (tabindex -1), or disabled (reload, while the fixture's computer is stopped).
      expect(b.getAttribute('tabindex') === '-1' || b.hasAttribute('disabled'), n).toBe(true);
    }
    r.rerender(<Tile {...props({ changed: 0, active: false })} />);
    expect(keysOf(plainName)).toBeNull();
    expect(within(tile()).getByRole('button', { name: plainName }).getAttribute('tabindex')).toBe('-1');
  });
});
