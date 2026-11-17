// ListItemButton: one button per row, its parts (a leading box hidden from readers, the name as written, a hidden " · ",
// muted facts), the name for readers read from the row's text (no aria-label), presses by pointer and keys, disabled
// (with the disabled-press guard), and the stylesheet: the option row's height, one hover and focus fill, the inset
// ring, the disabled recipe, the hidden separator, no capitals.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ListItemButton } from './ListItemButton';
import s from './ListItemButton.module.css';

describe('ListItemButton', () => {
  it('draws one button: the leading box hidden from readers, the name, a hidden " · ", the facts; named by its text', () => {
    const { container } = render(
      <ListItemButton id="row-openai" leading={<span data-testid="mark">O</span>} meta="88 models · API key">
        OpenAI
      </ListItemButton>,
    );
    // The mark's letter stays out of the name (the leading box is aria-hidden), and the separator keeps the label and
    // the facts apart.
    const button = screen.getByRole('button', { name: 'OpenAI · 88 models · API key' });
    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(button).toHaveAttribute('id', 'row-openai');
    // No aria-label: axe's label-content-name-mismatch requires an aria-label to contain the drawn text, which a
    // Monogram's letter and the unspaced boxes would break.
    expect(button).not.toHaveAttribute('aria-label');
    expect(button).toHaveClass(s.item!);
    expect(button.children).toHaveLength(4);
    const [lead, label, sep, meta] = [...button.children] as [HTMLElement, HTMLElement, HTMLElement, HTMLElement];
    expect(lead).toHaveClass(s.lead!);
    expect(lead).toHaveAttribute('aria-hidden', 'true');
    expect(lead).toContainElement(screen.getByTestId('mark'));
    expect(label).toHaveClass(s.label!);
    expect(label.textContent).toBe('OpenAI');
    expect(label).toHaveAttribute('title', 'OpenAI');
    expect(sep).toHaveClass(s.srOnly!);
    expect(sep.textContent).toBe(' · ');
    expect(sep).not.toHaveAttribute('aria-hidden');
    expect(meta).toHaveClass(s.meta!);
    expect(meta.textContent).toBe('88 models · API key');
    expect(container.querySelector('[style]')).toBeNull();
  });

  it('without a mark or facts: no leading box, no separator, and the label alone names the row', () => {
    render(<ListItemButton className="extra">Mistral</ListItemButton>);
    const button = screen.getByRole('button', { name: 'Mistral' });
    expect(button).not.toHaveAttribute('aria-label');
    expect(button.children).toHaveLength(1);
    expect(button.firstElementChild).toHaveClass(s.label!);
    expect(button).toHaveClass(s.item!, 'extra');
  });

  it('a click, Enter and Space each press it once, with no arguments', async () => {
    const onPress = vi.fn();
    render(<ListItemButton onPress={onPress}>Mistral</ListItemButton>);
    const button = screen.getByRole('button', { name: 'Mistral' });
    await userEvent.click(button);
    expect(onPress).toHaveBeenCalledTimes(1);
    button.focus();
    await userEvent.keyboard('{Enter}');
    expect(onPress).toHaveBeenCalledTimes(2);
    await userEvent.keyboard(' ');
    expect(onPress).toHaveBeenCalledTimes(3);
    expect(onPress.mock.calls.every((args) => args.length === 0)).toBe(true);
  });

  it('disabled: the button is disabled and a click presses nothing', async () => {
    const onPress = vi.fn();
    render(
      <ListItemButton isDisabled onPress={onPress}>
        Mistral
      </ListItemButton>,
    );
    const button = screen.getByRole('button', { name: 'Mistral' });
    expect(button).toBeDisabled();
    await userEvent.click(button);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('a click while disabled does not cost the first click once it is enabled (the disabled-press guard)', async () => {
    const user = userEvent.setup();
    const onPress = vi.fn();
    const draw = (off: boolean) => (
      <ListItemButton isDisabled={off} onPress={onPress}>
        Mistral
      </ListItemButton>
    );
    const { rerender } = render(draw(true));
    const row = screen.getByRole('button', { name: 'Mistral' });
    await user.click(row);
    expect(onPress).not.toHaveBeenCalled();
    // Enabled from outside, as the chooser's save finishing does: no pointer press anywhere else ends the open press.
    rerender(draw(false));
    expect(screen.getByRole('button', { name: 'Mistral' })).toBe(row);
    expect(row).toBeEnabled();
    await user.click(row);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('the stylesheet: the option row height, one hover and focus fill, the inset ring, the disabled recipe, the hidden separator, no capitals', () => {
    const css = readFileSync(path.join(__dirname, 'ListItemButton.module.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const body = (selector: string) => {
      const at = css.indexOf(`${selector} {`);
      return at < 0 ? '' : css.slice(at, css.indexOf('}', at));
    };
    expect(body('.item')).toMatch(/min-block-size: var\(--option-row-h\);/);
    expect(body('.item')).toMatch(/background: transparent;/);
    expect(css).toMatch(/@media \(pointer: coarse\) \{\s*\.item \{\s*min-block-size: var\(--touch-min\);/);
    expect(css).toMatch(/\.item\[data-hovered\],\s*\.item:is\(:focus-visible, \[data-focus-visible\]\) \{\s*background: var\(--hx-hover\);/);
    expect(body('.item[data-pressed]')).toMatch(/background: var\(--hx-press\);/);
    expect(css).toMatch(/\.item:is\(:focus-visible, \[data-focus-visible\]\) \{\s*outline: none;\s*box-shadow: var\(--focus-ring-inset\);/);
    expect(body('.item[data-disabled]')).toMatch(/opacity: var\(--ctl-off-opacity\);/);
    expect(body('.lead')).toMatch(/inline-size: var\(--sp-4\);\s*block-size: var\(--sp-4\);/);
    expect(body('.meta')).toMatch(/color: var\(--hx-muted\);/);
    // The separator is the kit's visually hidden recipe, held inside the row (the row is its containing block).
    expect(body('.item')).toMatch(/position: relative;/);
    expect(body('.srOnly')).toMatch(/position: absolute;[\s\S]*inline-size: 1px;[\s\S]*block-size: 1px;[\s\S]*overflow: hidden;[\s\S]*clip-path: inset\(50%\);/);
    expect(body('.srOnly')).not.toMatch(/display: none|visibility: hidden/);
    expect(css).not.toMatch(/text-transform|font-family|letter-spacing/);
  });
});
