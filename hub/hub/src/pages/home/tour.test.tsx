// Vitest: Home and the tour (pages/onboarding). Home opens the tour by itself once per account and only on what it
// read: an account session whose whole list is one computer still being made. An account whose one computer runs stays
// on Home and gets the Welcome with the tour marked, once, never over a stored Hide; the Welcome links the tour later.
import { act, renderPage, screen, waitFor, within } from '@app/testing';
import { accountPref } from '@core';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { beingMade, offersTour, opensTour, parsePrefs, type Prefs } from './logic';
import './testWaits';
import { tourOpened } from './view';
import page from './page';
import strings from './strings.en.json';

describe('logic', () => {
  it('beingMade: the statuses of a computer that has not run yet, nothing else', () => {
    expect(['creating', 'claiming', 'copying', 'Claiming', 'provisioning', 'pending'].map(beingMade)).toEqual([true, true, true, true, true, true]);
    // Starting and restarting are an old computer's states too: never the sign of a new account.
    expect(['running', 'stopped', 'failed', 'starting', 'restarting', '', undefined, 3].map(beingMade)).toEqual([false, false, false, false, false, false, false, false]);
  });

  it('opensTour: an account session, not toured yet, its first computer being made, decided on read prefs', () => {
    const o = { prefsRead: true, shared: false, toured: false, firstMaking: true };
    expect(opensTour(o)).toBe(true);
    expect(opensTour({ ...o, shared: true })).toBe(false);
    expect(opensTour({ ...o, toured: true })).toBe(false);
    expect(opensTour({ ...o, firstMaking: false })).toBe(false);
    // The stored flags are not read yet (the store opens): they read as defaults, so nothing once-only is decided.
    expect(opensTour({ ...o, prefsRead: false })).toBe(false);
  });

  it('offersTour: an account session, not toured yet, its one computer already running', () => {
    const o = { prefsRead: true, shared: false, toured: false, introHidden: false, firstRunning: true };
    expect(offersTour(o)).toBe(true);
    expect(offersTour({ ...o, shared: true })).toBe(false);
    expect(offersTour({ ...o, toured: true })).toBe(false);
    expect(offersTour({ ...o, firstRunning: false })).toBe(false);
    // An account that hid the Welcome keeps it hidden: no offer.
    expect(offersTour({ ...o, introHidden: true })).toBe(false);
    // Hide and the toured flag are stored: until the store is read, no offer.
    expect(offersTour({ ...o, prefsRead: false })).toBe(false);
  });

  it('the toured flag is stored and read like the other flags', () => {
    expect(parsePrefs({ toured: true }).toured).toBe(true);
    expect(parsePrefs({ toured: 'yes' }).toured).toBeUndefined();
    expect(parsePrefs({}).toured).toBeUndefined();
  });
});

// Each renderPage starts with empty storage, so a later load is simulated: the reads answer late (slow fixtures), the
// stored flags are written before Home has its list, then the test waits until Home has drawn the list (Start something)
// and its effects ran.
const homePrefs = () => accountPref('hub_home_v1', parsePrefs);
async function loadWith(flags: Partial<Prefs>) {
  const view = await renderPage(page, { state: 'newAccount', realm: 'all', latency: 'slow' });
  expect(homePrefs().set({ ...homePrefs().get(), ...flags })).toBe(true);
  await screen.findByText(strings['actions.title'], undefined, { timeout: 10000 });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 50));
  });
  return view;
}

