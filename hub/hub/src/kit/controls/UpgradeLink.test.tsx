// UpgradeLink: the one upsell piece. It shows only where the upgrade exists
// and this session may follow it (page served, permission leaf, not framed, not Market-banned); quiet below 75 %, near
// from 75 (the Meter's warn line), full when full; at most one per UpgradeScope; the visible text is its whole name.
// 1b: the scope is a store (claims in effects, so unmounts, StrictMode and late eligibility keep exactly one drawn) and
// the Market ban latch is read as a store (a ban set after render hides the piece at once).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { act, render, screen } from '@testing-library/react';
import { StrictMode, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PagesProvider } from '../../shell/pageLinks';
import kitStrings from '../strings.en.json';
import { interpolate } from '../strings';
import { UPGRADE_NEAR_PCT, UpgradeLink, UpgradeScope, upgradeProminence, type UpgradeAvailable } from './UpgradeLink';
import s from './UpgradeLink.module.css';

const css = readFileSync(path.join(import.meta.dirname, 'UpgradeLink.module.css'), 'utf8');
const gate = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  const g = {
    leaves: new Set(['financial.subscriptions.purchase', 'financial.server_rental.rent_servers']),
    framed: false,
    banned: false,
    listeners,
    /** The latch as core sets it: a change notifies the subscribers. */
    ban(v: boolean) { g.banned = v; for (const l of [...listeners]) l(); },
  };
  return g;
});
vi.mock('@core', async (orig) => {
  const core = await orig<Record<string, unknown>>();
  return {
    ...core,
    useCan: (cap: string) => gate.leaves.has(cap),
    isFramed: () => gate.framed,
    commerce: {
      ...(core.commerce as object),
      marketBanned: () => gate.banned,
      subscribeMarketBanned: (fn: () => void) => { gate.listeners.add(fn); return () => { gate.listeners.delete(fn); }; },
    },
  };
});
afterEach(() => {
  gate.leaves = new Set(['financial.subscriptions.purchase', 'financial.server_rental.rent_servers']);
  gate.framed = false;
  gate.banned = false;
  vi.restoreAllMocks();
});

const PLANS = '/billing?plan=&why=limit#plans';
const pages = [{ id: 'billing', path: '/billing' }, { id: 'market', path: '/market' }] as never;
const served = (ui: React.ReactElement, list = pages) => render(<PagesProvider pages={list}>{ui}</PagesProvider>);
const link = (name: string | RegExp) => screen.queryByRole('link', { name });

describe('upgradeProminence', () => {
  it('quiet below 75, near from 75 (the Meter warn line), full whenever the resource is full', () => {
    expect(UPGRADE_NEAR_PCT).toBe(75);
    expect(upgradeProminence(74)).toBe('quiet');
    expect(upgradeProminence(74.9)).toBe('quiet');
    expect(upgradeProminence(75)).toBe('near');
    expect(upgradeProminence(89)).toBe('near');
    expect(upgradeProminence(90)).toBe('near');
    expect(upgradeProminence(100)).toBe('near');
    expect(upgradeProminence(10, true)).toBe('full');
    expect(upgradeProminence(undefined, true)).toBe('full');
  });

  it('a missing or broken reading is quiet, never near', () => {
    expect(upgradeProminence()).toBe('quiet');
    expect(upgradeProminence(null)).toBe('quiet');
    expect(upgradeProminence(Number.NaN)).toBe('quiet');
    expect(upgradeProminence(Number.POSITIVE_INFINITY)).toBe('quiet');
    expect(upgradeProminence(-5)).toBe('quiet');
  });
});

