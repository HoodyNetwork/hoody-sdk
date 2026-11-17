// Vitest: a Band about a picker list ("Pick at least one computer") takes the PickerPanel as its `attach`: the list
// (the group or radiogroup) is described by the band's sentence.
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Band } from '../states/Band';
import { PickerPanel } from './PickerPanel';

const ITEMS = [
  { id: 'a', label: 'alpha' },
  { id: 'b', label: 'bravo' },
];

describe('PickerPanel aria-describedby', () => {
  it('a Band attached to a multi picker describes its group', () => {
    render(<Band tone="warn" attach={<PickerPanel label="Computers" items={ITEMS} mode="multi" value={[]} onChange={() => {}} />}>Pick at least one computer.</Band>);
    expect(screen.getByRole('group', { name: 'Computers' })).toHaveAccessibleDescription('Pick at least one computer.');
  });

  it('a single picker passes it to its radiogroup', () => {
    render(
      <>
        <p id="why">Only one agent at a time.</p>
        <PickerPanel label="Agent" items={ITEMS} mode="single" value={[]} onChange={() => {}} aria-describedby="why" />
      </>,
    );
    expect(screen.getByRole('radiogroup', { name: 'Agent' })).toHaveAccessibleDescription('Only one agent at a time.');
  });
});
