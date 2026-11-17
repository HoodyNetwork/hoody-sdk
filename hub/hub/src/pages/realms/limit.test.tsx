// New realm and the account's Realm limit. The wizard saves the realm's name before any computer is added, so while
// the API says the limit is reached nothing may start: Next and Create are off with the reason, a band says why and
// links Billing, and no name is ever written. With no word about the limit from the API the wizard is as before.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Core from '@core';
import type { RealmCapView } from '@core';
import { act } from '@testing-library/react';
import { renderPage, screen } from '@app/testing';

let cap: RealmCapView = { k: 'none' };
let read: Promise<unknown> = Promise.resolve();
vi.mock('@core', async (orig) => ({ ...(await orig<typeof Core>()), useRealmCap: () => cap, loadRealms: () => read }));

const { default: page } = await import('./page');
const { default: strings } = await import('./strings.en.json');
const { realmSends, resetRealmsWorld } = await import('./fixtures');

beforeEach(() => { resetRealmsWorld(); cap = { k: 'none' }; read = Promise.resolve(); });
afterEach(() => { cap = { k: 'none' }; });

describe('New realm: the Realm limit', () => {
  it('no cap from the API: no band, Next is not held by the limit', async () => {
    await renderPage(page, { path: '/realms/new' });
    await screen.findByRole('button', { name: strings.next });
    expect(screen.queryByText(strings['limit.band'])).toBeNull();
    expect(screen.queryByRole('button', { name: strings['limit.upgrade'] })).toBeNull();
  });
  it('under the limit: the same', async () => {
    cap = { k: 'use', used: 3, max: 5, reached: false, upgrade: false };
    await renderPage(page, { path: '/realms/new' });
    await screen.findByRole('button', { name: strings.next });
    expect(screen.queryByText(strings['limit.band'])).toBeNull();
  });
  it('at the limit: the band with Upgrade, and the step button is off with the reason; nothing is sent', async () => {
    cap = { k: 'use', used: 5, max: 5, reached: true, upgrade: true };
    await renderPage(page, { path: '/realms/new' });
    expect(await screen.findByText(strings['limit.band'])).toBeInTheDocument();
    expect(screen.getByRole('button', { name: strings['limit.upgrade'] })).toBeInTheDocument();
    const next = screen.getByRole('button', { name: new RegExp(strings.next) });
    expect(next).toHaveAttribute('aria-disabled', 'true');
    expect(realmSends).toEqual([]);
  });
  it('while this opening\'s read of the limit is out the step button is off with a plain reason; its answer opens it', async () => {
    let end = () => {};
    read = new Promise<void>((r) => { end = r; });
    cap = { k: 'use', used: 3, max: 5, reached: false, upgrade: false };
    await renderPage(page, { path: '/realms/new' });
    const next = await screen.findByRole('button', { name: new RegExp(strings.next) });
    expect(next).toHaveAttribute('aria-disabled', 'true');
    expect(document.body.textContent).toContain(strings['limit.checking']);
    expect(screen.queryByText(strings['limit.band'])).toBeNull();
    await act(async () => { end(); await read; });
    expect(screen.getByRole('button', { name: new RegExp(strings.next) })).not.toHaveAttribute('aria-disabled', 'true');
    expect(realmSends).toEqual([]);
  });
  it('a read that fails closes nothing', async () => {
    read = Promise.reject(new Error('x'));
    read.catch(() => undefined);
    await renderPage(page, { path: '/realms/new' });
    const next = await screen.findByRole('button', { name: new RegExp(strings.next) });
    await act(async () => { await Promise.resolve(); });
    expect(next).not.toHaveAttribute('aria-disabled', 'true');
  });
  it('the top plan at its limit: the band, no Upgrade', async () => {
    cap = { k: 'use', used: 1000, max: 1000, reached: true, upgrade: false };
    await renderPage(page, { path: '/realms/new' });
    expect(await screen.findByText(strings['limit.band'])).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: strings['limit.upgrade'] })).toBeNull();
  });
});
