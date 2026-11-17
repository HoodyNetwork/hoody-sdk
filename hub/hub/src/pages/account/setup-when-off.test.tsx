// Vitest: Set up two-step sign-in opens only while two-step sign-in reads off. Before, the
// link `?sheet=setup` (the palette's "Turn on two-step sign-in", links.twoStep) opened the set-up's password step on an
// account whose two-step was on: the server refuses a new set-up then, and the person got "This didn't go through".
// An unknown status (read failed, or an answer missing a field) opens nothing either. Turn off is never withheld for
// the status: its link opens while the status is unknown.
import { bootFixtureCore } from '@core';
import { renderPage, screen } from '@app/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { locks } from './parts/locks';
import page from './page';
import strings from './strings.en.json';

beforeEach(() => {
  bootFixtureCore();
  locks.clear();
});

const setupDrawer = () => screen.queryByRole('dialog', { name: strings['2fa.setupTitle'] });
const wait = { timeout: 8000 };

describe('Set up two-step sign-in, by its link', () => {
  it('two-step on: no Set up drawer (the section has read the status first)', async () => {
    await renderPage(page, { path: '/account?sheet=setup' });
    expect((await screen.findAllByRole('button', { name: strings['2fa.turnOff'] }, wait)).length).toBeGreaterThan(0);
    expect(setupDrawer()).not.toBeInTheDocument();
    expect(screen.queryAllByText(strings['2fa.step1of2'])).toHaveLength(0);
  });

  it('status unreadable: no Set up drawer', async () => {
    await renderPage(page, { state: 'twofa-unreadable', path: '/account?sheet=setup' });
    expect((await screen.findAllByText(strings['2fa.unreadLine'], {}, wait)).length).toBeGreaterThan(0);
    expect(setupDrawer()).not.toBeInTheDocument();
  });

  it('status unreadable: Turn off still opens by its link', async () => {
    await renderPage(page, { state: 'twofa-unreadable', path: '/account?sheet=off' });
    expect(await screen.findByRole('dialog', { name: strings['2fa.offTitle'] }, wait)).toBeInTheDocument();
  });

  it.each(['twofa-off', 'twofa-unfinished'])('positive control, state "%s": Set up opens on its first step', async (state) => {
    await renderPage(page, { state, path: '/account?sheet=setup' });
    expect(await screen.findByRole('dialog', { name: strings['2fa.setupTitle'] }, wait)).toBeInTheDocument();
    expect(screen.getAllByText(strings['2fa.step1of2']).length).toBeGreaterThan(0);
  });
});
