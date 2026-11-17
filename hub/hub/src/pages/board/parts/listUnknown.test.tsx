// Vitest: the computer list in Add a program and in Connect over SSH says what it knows. Loading while the first read
// is out; "could not be read" with Try again when the last read failed (also over an empty list an earlier read
// left: that zero is not current); "no computers" (or "none is running") only from a read that answered.
import { bootFixtureCore, CoreQueryProvider } from '@core';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BoardComputer } from '../computers';
import { Picker, type PickerProps } from './Picker';
import { resetSshAttempts, SshForm } from './SshForm';

// A running computer's step also draws the apps launcher, which reads the page's router. These tests render the
// Picker alone and are about its own rows: the launcher never loads here (its place shows the loading rows).
vi.mock('../../apps/links', async (orig) => ({ ...(await orig<object>()), loadLauncher: () => new Promise<never>(() => {}) }));

const pc = (id: string, name: string, status = 'running') => ({ id, name, project_id: 'p1', server_name: 'n12', status }) as BoardComputer;
const stopped = pc('c0000000000000000000c003', 'cedar', 'stopped');
const NONE = /No computers in Personal/;
const FAILED = 'The computers could not be read.';
const wrap = (n: ReactNode) => <CoreQueryProvider>{n}</CoreQueryProvider>;
const picker = (p: Partial<PickerProps>) => wrap(
  <Picker computers={null} failed={false} onRetry={() => {}} recents={[]} known={[]} onBoard={[]} realmName="Personal" onComputers={null} onPick={() => {}} {...p} />,
);
const ssh = (p: { computers: readonly BoardComputer[] | null; failed: boolean; onRetry?: () => void }) =>
  <SshForm taken={() => []} onPick={vi.fn()} onBack={vi.fn()} onRetry={p.onRetry ?? (() => {})} {...p} />;

beforeEach(() => { bootFixtureCore({ rules: [] }); resetSshAttempts(); });
afterEach(() => { cleanup(); });

describe('Add a program: the computer list', () => {
  it('loading: no "no computers" while the first read is out', () => {
    render(picker({ computers: null, failed: false }));
    expect(screen.queryByText(NONE)).toBeNull();
    expect(screen.queryByText(FAILED)).toBeNull();
  });

  it('a failed first read: could not be read, and Try again reads again', async () => {
    const onRetry = vi.fn();
    render(picker({ computers: null, failed: true, onRetry }));
    expect(await screen.findByText(FAILED)).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(NONE)).toBeNull();
  });

  it('an empty list from an earlier read with the last read failed: could not be read, never "no computers"', async () => {
    const onRetry = vi.fn();
    render(picker({ computers: [], failed: true, onRetry }));
    expect(await screen.findByText(FAILED)).toBeInTheDocument();
    expect(screen.queryByText(NONE)).toBeNull();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('a read that answered with no computers: no computers in the realm', async () => {
    render(picker({ computers: [], failed: false }));
    expect(await screen.findByText(NONE)).toBeInTheDocument();
    expect(screen.queryByText(FAILED)).toBeNull();
  });

  it('Connect over SSH from the picker carries the failed read: could not be read, Try again reads again', async () => {
    const onRetry = vi.fn();
    render(picker({ computers: null, failed: true, onRetry, start: { step: 'ssh' } }));
    expect((await screen.findAllByText(FAILED)).length).toBeGreaterThan(0);
    expect(screen.queryByText('Reading your computers…')).toBeNull();
    await userEvent.setup().click(screen.getAllByRole('button', { name: 'Try again' })[0]!);
    expect(onRetry).toHaveBeenCalled();
  });
});

describe('Connect over SSH: the computer list', () => {
  it('loading: reading your computers', () => {
    render(ssh({ computers: null, failed: false }));
    expect(screen.getByText('Reading your computers…')).toBeInTheDocument();
    expect(screen.queryByText(/none is running/)).toBeNull();
  });

  it('a failed first read: could not be read with Try again, not reading forever', async () => {
    const onRetry = vi.fn();
    render(ssh({ computers: null, failed: true, onRetry }));
    expect(screen.getByText(FAILED)).toBeInTheDocument();
    expect(screen.queryByText('Reading your computers…')).toBeNull();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('a list from an earlier read with none running and the last read failed: could not be read, never "none is running"', () => {
    for (const computers of [[], [stopped]]) {
      cleanup();
      render(ssh({ computers, failed: true }));
      expect(screen.getByText(FAILED)).toBeInTheDocument();
      expect(screen.queryByText(/none is running/)).toBeNull();
    }
  });

  it('a read that answered with none running: none is running', () => {
    for (const computers of [[], [stopped]]) {
      cleanup();
      render(ssh({ computers, failed: false }));
      expect(screen.getByText(/none is running/)).toBeInTheDocument();
      expect(screen.queryByText(FAILED)).toBeNull();
    }
  });
});