describe('rendered', () => {
  it('a first computer still being made: Home hands over to the tour, once per page load', async () => {
    tourOpened.now = false;
    const first = await renderPage(page, { state: 'firstMaking', realm: 'all' });
    await waitFor(() => expect(first.router.state.location.pathname).toBe('/onboarding'), { timeout: 10000 });
    first.unmount();
    // Back on Home in the same page load (Skip), even if the stored flag did not hold: Home stays.
    const again = await renderPage(page, { state: 'firstMaking', realm: 'all' });
    await screen.findAllByText(/atlas/, undefined, { timeout: 10000 });
    expect(again.router.state.location.pathname).toBe('/home');
  });

  it('one computer being made in a realm, viewed in that realm: Home stays (a realm view never hands over)', async () => {
    tourOpened.now = false;
    const { router } = await renderPage(page, { state: 'firstMaking' });
    await screen.findAllByText(/atlas/, undefined, { timeout: 10000 });
    expect(router.state.location.pathname).toBe('/home');
    expect(tourOpened.now).toBe(false);
  });

  // Realm usage leaves out computers with no realm, so in a single-realm view "one computer in all realms together"
  // does not prove a new account (an old account with no-realm computers making its first computer in a realm).
  // The rule therefore never reads the usage total: only the All-realms list counts.
  it('the hand-over and the offer are decided in the All-realms view only, never from realm usage', () => {
    const src = readFileSync(path.join(__dirname, 'data.ts'), 'utf8');
    expect(src).toMatch(/firstMaking: whole && all && rows\.length === 1 && beingMade\(rows\[0\]\?\.status\),/);
    expect(src).toMatch(/firstRunning: whole && all && rows\.length === 1 && rows\[0\]\?\.running === true,/);
  });

  it('a computer that runs: Home stays', async () => {
    const { router } = await renderPage(page, { state: 'newAccount' });
    await screen.findAllByText(/atlas/, undefined, { timeout: 10000 });
    expect(router.state.location.pathname).toBe('/home');
  });

  it('the first computer already runs and Home never opened the tour: Home stays, the Welcome shows with the tour marked, and toured is stored', async () => {
    const first = await renderPage(page, { state: 'newAccount', realm: 'all' });
    const link = await screen.findByRole('link', { name: strings['intro.tour'] }, { timeout: 10000 });
    expect(link.getAttribute('href')).toMatch(/onboarding/);
    expect(first.router.state.location.pathname).toBe('/home');
    // Marked: the tour is a button of its own weight, not a text link.
    expect(link.getAttribute('data-variant')).toBe('secondary');
    // Stored when shown: a later load reads it (next test).
    expect(homePrefs().get().toured).toBe(true);
  });

  it('a later load of that account (toured stored): no Welcome by itself; the same load without the flag offers it', async () => {
    const control = await loadWith({});
    expect(screen.getByRole('link', { name: strings['intro.tour'] })).toBeTruthy();
    control.unmount();
    await loadWith({ toured: true });
    expect(screen.queryByText(strings['intro.lead'])).toBeNull();
    expect(screen.queryByRole('link', { name: strings['intro.tour'] })).toBeNull();
  });

  it('an account that hid the Welcome before gets no tour offer later: its Hide stands', async () => {
    await loadWith({ introHidden: true });
    expect(screen.queryByText(strings['intro.lead'])).toBeNull();
    expect(screen.queryByRole('link', { name: strings['intro.tour'] })).toBeNull();
  });

  it('the Welcome is a short entry: the headline, Open, Take the tour and Hide; the explainer and the step lists are in the tour', async () => {
    await renderPage(page, { state: 'newAccount', path: '/home?intro=1' });
    await screen.findByRole('link', { name: strings['intro.tour'] }, { timeout: 10000 });
    const panel = document.querySelector('[aria-labelledby="home-welcome-lead"]') as HTMLElement;
    expect(within(panel).getByText(strings['intro.lead'])).toBeTruthy();
    expect(within(panel).getAllByRole('link').map((a) => a.textContent?.trim())).toEqual([strings['intro.openShort'], strings['intro.tour']]);
    expect(within(panel).getAllByRole('button', { name: strings['intro.hideLabel'] }).length).toBeGreaterThan(0);
    expect(within(panel).queryByText(strings['intro.title'])).toBeNull();
    expect(within(panel).queryByRole('heading')).toBeNull();
    expect(within(panel).queryByRole('list')).toBeNull();
  });

  it('the Welcome links the tour', async () => {
    await renderPage(page, { state: 'newAccount', path: '/home?intro=1' });
    const link = await screen.findByRole('link', { name: strings['intro.tour'] }, { timeout: 10000 });
    expect(link.getAttribute('href')).toMatch(/onboarding/);
  });
});
