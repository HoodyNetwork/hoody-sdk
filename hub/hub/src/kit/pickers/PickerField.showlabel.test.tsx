// Vitest: PickerField `showLabel={false}` hides its label visually with the kit's one visually-hidden recipe (SR_ONLY);
// the label still names the trigger. A picker inside a SettingRow, whose label column already names it, then shows its
// name once.
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SR_ONLY } from '../controls/SrOnly';
import { PickerField, usePickerField } from './PickerField';

function Trigger() {
  const f = usePickerField();
  return <button type="button" aria-labelledby={f?.labelId}>Personal</button>;
}

describe('PickerField label', () => {
  it('showLabel={false}: the label wears the visually-hidden class and still names the trigger', () => {
    render(
      <PickerField label="Project" showLabel={false}>
        <Trigger />
      </PickerField>,
    );
    const label = screen.getByText('Project');
    expect(label.classList.contains(SR_ONLY)).toBe(true);
    expect(label.className).not.toMatch(/undefined/);
    expect(screen.getByRole('button', { name: 'Project' })).toBeTruthy();
  });

  it('by default the label shows (not the hidden class)', () => {
    render(
      <PickerField label="Project">
        <Trigger />
      </PickerField>,
    );
    expect(screen.getByText('Project').classList.contains(SR_ONLY)).toBe(false);
  });
});
