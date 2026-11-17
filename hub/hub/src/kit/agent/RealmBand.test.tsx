// RealmBand: one sentence per data-host state, the read's 503 and any other failure; the on/off suffix only when
// known; Try again only where reading again can help; the recovery action slot only while no host serves (electing,
// unavailable, stuck); Details only with content.
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { interpolate } from '../strings';
import { RealmBand, type RealmBandHost, type RealmBandState } from './RealmBand';
import strings from './RealmBand.strings.en.json';

afterEach(() => cleanup());

const v = { realm: 'Work', computer: 'atlas', host: 'borealis' };
const text = () => document.querySelector('[data-band-text]')?.textContent ?? '';
const draw = (host: RealmBandHost, memory: boolean | null = true, extra: Partial<Parameters<typeof RealmBand>[0]> = {}) =>
  render(<RealmBand realm="Work" computer="atlas" host={host} memory={memory} onRetry={vi.fn()} {...extra} />);

describe('RealmBand words', () => {
  it.each<[RealmBandState, string]>([
    ['leader', `Realm Work · ${interpolate(strings.leader, { host: 'atlas' })} · memory on`],
    ['follower', `Realm Work · ${interpolate(strings.follower, v)} · memory on`],
    ['electing', `Realm Work · ${strings.electing} · memory on`],
    ['unavailable', `${strings.unavailable} · memory on`],
    ['stuck', `${strings.stuck} · memory on`],
    ['not_realm_member', `${interpolate(strings.not_realm_member, v)} · memory on`],
    ['fleet_disabled', `${interpolate(strings.fleet_disabled, v)} · memory on`],
    ['realm_blocked', `${interpolate(strings.realm_blocked, v)} · memory on`],
  ])('%s has its own sentence', (state, want) => {
    draw({ kind: 'state', state, host: state === 'leader' ? 'atlas' : 'borealis' });
    expect(text()).toBe(want);
  });

  it('every state reads differently', () => {
    const seen = new Set<string>();
    for (const state of ['leader', 'follower', 'electing', 'unavailable', 'stuck', 'not_realm_member', 'fleet_disabled', 'realm_blocked'] as const) {
      draw({ kind: 'state', state, host: state === 'leader' ? 'atlas' : 'borealis' }, null);
      seen.add(text());
      cleanup();
    }
    draw({ kind: 'cold' }, null);
    seen.add(text());
    cleanup();
    draw({ kind: 'unreachable' }, null);
    seen.add(text());
    expect(seen.size).toBe(10);
  });

  it('a 503 says the realm’s memory is not connected on this computer, with Try again', async () => {
    const onRetry = vi.fn();
    draw({ kind: 'cold' }, null, { onRetry });
    expect(text()).toBe(interpolate(strings.cold, v));
    expect(text()).toBe('Memory for realm Work is not connected on atlas right now. It connects while the realm is in use on atlas.');
    await userEvent.click(screen.getByRole('button', { name: strings.retry }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('any other failed read says memory cannot be reached, with Try again, and no on/off guess', () => {
    draw({ kind: 'unreachable' }, null);
    expect(text()).toBe('Cannot reach memory right now');
    expect(screen.getByRole('button', { name: strings.retry })).toBeInTheDocument();
  });

  it('memory off and unknown: "memory off", or nothing at all', () => {
    draw({ kind: 'state', state: 'leader', host: 'atlas' }, false);
    expect(text().endsWith(' · memory off')).toBe(true);
    cleanup();
    draw({ kind: 'state', state: 'leader', host: 'atlas' }, null);
    expect(text()).not.toMatch(/memory (on|off)/);
  });

  it('Try again only where reading again can help', () => {
    for (const state of ['leader', 'follower', 'electing', 'stuck', 'not_realm_member', 'fleet_disabled', 'realm_blocked'] as const) {
      draw({ kind: 'state', state, host: 'borealis' });
      expect(screen.queryByRole('button', { name: strings.retry })).toBeNull();
      cleanup();
    }
    draw({ kind: 'state', state: 'unavailable', host: '' });
    expect(screen.getByRole('button', { name: strings.retry })).toBeInTheDocument();
  });

  it.each<RealmBandState>(['electing', 'unavailable', 'stuck'])('the recovery action shows while no host serves: %s', (state) => {
    draw({ kind: 'state', state, host: '' }, true, { action: <button type="button">Use atlas</button> });
    expect(screen.getByRole('button', { name: 'Use atlas' })).toBeInTheDocument();
  });

  it.each<RealmBandState>(['leader', 'follower', 'not_realm_member', 'fleet_disabled', 'realm_blocked'])('the recovery action never shows in %s', (state) => {
    draw({ kind: 'state', state, host: 'atlas' }, true, { action: <button type="button">Use atlas</button> });
    expect(screen.queryByRole('button', { name: 'Use atlas' })).toBeNull();
  });

  it.each<RealmBandHost>([{ kind: 'loading' }, { kind: 'cold' }, { kind: 'unreachable' }])('the recovery action never shows on a read that says no state ($kind)', (host) => {
    draw(host, true, { action: <button type="button">Use atlas</button> });
    expect(screen.queryByRole('button', { name: 'Use atlas' })).toBeNull();
  });

  it('Details opens and closes its content; without content there is no Details', async () => {
    draw({ kind: 'state', state: 'leader', host: 'atlas' }, true, { details: <p>hosts here</p> });
    expect(screen.queryByText('hosts here')).toBeNull();
    const b = screen.getByRole('button', { name: strings.details });
    expect(b).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(b);
    expect(screen.getByText('hosts here')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: strings.hideDetails }));
    expect(screen.queryByText('hosts here')).toBeNull();
    cleanup();
    draw({ kind: 'state', state: 'leader', host: 'atlas' });
    expect(screen.queryByRole('button', { name: strings.details })).toBeNull();
  });

  it('serving states are neutral, the rest warn', () => {
    draw({ kind: 'state', state: 'follower', host: 'b' });
    expect(document.querySelector('[role="status"]')).not.toBeNull();
    cleanup();
    draw({ kind: 'state', state: 'realm_blocked', host: '' });
    expect(document.querySelector('[role="alert"]')).not.toBeNull();
  });
});
