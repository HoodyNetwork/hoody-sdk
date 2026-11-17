// A setting row locks on the kind its outcome line shows: a failed outcome whose error facts say pending (the change may
// have gone through) reads pending on the line, so the control locks, the actions and reset hide (nothing can be sent
// again), and a row that goes away leaves the Check again toast, as for a plain pending outcome. Group rows, switch rows
// and the legacy row alike.
import { act, render, screen } from '@testing-library/react';
import { type ReactNode, useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorInfo } from '@core';
import { boot } from '@core/test/env';
import { Button } from '../controls/Button';
import { SettingGroup, SettingSwitch } from './SettingGroup';
import { SettingRow } from './SettingRow';

const toasts = vi.hoisted(() => [] as unknown[]);
vi.mock('../states/Toast', () => ({
  showToast: (c: unknown) => {
    toasts.push(c);
    return 'k';
  },
  closeToast: () => undefined,
}));

beforeEach(async () => {
  await new Promise((r) => setTimeout(r, 5));
  boot();
  toasts.length = 0;
});

const facts = () => errorInfo({ pending: true, status: 502 });
const check = () => Promise.resolve(true);
const action = <Button size="sm" onPress={() => undefined}>Edit</Button>;

describe('setting rows: pending facts under a failed outcome', () => {
  it('a switch row: the line reads pending and the switch is locked', () => {
    render(<SettingSwitch label="Thinking" isSelected onChange={() => {}} outcome="failed" error={facts()} onCheck={check} />);
    expect(document.querySelector('[data-outcome="pending"]')).not.toBeNull();
    expect(screen.getByRole('switch')).toBeDisabled();
  });

  it('a group row: actions and reset hidden', () => {
    render(
      <SettingGroup label="Model">
        <SettingRow label="Default model" outcome="failed" error={facts()} onCheck={check} actions={action} reset={{ shown: true, label: 'Reset model', onPress: () => undefined }}>
          claude
        </SettingRow>
      </SettingGroup>,
    );
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
    expect(document.querySelector('[data-sg-reset="shown"]')).toBeNull();
  });

  it('the legacy row: actions hidden', () => {
    render(
      <SettingRow label="Default model" outcome="failed" error={facts()} onCheck={check} actions={action}>
        claude
      </SettingRow>,
    );
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
  });

  it('control: a definite failure keeps the actions and the switch live', () => {
    render(
      <SettingGroup label="Model">
        <SettingRow label="Default model" outcome="failed" error={errorInfo({ status: 400 })} onCheck={check} actions={action}>
          claude
        </SettingRow>
        <SettingSwitch label="Thinking" isSelected onChange={() => {}} outcome="failed" error={errorInfo({ status: 400 })} />
      </SettingGroup>,
    );
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(screen.getByRole('switch')).not.toBeDisabled();
  });

  it.each([
    ['in a group', (row: ReactNode) => <SettingGroup label="Model">{row}</SettingGroup>],
    ['the legacy row', (row: ReactNode) => row],
  ] as const)('%s that goes away leaves the Check again toast', async (_, wrap) => {
    function Host() {
      const [shown, setShown] = useState(true);
      return (
        <>
          {shown &&
            wrap(
              <SettingRow label="Default model" outcome="failed" error={facts()} onCheck={check}>
                claude
              </SettingRow>,
            )}
          <button type="button" onClick={() => setShown(false)}>
            leave
          </button>
        </>
      );
    }
    render(<Host />);
    await act(async () => screen.getByText('leave').click());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5));
    });
    expect(toasts).toHaveLength(1);
  });
});
