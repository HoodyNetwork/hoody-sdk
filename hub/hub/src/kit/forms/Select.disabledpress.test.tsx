// A press on a disabled Select or Combobox must not cost the next one (controls/disabledPress.ts): the field is disabled,
// its button is clicked, the field is enabled with no press anywhere else, and the one click that follows opens the list.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { Combobox, Select } from './more';
import strings from '../strings.en.json';

const OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'on', label: 'On' },
];

describe('a click on a disabled field button, then one click once the field is enabled', () => {
  it('Select: the one click opens the list', async () => {
    const user = userEvent.setup();
    const draw = (off: boolean) => <Select label="Status" options={OPTIONS} value="all" onChange={() => undefined} isDisabled={off} />;
    const { rerender } = render(draw(true));
    const trigger = screen.getByRole('button', { name: /Status/ });
    expect(trigger).toBeDisabled();
    await user.click(trigger);
    expect(screen.queryByRole('listbox')).toBeNull();
    rerender(draw(false));
    expect(trigger).toBeEnabled();
    await user.click(trigger);
    expect(await screen.findByRole('listbox')).toBeInTheDocument();
  });

  it('Combobox: the one click on Show options opens the list', async () => {
    const user = userEvent.setup();
    const draw = (off: boolean) => <Combobox label="Status" options={OPTIONS} value={undefined} onChange={() => undefined} isDisabled={off} />;
    const { rerender } = render(draw(true));
    // React Aria names the button by its own label and the field's ("Show options Status").
    const show = screen.getByRole('button', { name: new RegExp(strings['combo.show']) });
    expect(show).toBeDisabled();
    await user.click(show);
    expect(screen.queryByRole('listbox')).toBeNull();
    rerender(draw(false));
    expect(show).toBeEnabled();
    await user.click(show);
    expect(await screen.findByRole('listbox')).toBeInTheDocument();
  });
});
