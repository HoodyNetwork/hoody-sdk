// ComputerPicker inside a PickerField (hub-files-ro's terms): the trigger is named by its own text (name, state) and
// then the visible label, through labelledby with no aria-label (WCAG 2.5.3 Label in Name: the name starts with what
// it shows); the field's description and error describe it, an error marks the trigger invalid (danger border), and the
// loading and failed trigger words stay as they are. Outside a field its own aria-label takes the field label's place.
import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ComputerPicker, type ComputerChoice } from './ComputerPicker';
import { PickerField } from './PickerField';
import strings from './ComputerPicker.strings.en.json';

const ROWS: ComputerChoice[] = [{ id: 'atlas', name: 'atlas', running: true, state: 'Running' }];
const noop = () => {};

describe('ComputerPicker in a PickerField', () => {
  it('is named by what it shows, then the visible label, through labelledby, with no aria-label', () => {
    render(
      <PickerField label="Send through">
        <ComputerPicker label="Computer" computers={ROWS} value="atlas" onChange={noop} />
      </PickerField>,
    );
    const b = screen.getByRole('button', { name: 'atlas Running Send through' });
    expect(b).not.toHaveAttribute('aria-label');
    expect(b.getAttribute('aria-labelledby')?.split(' ')[1]).toBe(screen.getByText('Send through').id);
  });

  it('the description, then the error, describe it', () => {
    render(
      <PickerField label="Send through" description="Messages leave from this computer" errorMessage="Pick a running computer">
        <ComputerPicker label="Computer" computers={ROWS} value="atlas" onChange={noop} />
      </PickerField>,
    );
    const b = screen.getByRole('button', { name: 'atlas Running Send through' });
    expect(b).toHaveAccessibleDescription('Messages leave from this computer Pick a running computer');
  });

  it('an error marks the trigger invalid, which the stylesheet draws as the danger border', () => {
    const { rerender } = render(
      <PickerField label="Send through">
        <ComputerPicker label="Computer" computers={ROWS} value="atlas" onChange={noop} />
      </PickerField>,
    );
    expect(screen.getByRole('button', { name: 'atlas Running Send through' })).not.toHaveAttribute('data-invalid');
    rerender(
      <PickerField label="Send through" errorMessage="Pick a running computer">
        <ComputerPicker label="Computer" computers={ROWS} value="atlas" onChange={noop} />
      </PickerField>,
    );
    expect(screen.getByRole('button', { name: 'atlas Running Send through' })).toHaveAttribute('data-invalid');
    const css = readFileSync(join(__dirname, '..', 'forms', 'fieldBox.module.css'), 'utf8');
    expect(css).toMatch(/\.box\[data-invalid\],[^{]*\{[^}]*var\(--hx-danger-fill\)/);
  });

  it('keeps the loading and failed trigger words inside a field', () => {
    const { rerender } = render(
      <PickerField label="Send through">
        <ComputerPicker label="Computer" computers={undefined} value={undefined} onChange={noop} />
      </PickerField>,
    );
    const b = () => screen.getByRole('button', { name: /^.+ Send through$/ });
    expect(b()).toHaveTextContent(strings.loading);
    expect(b()).toBeDisabled();
    rerender(
      <PickerField label="Send through">
        <ComputerPicker label="Computer" computers={undefined} value={undefined} onChange={noop} status={{ error: new Error('x') }} />
      </PickerField>,
    );
    expect(b()).toHaveTextContent(strings.failed);
    expect(b()).not.toBeDisabled();
  });

  it('outside a field is named by what it shows, then its own aria-label, and nothing describes it', () => {
    render(<ComputerPicker label="Computer" computers={ROWS} value="atlas" onChange={noop} />);
    const b = screen.getByRole('button', { name: 'atlas Running Computer' });
    expect(b).toHaveAttribute('aria-label', 'Computer');
    expect(b.getAttribute('aria-labelledby')?.split(' ')[1]).toBe(b.id);
    expect(b).not.toHaveAttribute('data-invalid');
    expect(b).not.toHaveAttribute('aria-describedby');
  });
});
