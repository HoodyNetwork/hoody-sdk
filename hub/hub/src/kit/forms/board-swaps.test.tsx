// Vitest: two pieces the board options panel needs to draw its rows as SettingRows. (1) A row passes `data-*` attributes
// onto its row element (the panel finds, scrolls to and focuses a row by data-opt), in a group, alone and as a one-row
// group. (2) ColorPicker `labelHidden`: the label still names the swatches, but is not drawn (the row's label column
// names the field).
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SR_ONLY } from '../controls/SrOnly';
import { ColorPicker } from './ColorPicker';
import { SettingGroup } from './SettingGroup';
import { SettingRow } from './SettingRow';

describe('SettingRow data-*', () => {
  it('in a group the data attribute sits on the row element', () => {
    const { container } = render(
      <SettingGroup variant="field" label="Options">
        <SettingRow label="Font size" data-opt="fontSize">
          <input aria-label="Font size" />
        </SettingRow>
      </SettingGroup>,
    );
    const row = container.querySelector('[data-opt="fontSize"]');
    expect(row).not.toBeNull();
    expect(row).toHaveAttribute('data-sg-row');
  });

  it('a lone row (legacy) and a one-row group carry it too', () => {
    const { container } = render(
      <>
        <SettingRow label="Theme" data-opt="theme">
          <input aria-label="Theme" />
        </SettingRow>
        <SettingRow label="Size" data-opt="size" reset={{ shown: false, label: 'Reset', onPress: () => {} }}>
          <input aria-label="Size" />
        </SettingRow>
      </>,
    );
    expect(container.querySelector('[data-opt="theme"]')).not.toBeNull();
    expect(container.querySelector('[data-opt="size"]')).toHaveAttribute('data-sg-row');
  });
});

describe('ColorPicker labelHidden', () => {
  it('the swatches keep their name; the label is screen-reader only', () => {
    render(<ColorPicker label="Background" labelHidden value="" onChange={() => {}} />);
    expect(screen.getByRole('radiogroup', { name: 'Background' })).toBeInTheDocument();
    expect(screen.getByText('Background')).toHaveClass(SR_ONLY);
  });
});
