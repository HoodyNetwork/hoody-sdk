// A disabled Switch that says why (`disabledReason`, soft-disabled as Button's): it keeps its focus, reads disabled to
// assistive tech, names the reason as its description and tooltip, and no press, click or key changes it.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { boot } from '@core/test/env';
import { Switch } from './fields';

const REASON = 'Waiting until the last action is settled.';

beforeEach(() => {
  boot();
});

describe('Switch disabledReason', () => {
  it('stays focusable, reads disabled and names the reason as its description', async () => {
    const user = userEvent.setup();
    render(<Switch label="Start with the computer" isSelected={false} onChange={() => {}} isDisabled disabledReason={REASON} />);
    const sw = screen.getByRole('switch', { name: 'Start with the computer' });
    expect(sw).not.toBeDisabled();
    expect(sw).toHaveAttribute('aria-disabled', 'true');
    expect(sw).toHaveAccessibleDescription(REASON);
    await user.tab();
    expect(sw).toHaveFocus();
    expect(await screen.findByRole('tooltip')).toHaveTextContent(REASON);
  });

  it('keeps a description the caller names, then adds the reason', () => {
    render(
      <>
        <p id="wait">The banner above says why.</p>
        <Switch label="Paused" aria-describedby="wait" isSelected={false} onChange={() => {}} isDisabled disabledReason={REASON} />
      </>,
    );
    expect(screen.getByRole('switch', { name: 'Paused' })).toHaveAccessibleDescription(`The banner above says why. ${REASON}`);
  });

  it('no click, label press or key changes it, and a click shows the reason', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    function Host() {
      const [on, setOn] = useState(false);
      return (
        <Switch
          label="Start with the computer"
          isSelected={on}
          onChange={(v) => {
            onChange(v);
            setOn(v);
          }}
          isDisabled
          disabledReason={REASON}
        />
      );
    }
    render(<Host />);
    const sw = screen.getByRole('switch', { name: 'Start with the computer' });
    await user.click(sw);
    await user.click(screen.getByText('Start with the computer'));
    sw.focus();
    await user.keyboard(' ');
    await user.keyboard('{Enter}');
    expect(onChange).not.toHaveBeenCalled();
    expect(sw).not.toBeChecked();
    await user.click(sw);
    expect(await screen.findByRole('tooltip')).toHaveTextContent(REASON);
  });

  it('without a reason it is disabled as before; a reason alone (not disabled) changes nothing', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Switch label="Paused" isSelected={false} onChange={() => {}} isDisabled />);
    expect(screen.getByRole('switch', { name: 'Paused' })).toBeDisabled();
    const onChange = vi.fn();
    rerender(<Switch label="Paused" isSelected={false} onChange={onChange} disabledReason={REASON} />);
    const sw = screen.getByRole('switch', { name: 'Paused' });
    expect(sw).not.toHaveAttribute('aria-disabled');
    expect(sw).not.toHaveAccessibleDescription(REASON);
    await user.click(sw);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('turns back on in place: the same element, no aria-disabled, its changes go through', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = render(<Switch label="Paused" isSelected={false} onChange={onChange} isDisabled disabledReason={REASON} />);
    const before = screen.getByRole('switch', { name: 'Paused' });
    rerender(<Switch label="Paused" isSelected={false} onChange={onChange} />);
    const sw = screen.getByRole('switch', { name: 'Paused' });
    expect(sw).toBe(before);
    expect(sw).not.toHaveAttribute('aria-disabled');
    expect(sw.closest('label')).not.toHaveAttribute('data-disabled');
    await user.click(sw);
    expect(onChange).toHaveBeenCalledWith(true);
  });
});
