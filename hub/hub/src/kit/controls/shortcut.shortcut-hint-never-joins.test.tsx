// A button's label never carries its keyboard-shortcut hint. The hint stays a separate badge
// beside the label, hidden from the button's name; the shortcut reaches assistive tech through aria-keyshortcuts.
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Button } from './Button';
import { ariaKeyshortcuts } from './Kbd';

describe('the shortcut hint never joins the button name', () => {
  for (const variant of ['primary', 'secondary', 'ghost'] as const) {
    it(`${variant}: named by its label alone, the shortcut in aria-keyshortcuts, the badge beside the label`, () => {
      render(
        <Button variant={variant} shortcut="N">
          Add a program
        </Button>,
      );
      const btn = screen.getByRole('button', { name: 'Add a program' });
      expect(btn).toHaveAttribute('aria-keyshortcuts', 'N');
      const badge = btn.querySelector('kbd');
      expect(badge).not.toBeNull();
      expect(badge!.closest('[aria-hidden="true"]')).not.toBeNull();
      expect(badge!.closest('[class*="label"]')).toBeNull();
    });
  }

  it('Mod names the platform key, and the caller’s own aria-keyshortcuts wins', () => {
    render(
      <>
        <Button shortcut="Mod+J">Open Ask</Button>
        <Button shortcut="Mod+J" aria-keyshortcuts="Control+Shift+J">
          Own keys
        </Button>
      </>,
    );
    expect(screen.getByRole('button', { name: 'Open Ask' })).toHaveAttribute('aria-keyshortcuts', 'Control+J');
    expect(screen.getByRole('button', { name: 'Own keys' })).toHaveAttribute('aria-keyshortcuts', 'Control+Shift+J');
  });

  it('an empty aria-keyshortcuts keeps a contextual hint visible but unannounced', () => {
    // A hint whose key works elsewhere (Escape from a table row, Mod+S from the editor) must not be advertised here.
    render(
      <Button shortcut="Esc" aria-keyshortcuts="">
        Clear
      </Button>,
    );
    const b = screen.getByRole('button', { name: 'Clear' });
    expect(b).not.toHaveAttribute('aria-keyshortcuts');
    expect(b.querySelector('kbd')).not.toBeNull();
  });

  it('a button without a shortcut has no aria-keyshortcuts', () => {
    render(<Button>Plain</Button>);
    expect(screen.getByRole('button', { name: 'Plain' })).not.toHaveAttribute('aria-keyshortcuts');
  });
});

describe('ariaKeyshortcuts', () => {
  it('maps the kit spelling to ARIA key names, per platform; alternatives are space-separated', () => {
    expect(ariaKeyshortcuts('Mod+K', false)).toBe('Control+K');
    expect(ariaKeyshortcuts('Mod+K', true)).toBe('Meta+K');
    expect(ariaKeyshortcuts('Alt+R', false)).toBe('Alt+R');
    expect(ariaKeyshortcuts('Shift+Enter', false)).toBe('Shift+Enter');
    expect(ariaKeyshortcuts('Esc', false)).toBe('Escape');
    expect(ariaKeyshortcuts('Ctrl+Plus', false)).toBe('Control+Plus');
    expect(ariaKeyshortcuts('?', false)).toBe('?');
    expect(ariaKeyshortcuts(['j', 'k'], false)).toBe('j k');
  });
});
