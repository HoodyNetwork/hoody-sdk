// Vitest: an attached Band sits under its field in the table look, the field
// names it as its description after its own, it is polite (never an alert while typing), and its wrap carries the tone
// the field's border reads.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { boot } from '@core/test/env';
import { TextButton } from '../controls/Link';
import { TextField } from '../forms/fields';
import { Band } from './Band';
import s from './Band.module.css';

beforeEach(() => {
  boot();
});

describe('Band attach', () => {
  it('the field takes the band as its description, after its own', () => {
    render(
      <>
        <p id="own">The port this rule opens.</p>
        <Band tone="warn" attach={<TextField aria-label="Port" aria-describedby="own" defaultValue="22" />} actions={<TextButton>Use 2222</TextButton>}>
          Port 22 is SSH.
        </Band>
      </>,
    );
    const field = screen.getByRole('textbox', { name: 'Port' });
    expect(field).toHaveAccessibleDescription(/The port this rule opens\.\s*Port 22 is SSH\./);
    const band = screen.getByRole('status');
    expect(field.compareDocumentPosition(band) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('is polite in every tone, drawn in the table look, and its wrap carries the tone', () => {
    const { container, rerender } = render(<Band tone="danger" attach={<TextField aria-label="Rule" />}>Locks you out.</Band>);
    expect(screen.queryByRole('alert')).toBeNull();
    const band = screen.getByRole('status');
    expect(band).toHaveClass(s.table as string, s.attach as string, s.danger as string);
    expect(band).not.toHaveClass(s.page as string);
    expect(container.querySelector('[data-band-attach]')).toHaveAttribute('data-band-attach', 'danger');
    expect(container.querySelector('[data-band-attach]')).toHaveClass(s.attachDanger as string);
    rerender(<Band tone="warn" attach={<TextField aria-label="Rule" />}>Risky.</Band>);
    expect(container.querySelector('[data-band-attach]')).toHaveAttribute('data-band-attach', 'warn');
    expect(container.querySelector('[data-band-attach]')).toHaveClass(s.attachWarn as string);
    expect(container.querySelector('[data-band-attach]')).not.toHaveClass(s.attachDanger as string);
    expect(screen.getByRole('textbox', { name: 'Rule' })).toHaveAccessibleDescription('Risky.');
  });

  // A warning that comes and goes with what is typed. With nothing to say, the band draws nothing and the field
  // names no description; when the warning comes, the same field (still focused, still typed into) takes it.
  it('with nothing to say it is the field alone, and the field keeps focus and typing when the warning comes', async () => {
    function Port() {
      const [v, setV] = useState('');
      return (
        <Band tone="warn" attach={<TextField aria-label="Port" value={v} onChange={setV} />}>
          {v.startsWith('54') ? 'Often a database.' : null}
        </Band>
      );
    }
    const { container } = render(<Port />);
    const field = screen.getByRole('textbox', { name: 'Port' });
    expect(screen.queryByRole('status')).toBeNull();
    expect(container.querySelector('[data-band-attach]')).toBeNull();
    expect(field).not.toHaveAttribute('aria-describedby');
    await userEvent.type(field, '5432');
    expect(screen.getByRole('textbox', { name: 'Port' })).toBe(field);
    expect(field).toHaveValue('5432');
    expect(field).toHaveFocus();
    expect(field).toHaveAccessibleDescription('Often a database.');
    expect(container.querySelector('[data-band-attach]')).toHaveAttribute('data-band-attach', 'warn');
    // and back: the warning goes, the same field stays focused with what was typed
    await userEvent.clear(field);
    await userEvent.type(field, '80');
    expect(screen.getByRole('textbox', { name: 'Port' })).toBe(field);
    expect(field).toHaveValue('80');
    expect(field).toHaveFocus();
    expect(field).not.toHaveAttribute('aria-describedby');
    expect(container.querySelector('[data-band-attach]')).toBeNull();
  });

  // A close the caller asked for is something to say: the band still draws it, with no sentence.
  it('an attached band with only a close still draws the close', async () => {
    const closed = vi.fn();
    render(<Band tone="warn" attach={<TextField aria-label="Port" />} onDismiss={closed} />);
    await userEvent.click(screen.getByRole('button'));
    expect(closed).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('textbox', { name: 'Port' })).toHaveAttribute('aria-describedby');
  });

  // Baseline guard: a Band without attach is unchanged.
  it('a band with no field keeps its shape: no wrap, alert for a warning', () => {
    const { container } = render(<Band tone="warn">Stale.</Band>);
    expect(container.querySelector('[data-band-attach]')).toBeNull();
    expect(screen.getByRole('alert')).not.toHaveAttribute('id');
  });
});

// The field's border reads the tone from a custom property the wrap's tone class sets (no attribute-value selector:
// kit modules stay quote-free). Pinned on the CSS so the hand-off cannot fall apart on either side.
describe('Band attach border hand-off', () => {
  it('Band sets --field-attach-line per tone and the field box reads it at rest and under the pointer', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const band = readFileSync(join(__dirname, 'Band.module.css'), 'utf8');
    const box = readFileSync(join(__dirname, '..', 'forms', 'fieldBox.module.css'), 'utf8');
    expect(band).toMatch(/\.attachWarn \{\s*--field-attach-line: var\(--hx-warn-fill\);/);
    expect(band).toMatch(/\.attachDanger \{\s*--field-attach-line: var\(--hx-danger-fill\);/);
    expect(box).toMatch(/\.box \{[^}]*border: var\(--bw\) solid var\(--field-attach-line, var\(--ctl-line-field\)\);/);
    expect(box).toMatch(/\.box\[data-hovered\] \{[^}]*border-color: var\(--field-attach-line, var\(--field-line-hover\)\);/);
    // An invalid field keeps the danger border: its rule comes after and sets the colour outright.
    expect(box.indexOf('.box[data-invalid]')).toBeGreaterThan(box.indexOf('.box[data-hovered]'));
  });
});
