// A press on a picker trigger that is still loading must not cost the next one (controls/disabledPress.ts): the trigger
// is disabled while its rows load, clicked, enabled when the rows arrive with no press anywhere else, and the one click
// that follows opens the panel.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ComputerPicker, type ComputerChoice } from './ComputerPicker';

const ROWS: ComputerChoice[] = [
  { id: 'atlas', name: 'atlas', realm: { name: 'Personal', color: 'teal' }, running: true, state: 'Running' },
  { id: 'borealis', name: 'borealis', realm: { name: 'Work' }, running: false, state: 'Stopped' },
];
// The kit names the trigger by what it shows (the loading or placeholder words), then its label.
const trigger = () => screen.getByRole('button', { name: /^.+ Computer for the left pane$/ });

describe('ComputerPicker: a click while its rows load, then one click once they are in', () => {
  it('the one click opens the panel', async () => {
    const user = userEvent.setup();
    const draw = (computers: ComputerChoice[] | undefined) => <ComputerPicker label="Computer for the left pane" computers={computers} value={undefined} onChange={() => undefined} />;
    const { rerender } = render(draw(undefined));
    const loading = trigger();
    expect(loading).toBeDisabled();
    await user.click(loading);
    expect(screen.queryByRole('dialog')).toBeNull();
    rerender(draw(ROWS));
    expect(trigger()).toBe(loading);
    expect(loading).toBeEnabled();
    await user.click(loading);
    expect(await screen.findByRole('dialog', { name: 'Computer for the left pane' })).toBeInTheDocument();
  });
});
