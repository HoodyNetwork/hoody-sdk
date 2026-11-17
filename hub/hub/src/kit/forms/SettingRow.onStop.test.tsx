// Vitest: Stop tracking on a setting row's pending outcome (`onStop`). While the row's
// outcome is pending the outcome line offers Check again, then Stop tracking (OutcomeBanner's order); the page has asked
// first in its own words, so the kit opens no second warning. Absent = no button; any other kind shows none.
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { OutcomeKind } from '../outcome';
import { SettingGroup, SettingSwitch } from './SettingGroup';
import { SettingRow } from './SettingRow';

const check = () => Promise.resolve();
const line = () => document.querySelector('[data-outcome]') as HTMLElement;
const lineButtons = () => within(line()).getAllByRole('button').map((b) => b.textContent?.trim());

describe('SettingRow onStop', () => {
  it('in a group: Check again, then Stop tracking, on the outcome line; a press calls onStop once and asks nothing', async () => {
    const onStop = vi.fn();
    render(
      <SettingGroup label="Model">
        <SettingRow label="Default model" outcome="pending" onCheck={check} onStop={onStop}>
          claude
        </SettingRow>
      </SettingGroup>,
    );
    const names = lineButtons();
    const at = names.indexOf('Stop tracking');
    expect(at).toBeGreaterThan(-1);
    expect(names.indexOf('Check again')).toBeLessThan(at);
    expect(names.indexOf('Check again')).toBeGreaterThan(-1);
    await userEvent.click(within(line()).getByRole('button', { name: 'Stop tracking' }));
    expect(onStop).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('outside a group (the legacy row) the same', async () => {
    const onStop = vi.fn();
    render(
      <SettingRow label="Default model" outcome="pending" onCheck={check} onStop={onStop}>
        claude
      </SettingRow>,
    );
    await userEvent.click(within(line()).getByRole('button', { name: 'Stop tracking' }));
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it('a switch setting the same', () => {
    render(<SettingSwitch label="Thinking" isSelected onChange={() => {}} outcome="pending" onCheck={check} onStop={() => {}} />);
    expect(within(line()).getByRole('button', { name: 'Stop tracking' })).toBeInTheDocument();
  });

  it('absent onStop: no Stop tracking (a request of the change may still be out)', () => {
    render(
      <SettingGroup label="Model">
        <SettingRow label="Default model" outcome="pending" onCheck={check}>
          claude
        </SettingRow>
      </SettingGroup>,
    );
    expect(within(line()).queryByRole('button', { name: 'Stop tracking' })).toBeNull();
  });

  for (const kind of ['failed', 'not_sent', 'stale'] as OutcomeKind[]) {
    it(`${kind}: no Stop tracking`, () => {
      render(
        <SettingGroup label="Model">
          <SettingRow label="Default model" outcome={kind} onCheck={check} onStop={() => {}}>
            claude
          </SettingRow>
        </SettingGroup>,
      );
      expect(line()).not.toBeNull();
      expect(screen.queryByRole('button', { name: 'Stop tracking' })).toBeNull();
    });
  }
});
