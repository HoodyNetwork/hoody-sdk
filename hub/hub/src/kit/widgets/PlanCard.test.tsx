// Vitest: PlanCard's structure. A group named by the plan, the slots in their order with the action last, the fold's
// count, the loading and error states, the regions row, and the tone, fill and state the page sets.
import { render, screen, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ReactNode } from 'react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { HeadingLevel } from '../layouts/anatomy/Heading';
import { PlanCard } from './PlanCard';

const full = (extra: Partial<Parameters<typeof PlanCard>[0]> = {}) => (
  <PlanCard
    name="Pro"
    chip="Shared"
    price={{ amount: '$12', per: '/month' }}
    lead="For a team"
    specs={['4 cores', '8 GB memory']}
    more={['Snapshots', 'Aliases', 'Bot URLs']}
    footnote={<p>Kept 7 days after it ends</p>}
    marks={<span>Yours</span>}
    note={<p>Renews on the 3rd</p>}
    action={<button type="button">Upgrade</button>}
    {...extra}
  />
);

const card = () => screen.getByRole('group', { name: 'Pro' });
/** The visible text of each slot, in document order. */
const order = (...texts: string[]) => texts.map((x) => card().textContent!.indexOf(x));

describe('PlanCard', () => {
  it('is a group named by the plan, marked for the kit, in the given order with the action last', () => {
    render(full());
    expect(card()).toHaveAttribute('data-kit', 'plan-card');
    expect(within(card()).getByRole('heading', { name: 'Pro' })).toBeInTheDocument();
    const at = order('Pro', 'Shared', 'Yours', '$12', '/month', 'For a team', '4 cores', 'Show all 5 details', 'Kept 7 days', 'Renews on', 'Upgrade');
    expect(at.every((i) => i >= 0)).toBe(true);
    expect(at).toEqual([...at].sort((a, b) => a - b));
    const lastButton = within(card()).getAllByRole('button').at(-1);
    expect(lastButton).toHaveAccessibleName('Upgrade');
  });

  it('shows the first specs with a check mark and folds the rest under "Show all {count} details", count = every line', () => {
    render(full());
    expect(within(card()).getAllByRole('listitem').length).toBeGreaterThanOrEqual(2);
    expect(within(card()).getByRole('button', { name: 'Show all 5 details' })).toBeInTheDocument();
  });

  it('has no fold when every spec is shown, and no action region without an action', () => {
    render(<PlanCard name="Pro" specs={['4 cores']} />);
    expect(within(card()).queryByRole('button')).toBeNull();
  });

  it('loading: aria-busy, skeleton lines in place of the price and specs, the name kept, no action', () => {
    render(full({ state: 'loading' }));
    expect(card()).toHaveAttribute('aria-busy', 'true');
    expect(card()).toHaveAttribute('data-state', 'loading');
    expect(within(card()).getByRole('heading', { name: 'Pro' })).toBeInTheDocument();
    expect(screen.queryByText('$12')).toBeNull();
    expect(screen.queryByText('4 cores')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Upgrade' })).toBeNull();
  });

  it('error with onRetry: the kit ErrorState takes the specs\' place, the note is its body, Try again calls onRetry once', async () => {
    const onRetry = vi.fn();
    render(full({ state: 'error', note: 'The plans could not be read', onRetry }));
    expect(card()).toHaveAttribute('data-state', 'error');
    const alert = within(card()).getByRole('alert');
    expect(alert).toHaveTextContent("This didn't load");
    expect(alert).toHaveTextContent('The plans could not be read');
    expect(screen.queryByText('4 cores')).toBeNull();
    expect(screen.queryByText('$12')).toBeNull();
    expect(card()).not.toHaveAttribute('aria-busy');
    expect(screen.queryByRole('button', { name: 'Upgrade' }), 'the action yields to Try again').toBeNull();
    await userEvent.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('error while retrying: Try again refuses presses, so a retry cannot start twice', async () => {
    const onRetry = vi.fn();
    render(full({ state: 'error', note: 'The plans could not be read', onRetry, retrying: true }));
    await userEvent.click(within(within(card()).getByRole('alert')).getByRole('button', { name: 'Try again' }));
    expect(onRetry).not.toHaveBeenCalled();
  });

  it('error without onRetry: the kit ErrorState shows no retry control (pages never pass an ErrorState in note)', () => {
    render(full({ state: 'error', note: 'The plans could not be read' }));
    const alert = within(card()).getByRole('alert');
    expect(alert).toHaveTextContent('The plans could not be read');
    expect(within(alert).queryByRole('button', { name: 'Try again' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Upgrade' }), 'no action in the error state').toBeNull();
  });

  it('carries the tone the page sets, default when none', () => {
    const { rerender } = render(full());
    expect(card()).toHaveAttribute('data-tone', 'default');
    rerender(full({ tone: 'accent' }));
    expect(card()).toHaveAttribute('data-tone', 'accent');
    rerender(full({ tone: 'current' }));
    expect(card()).toHaveAttribute('data-tone', 'current');
  });

  it('sets the price in --t-price with tabular figures, the action at the bottom, accent the plan frame line and no tint', () => {
    const css = readFileSync(join(import.meta.dirname, 'PlanCard.module.css'), 'utf8');
    const rule = (sel: string) => new RegExp(`\\n${sel.replace(/[.[\]"=]/g, (c) => `\\${c}`)}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? '';
    expect(rule('.amount')).toMatch(/font:\s*var\(--t-price\);[\s\S]*font-variant-numeric:\s*tabular-nums/);
    expect(rule('.action')).toMatch(/margin-block-start:\s*auto/);
    // accent: a 1 px line in the plan frame colour (blue in light, the soft highlight in dark) drawn by CutFrame's own
    // edge, never an inset shadow, and no tint of its own.
    expect(rule('.card[data-tone=accent]')).toMatch(/--cut-edge:\s*var\(--hx-plan-frame\)/);
    expect(css).not.toMatch(/data-tone=accent\][^{]*\.inner/);
    expect(css).not.toMatch(/box-shadow/);
    expect(rule('.card[data-tone=current] .inner')).toMatch(/background:\s*var\(--hx-selected\)/);
    const tokens = readFileSync(join(import.meta.dirname, '../tokens.css'), 'utf8');
    expect(tokens).toMatch(/--t-price:\s*300 40px\/44px var\(--font-head\);/);
  });

  it('draws blue only in the accent edge: the checks and every other rule stay neutral', () => {
    // The lint exception for this file (exceptions.ts, hub/blue-only-link-focus) covers the whole file, so this test is
    // what keeps blue to the accent tone. Blue is what the lint rule calls blue: a --hx-blue* token, or any token of
    // tokens.css whose value reaches one in either theme (--hx-link, --hx-selected-bar, --focus-ring...).
    const tokens = readFileSync(join(import.meta.dirname, '../tokens.css'), 'utf8');
    const defs = new Map<string, string[]>();
    for (const m of tokens.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) defs.set(m[1]!, [...(defs.get(m[1]!) ?? []), m[2]!]);
    const refs = (v: string) => [...v.matchAll(/var\(\s*(--[\w-]+)/g)].map((m) => m[1]!);
    const blueTokens = new Set([...defs.keys()].filter((n) => /^--hx-blue/.test(n)));
    for (let grew = true; grew; ) {
      grew = false;
      for (const [n, vs] of defs) if (!blueTokens.has(n) && vs.some((v) => refs(v).some((r) => blueTokens.has(r)))) {
          blueTokens.add(n);
          grew = true;
        }
    }
    expect(blueTokens.has('--hx-selected-bar') || blueTokens.has('--hx-link'), 'the closure finds the derived blues').toBe(true);
    const css = readFileSync(join(import.meta.dirname, 'PlanCard.module.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const rules = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].map((m) => ({ sel: m[1]!.trim(), body: m[2]! }));
    const blue = rules.filter((r) => refs(r.body).some((t) => blueTokens.has(t))).map((r) => r.sel);
    expect(blue).toEqual(['.card[data-tone=accent]']);
    const checks = rules.filter((r) => r.sel.split(',').some((x) => /\.check\b/.test(x)));
    expect(checks.length).toBeGreaterThan(0);
    const colors = checks.flatMap((r) => [...r.body.matchAll(/(?:^|;)\s*color\s*:\s*([^;]+)/g)].map((m) => m[1]!.trim()));
    expect(colors.length).toBeGreaterThan(0);
    expect(colors.every((c) => c === 'var(--hx-muted)'), colors.join(' | ')).toBe(true);
  });

  it('the fold heading is one level below the plan name, wherever the card sits (no skipped or sibling levels)', () => {
    for (const depth of [0, 1, 2]) {
      const wrap = (n: number, child: ReactNode): ReactNode => (n === 0 ? child : <HeadingLevel>{wrap(n - 1, child)}</HeadingLevel>);
      const { unmount } = render(<>{wrap(depth, full())}</>);
      const name = within(card()).getByRole('heading', { name: 'Pro' });
      const fold = within(card()).getByRole('heading', { name: 'Show all 5 details' });
      const lvl = (el: HTMLElement) => Number(el.tagName.slice(1)) || Number(el.getAttribute('aria-level'));
      expect(lvl(fold), `depth ${depth}`).toBe(Math.min(6, lvl(name) + 1));
      unmount();
    }
  });

  it('marks the price, lead, spec lines, footnote and note dir="auto", so mixed-direction text keeps its order', () => {
    render(full());
    for (const text of ['/month', 'For a team', '4 cores', 'Kept 7 days after it ends', 'Renews on the 3rd'])
      expect(screen.getByText(text, { exact: false }).closest('[dir="auto"]'), text).not.toBeNull();
  });

  it('rows: under the lead, one description list, label then value, before the specs', () => {
    render(
      full({
        rows: [
          { id: 'ram', label: 'Memory', value: '6 GB' },
          { id: 'disk', label: 'Disk', value: '75 GB' },
        ],
      }),
    );
    const at = order('For a team', 'Memory', '6 GB', 'Disk', '75 GB', '4 cores', 'Upgrade');
    expect(at.every((i) => i >= 0)).toBe(true);
    expect(at).toEqual([...at].sort((a, b) => a - b));
    const list = card().querySelector('dl')!;
    expect([...list.children].map((d) => [d.querySelector('dt')?.textContent, d.querySelector('dd')?.textContent, d.getAttribute('data-plan-row')])).toEqual([
      ['Memory', '6 GB', 'ram'],
      ['Disk', '75 GB', 'disk'],
    ]);
    for (const el of list.querySelectorAll('dt, dd')) expect(el).toHaveAttribute('dir', 'auto');
  });

  it('no rows, no list; no list while loading or in error', () => {
    const { rerender } = render(full());
    expect(card().querySelector('dl')).toBeNull();
    rerender(full({ state: 'loading', rows: [{ id: 'a', label: 'A', value: '1' }] }));
    expect(card().querySelector('dl')).toBeNull();
    rerender(full({ state: 'error', note: 'x', rows: [{ id: 'a', label: 'A', value: '1' }] }));
    expect(card().querySelector('dl')).toBeNull();
  });

  it('regions: a labelled row of region tags under the facts and before the specs, a full region named so', () => {
    render(
      full({
        rows: [{ id: 'ram', label: 'Memory', value: '6 GB' }],
        regions: {
          label: '3 regions',
          items: [
            { id: 'fra', flag: '🇩🇪', name: 'Frankfurt' },
            { id: 'ams', name: 'Amsterdam', full: true },
            { id: 'nyc', name: 'New York' },
          ],
        },
      }),
    );
    const at = order('6 GB', '3 regions', 'Frankfurt', 'New York', '4 cores', 'Upgrade');
    expect(at.every((i) => i >= 0)).toBe(true);
    expect(at).toEqual([...at].sort((a, b) => a - b));
    const list = within(card()).getByRole('list', { name: '3 regions' });
    const tags = within(list).getAllByRole('listitem');
    // What a screen reader says of each tag: its text without the aria-hidden flag.
    const spoken = (li: HTMLElement) => [...li.children].filter((c) => c.getAttribute('aria-hidden') !== 'true').map((c) => c.textContent).join('');
    expect(tags.map(spoken)).toEqual(['Frankfurt', 'Amsterdam, full', 'New York']);
    expect(tags[1]).toHaveAttribute('data-full');
    expect(tags[0]).not.toHaveAttribute('data-full');
    // The flag is decoration: the region's name says it.
    expect(within(tags[0]!).getByText('🇩🇪')).toHaveAttribute('aria-hidden', 'true');
    expect(card().querySelector('[data-plan-part="regions"]')).not.toBeNull();
  });

  it('regions with a note only: the label and the note, no list; nothing while loading', () => {
    const { rerender } = render(full({ regions: { label: 'Region', note: 'No region selection' } }));
    const part = card().querySelector('[data-plan-part="regions"]')!;
    expect(part).toHaveTextContent('Region');
    expect(part).toHaveTextContent('No region selection');
    expect(within(card()).queryByRole('list', { name: 'Region' })).toBeNull();
    rerender(full({ state: 'loading', regions: { label: 'Region', note: 'No region selection' } }));
    expect(card().querySelector('[data-plan-part="regions"]')).toBeNull();
  });

  it('fill: the plan fills and the plan edge come from the plan tokens; no fill keeps the kit card', () => {
    const { rerender } = render(full());
    expect(card()).not.toHaveAttribute('data-fill');
    for (const f of ['calm', 'plan', 'lift'] as const) {
      rerender(full({ fill: f }));
      expect(card()).toHaveAttribute('data-fill', f);
    }
    const css = readFileSync(join(import.meta.dirname, 'PlanCard.module.css'), 'utf8');
    const rule = (sel: string) => new RegExp(`\\n${sel.replace(/[.[\]"=]/g, (c) => `\\${c}`)}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? '';
    expect(rule('.card[data-fill]')).toMatch(/--cut-edge:\s*var\(--hx-plan-edge\)/);
    expect(rule('.card[data-fill=calm] .inner')).toMatch(/background:\s*var\(--hx-plan-card-calm\)/);
    expect(rule('.card[data-fill=plan] .inner')).toMatch(/background:\s*var\(--hx-plan-card\)/);
    expect(rule('.card[data-fill=lift] .inner')).toMatch(/background:\s*var\(--hx-plan-card-lift\)/);
    // The accent line is written after the fill's edge, so a framed card keeps its frame whatever its fill.
    expect(css.indexOf('\n.card[data-tone=accent]')).toBeGreaterThan(css.indexOf('\n.card[data-fill] {'));
    // current keeps its fill over any plan fill (written after the fills).
    expect(css.indexOf('\n.card[data-tone=current] .inner')).toBeGreaterThan(css.indexOf('\n.card[data-fill=lift] .inner'));
  });
});