describe('UpgradeLink: who sees it', () => {
  it('a plan step for a session that may buy: a quiet nav link to the place, named by its label', () => {
    served(<UpgradeLink available="plan" href={PLANS} label="Get more room" />);
    const a = link('Get more room');
    expect(a).toHaveAttribute('href', PLANS);
    expect(a).toHaveAttribute('data-upgrade', 'quiet');
  });

  it('available none renders nothing', () => {
    const { container } = served(<UpgradeLink available="none" href={PLANS} label="Get more room" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('a session without the purchase leaf gets no plan link', () => {
    gate.leaves.delete('financial.subscriptions.purchase');
    const { container } = served(<UpgradeLink available="plan" href={PLANS} label="Get more room" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('a Market destination needs the rental leaf, not the purchase one', () => {
    gate.leaves.delete('financial.server_rental.rent_servers');
    const { container } = served(<UpgradeLink available="market" href="/market" label="Rent a bigger server" />);
    expect(container).toBeEmptyDOMElement();
    gate.leaves = new Set(['financial.server_rental.rent_servers']);
    served(<UpgradeLink available="market" href="/market" label="Rent a bigger server" />);
    expect(link('Rent a bigger server')).toHaveAttribute('href', '/market');
  });

  it('a framed page gets none', () => {
    gate.framed = true;
    const { container } = served(<UpgradeLink available="plan" href={PLANS} label="Get more room" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('an account the Market marked banned gets none', () => {
    gate.banned = true;
    const { container } = served(<UpgradeLink available="plan" href={PLANS} label="Get more room" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('a ban the Market latches after render hides a drawn link at once, and a cleared latch brings it back', () => {
    served(<UpgradeLink available="plan" href={PLANS} label="Get more room" />);
    expect(link('Get more room')).not.toBeNull();
    act(() => gate.ban(true));
    expect(link('Get more room')).toBeNull();
    act(() => gate.ban(false));
    expect(link('Get more room')).not.toBeNull();
  });

  it('a link subscribes to the ban latch while mounted and unsubscribes on unmount', () => {
    const before = gate.listeners.size;
    const { unmount } = served(<UpgradeLink available="plan" href={PLANS} label="Get more room" />);
    expect(gate.listeners.size).toBeGreaterThan(before);
    unmount();
    expect(gate.listeners.size).toBe(before);
  });

  it('a destination page this load does not serve gets none', () => {
    const { container } = served(<UpgradeLink available="plan" href={PLANS} label="Get more room" />, [{ id: 'market', path: '/market' }] as never);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('UpgradeLink: prominence and words', () => {
  it('near: a small link button with the warn dot; its text, the whole name, says it is running low', () => {
    served(<UpgradeLink available="plan" href={PLANS} label="Get more room" prominence="near" />);
    const name = interpolate(kitStrings['upgrade.near'], { label: 'Get more room' });
    const a = link(name);
    expect(a).toHaveAttribute('data-upgrade', 'near');
    expect(a).toHaveAttribute('href', PLANS);
    expect(a?.textContent).toBe(name);
  });

  it('full: the same with the danger dot and the full words', () => {
    served(<UpgradeLink available="plan" href={PLANS} label="Get more room" prominence="full" />);
    const name = interpolate(kitStrings['upgrade.full'], { label: 'Get more room' });
    expect(link(name)).toHaveAttribute('data-upgrade', 'full');
  });

  it('near and full carry different dots; quiet carries none', () => {
    const { container } = served(
      <>
        <UpgradeLink available="plan" href={PLANS} label="A" />
        <UpgradeLink available="plan" href={PLANS} label="B" prominence="near" />
        <UpgradeLink available="plan" href={PLANS} label="C" prominence="full" />
      </>,
    );
    const [a, b, c] = [...container.querySelectorAll('a')];
    expect(a?.querySelector('[data-upgrade-dot]')).toBeNull();
    const dotB = b?.querySelector('[data-upgrade-dot]');
    const dotC = c?.querySelector('[data-upgrade-dot]');
    expect(dotB).toHaveAttribute('aria-hidden', 'true');
    expect(dotC).toHaveAttribute('aria-hidden', 'true');
    expect(dotB?.className).toBe(s.dotNear);
    expect(dotC?.className).toBe(s.dotFull);
    // The warn and danger tokens the Meter uses for the same lines.
    expect(css).toMatch(/\.dotNear\s*\{\s*background:\s*var\(--hx-warn\);/);
    expect(css).toMatch(/\.dotFull\s*\{\s*background:\s*var\(--hx-danger\);/);
  });
});

describe('UpgradeScope: one per card', () => {
  it('two pieces in one scope draw only the first', () => {
    served(
      <UpgradeScope>
        <UpgradeLink available="plan" href={PLANS} label="Get more room" />
        <UpgradeLink available="plan" href="/billing?plan=&why=ai#plans" label="Get more AI" />
      </UpgradeScope>,
    );
    expect(link('Get more room')).not.toBeNull();
    expect(link('Get more AI')).toBeNull();
  });

  it('a first piece that may not draw does not block the second', () => {
    gate.leaves = new Set(['financial.server_rental.rent_servers']);
    served(
      <UpgradeScope>
        <UpgradeLink available="plan" href={PLANS} label="Get more room" />
        <UpgradeLink available="market" href="/market" label="Rent a bigger server" />
      </UpgradeScope>,
    );
    expect(link('Get more room')).toBeNull();
    expect(link('Rent a bigger server')).not.toBeNull();
  });

  it('separate scopes (two cards) each draw their own', () => {
    served(
      <>
        <UpgradeScope>
          <UpgradeLink available="plan" href={PLANS} label="Card one" />
        </UpgradeScope>
        <UpgradeScope>
          <UpgradeLink available="plan" href={PLANS} label="Card two" />
        </UpgradeScope>
      </>,
    );
    expect(link('Card one')).not.toBeNull();
    expect(link('Card two')).not.toBeNull();
  });
});

describe('UpgradeScope: transitions', () => {
  const drawn = () => screen.queryAllByRole('link').map((a) => a.textContent);

  it('when the drawn piece unmounts, the next one shows', () => {
    let hideFirst!: () => void;
    function Card() {
      const [first, setFirst] = useState(true);
      hideFirst = () => setFirst(false);
      return (
        <UpgradeScope>
          {first && <UpgradeLink available="plan" href={PLANS} label="First" />}
          <UpgradeLink available="plan" href={PLANS} label="Second" />
        </UpgradeScope>
      );
    }
    served(<Card />);
    expect(drawn()).toEqual(['First']);
    act(() => hideFirst());
    expect(drawn()).toEqual(['Second']);
  });

  it('when the drawn piece stops being allowed, the next one shows (settled: one drawn while any is eligible)', () => {
    let setFirst!: (a: UpgradeAvailable) => void;
    function Card() {
      const [first, set] = useState<UpgradeAvailable>('plan');
      setFirst = set;
      return (
        <UpgradeScope>
          <UpgradeLink available={first} href={PLANS} label="First" />
          <UpgradeLink available="market" href="/market" label="Second" />
        </UpgradeScope>
      );
    }
    served(<Card />);
    expect(drawn()).toEqual(['First']);
    act(() => setFirst('none'));
    expect(drawn()).toEqual(['Second']);
    // It coming back does not take over or add a second link: one drawn, always.
    act(() => setFirst('plan'));
    expect(drawn()).toEqual(['Second']);
  });

  it('a ban that hides every piece leaves none, and clearing it draws exactly one again', () => {
    served(
      <UpgradeScope>
        <UpgradeLink available="plan" href={PLANS} label="First" />
        <UpgradeLink available="plan" href={PLANS} label="Second" />
      </UpgradeScope>,
    );
    expect(drawn()).toEqual(['First']);
    act(() => gate.ban(true));
    expect(drawn()).toEqual([]);
    act(() => gate.ban(false));
    expect(drawn()).toHaveLength(1);
  });

  it('under StrictMode (effects cleaned up and set up again) exactly one shows', () => {
    served(
      <StrictMode>
        <UpgradeScope>
          <UpgradeLink available="plan" href={PLANS} label="First" />
          <UpgradeLink available="plan" href={PLANS} label="Second" />
          <UpgradeLink available="plan" href={PLANS} label="Third" />
        </UpgradeScope>
      </StrictMode>,
    );
    expect(drawn()).toHaveLength(1);
  });

  it('under StrictMode a single piece still shows', () => {
    served(
      <StrictMode>
        <UpgradeScope>
          <UpgradeLink available="plan" href={PLANS} label="Only" />
        </UpgradeScope>
      </StrictMode>,
    );
    expect(drawn()).toEqual(['Only']);
  });

  it('a suppressed later piece gets a dev warning, once per scope; one piece gets none', () => {
    const warn = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { unmount } = served(
      <UpgradeScope>
        <UpgradeLink available="plan" href={PLANS} label="Only" />
      </UpgradeScope>,
    );
    expect(warn).not.toHaveBeenCalled();
    unmount();
    served(
      <UpgradeScope>
        <UpgradeLink available="plan" href={PLANS} label="First" />
        <UpgradeLink available="plan" href={PLANS} label="Second" />
        <UpgradeLink available="plan" href={PLANS} label="Third" />
      </UpgradeScope>,
    );
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toMatch(/one per card/);
  });
});
