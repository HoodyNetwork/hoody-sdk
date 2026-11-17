// Item 99: the picker's Browser session step offers "New browser with options" on a running computer, and its form
// goes back to that step. A stopped computer, or a page that opens one program only, is not offered it.
import { bootFixtureCore, CoreQueryProvider } from '@core';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BoardComputer } from '../computers';
import type { TileRef } from '../model/boards';
import { Picker, type PickerProps } from './Picker';

// A running computer's step also draws the apps launcher, which reads the page's router. These tests render the
// Picker alone and are about its own rows: the launcher never loads here (its place shows the loading rows).
vi.mock('../../apps/links', async (orig) => ({ ...(await orig<object>()), loadLauncher: () => new Promise<never>(() => {}) }));

const pc = (id: string, name: string, status = 'running') => ({ id, name, project_id: 'p1', server_name: 'n12', status }) as BoardComputer;
const atlas = pc('c1', 'atlas');
const cedar = pc('c3', 'cedar', 'stopped');
const ref = (session: number): TileRef => ({ project: 'p1', computer: 'c1', program: 'browser', session });
const picker = (p: Partial<PickerProps>) => (
  <CoreQueryProvider>
    <Picker computers={[atlas, cedar]} failed={false} onRetry={() => {}} recents={[]} known={[ref(1), ref(2)]} onBoard={[]} realmName="Personal" onComputers={null} onPick={() => {}} {...p} />
  </CoreQueryProvider>
);
const NEW = /^New browser with options/;
// The sessions step is a card of tiles (grid rows); a one-program page keeps its list of options.
const newRow = () => screen.queryByRole('row', { name: NEW }) ?? screen.queryByRole('option', { name: NEW });

beforeEach(() => { bootFixtureCore({ rules: [] }); });
afterEach(() => { cleanup(); });

describe('Picker: New browser with options', () => {
  it('a running computer: offered after New session; its form starts the next free number and Back returns to the sessions', async () => {
    const user = userEvent.setup();
    render(picker({ start: { step: 'session', computer: 'c1', program: 'browser' } }));
    const names = screen.getAllByRole('row').map((o) => o.getAttribute('aria-label') ?? '');
    expect(names.findIndex((n) => NEW.test(n))).toBe(names.findIndex((n) => n.startsWith('New session')) + 1);
    await user.click(screen.getByRole('row', { name: NEW }));
    expect(screen.getByRole('button', { name: 'Start browser-3' })).toBeTruthy();
    expect(screen.getByText('Browser options', { selector: '[aria-current="step"]' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('row', { name: NEW })).toBeTruthy();
  });

  it('a stopped computer or a one-program page: not offered', () => {
    const v = render(picker({ start: { step: 'session', computer: 'c3', program: 'browser' } }));
    expect(screen.getByRole('row', { name: /^New session/ })).toBeTruthy();
    expect(newRow()).toBeNull();
    v.unmount();
    render(picker({ programsOnly: true, start: { step: 'session', computer: 'c1', program: 'browser' } }));
    expect(screen.getByRole('option', { name: /^New session/ })).toBeTruthy();
    expect(newRow()).toBeNull();
  });

  it('browser-7500 held with lower numbers free: still offered, and the form takes the lowest free one', async () => {
    const user = userEvent.setup();
    render(picker({ known: [ref(1), ref(7500)], start: { step: 'session', computer: 'c1', program: 'browser' } }));
    await user.click(screen.getByRole('row', { name: NEW }));
    expect(screen.getByRole('button', { name: 'Start browser-2' })).toBeTruthy();
  });

  it('a terminal\'s sessions: not offered', () => {
    render(picker({ start: { step: 'session', computer: 'c1', program: 'terminal' } }));
    expect(screen.getByRole('row', { name: /^New session/ })).toBeTruthy();
    expect(newRow()).toBeNull();
  });
});
