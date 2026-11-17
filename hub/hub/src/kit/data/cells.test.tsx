// Vitest: the kit's DataTable cells for a transfer's progress and for an
// outcome the Hub cannot tell. ProgressCell says the bytes in words (percent and "done of total" when the total is
// known, "done so far" when not, "Starting" before any byte) and draws a neutral Meter only beside a known total;
// progressFit measures those words plus the meter's room for a fit column. UnknownCell is the kit's "Outcome unknown"
// pill, and checkAgainAction is its inline "Check again" row action (a cell holds no buttons), "Checking…" and off
// while a check runs.
import { render, screen } from '@testing-library/react';
import { createColumnHelper } from '@tanstack/react-table';
import { describe, expect, it, vi } from 'vitest';
import { DataTable } from './DataTable';
import { checkAgainAction, ProgressCell, progressFit, progressWords, UnknownCell } from './cells';

vi.mock('../nav', () => ({ useSearchParam: () => [undefined, () => undefined] }));

const MB = 1024 * 1024; // formatBytes counts in binary units (kit/format.ts)

describe('progressWords', () => {
  it('a known total: percent, then done of total', () => {
    expect(progressWords({ done: 38 * MB, total: 50 * MB })).toBe('76% · 38 MB of 50 MB');
  });
  it('an unknown total: done so far, never a percent', () => {
    expect(progressWords({ done: 38 * MB, total: null })).toBe('38 MB so far');
    expect(progressWords({ done: 38 * MB })).not.toMatch(/%/);
  });
  it('no byte yet (none, or 0), with or without a total: Starting', () => {
    expect(progressWords({ done: null, total: 50 * MB })).toBe('Starting');
    expect(progressWords({ done: 0, total: 50 * MB })).toBe('Starting');
    expect(progressWords({ done: 0, total: null })).toBe('Starting');
  });
  it('a given percent wins and is never above 100', () => {
    expect(progressWords({ done: 49 * MB, total: 50 * MB, percent: 97.6 })).toMatch(/^97% /);
    expect(progressWords({ done: 60 * MB, total: 50 * MB })).toMatch(/^100% /);
  });
});

describe('ProgressCell', () => {
  it('a known total draws a neutral meter named by the item and its words', () => {
    render(<ProgressCell name="photos.zip" done={38 * MB} total={50 * MB} />);
    const m = screen.getByRole('meter', { name: 'photos.zip: 76% · 38 MB of 50 MB' });
    expect(m).toHaveAttribute('aria-valuenow', '76');
    expect(screen.getByText('76% · 38 MB of 50 MB')).toBeInTheDocument();
  });
  it('0 bytes of a known total: Starting, and no meter yet', () => {
    const { container } = render(<ProgressCell name="photos.zip" done={0} total={50 * MB} />);
    expect(container.querySelector('[role="meter"]')).toBeNull();
    expect(screen.getByText('Starting')).toBeInTheDocument();
  });
  it('an unknown total shows the words alone', () => {
    const { container } = render(<ProgressCell name="photos.zip" done={38 * MB} total={null} />);
    expect(container.querySelector('[role="meter"]')).toBeNull();
    expect(screen.getByText('38 MB so far')).toBeInTheDocument();
  });
  it('progressFit measures the words and leaves room for the meter only with a total', () => {
    const fit = progressFit((r: { d: number; t: number | null }) => ({ done: r.d, total: r.t }));
    expect(fit.fitText({ d: 38 * MB, t: 50 * MB })).toBe('76% · 38 MB of 50 MB');
    expect(fit.fitPad).toBeGreaterThanOrEqual(60);
  });
});

describe('outcome unknown as a row', () => {
  it('UnknownCell is the kit words in a pill', () => {
    render(<UnknownCell />);
    expect(screen.getByText('Outcome unknown')).toBeInTheDocument();
  });
  it('checkAgainAction is an inline Check again, and Checking… and off while it runs', () => {
    const onCheck = vi.fn();
    const a = checkAgainAction({ onCheck });
    expect(a).toMatchObject({ id: 'check-again', label: 'Check again', inline: true });
    a.onAction();
    expect(onCheck).toHaveBeenCalledTimes(1);
    const busy = checkAgainAction({ onCheck, busy: true });
    expect(busy).toMatchObject({ label: 'Checking…', isDisabled: true });
    expect(busy.disabledReason).toBeTruthy();
  });
  it("in a DataTable row it is the row's inline button beside the pill", () => {
    interface R { id: string; name: string }
    const col = createColumnHelper<R>();
    const onCheck = vi.fn();
    render(
      <DataTable
        label="Transfers"
        presentation="table"
        data={[{ id: 'a', name: 'photos.zip' }]}
        columns={[col.accessor('name', { header: 'Item', meta: { pinned: true } }), col.display({ id: 'state', header: 'State', cell: () => <UnknownCell /> })]}
        getRowId={(r) => r.id}
        actions={() => [checkAgainAction({ onCheck })]}
      />,
    );
    screen.getByRole('button', { name: 'Check again' }).click();
    expect(onCheck).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Outcome unknown')).toBeInTheDocument();
  });
});
