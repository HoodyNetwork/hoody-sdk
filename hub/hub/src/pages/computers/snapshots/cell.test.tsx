// The Computers list cell: the snapshot count and a shortcut to the computer's Backups tab. It only navigates.
import { bootFixtureCore, fixtureSession } from '@core';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Computer } from '../types';
import { SnapshotsCell } from './SnapshotsCell';

const go = vi.fn();
vi.mock('@kit', async (orig) => ({ ...(await orig<Record<string, unknown>>()), useGo: () => go }));

const C = { id: 'c'.repeat(20) + 'ab12', name: 'atlas', project_id: 'p'.repeat(24), status: 'running' } as Computer;

afterEach(() => {
  cleanup();
  go.mockReset();
});

describe('snapshots cell', () => {
  it('shows the count and opens the Backups tab of that computer', async () => {
    bootFixtureCore({ rules: [] });
    render(<SnapshotsCell computer={{ ...C, snapshot_count: 3 } as Computer} />);
    expect(screen.getByText('3')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '3 snapshots of atlas: open them' }));
    expect(go).toHaveBeenCalledExactlyOnceWith('/computers?sel=atlas.ab12&tab=backups');
  });
  it('no count on the row, or no snapshots permission: nothing', () => {
    bootFixtureCore({ rules: [] });
    const { container, unmount } = render(<SnapshotsCell computer={C} />);
    expect(container).toBeEmptyDOMElement();
    unmount();
    bootFixtureCore({ rules: [fixtureSession({ kind: 'token', caps: ['computers.read'] })] });
    const again = render(<SnapshotsCell computer={{ ...C, snapshot_count: 2 } as Computer} />);
    expect(again.container).toBeEmptyDOMElement();
  });
});
