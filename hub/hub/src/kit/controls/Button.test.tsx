import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Button, IconButton, LinkButton } from './Button';

describe('Button', () => {
  it('shows its shortcut inside the label', () => {
    render(<Button shortcut="Mod+J">Open Ask</Button>);
    expect(screen.getByRole('button').querySelector('kbd')).not.toBeNull();
  });

  it('every button names its variant, and a row action carries data-variant="row"', () => {
    render(
      <>
        <Button variant="primary">A</Button>
        <Button variant="row">B</Button>
      </>,
    );
    expect(screen.getByRole('button', { name: 'A' })).toHaveAttribute('data-variant', 'primary');
    expect(screen.getByRole('button', { name: 'B' })).toHaveAttribute('data-variant', 'row');
  });

  it('refuses presses while busy and keeps its label', () => {
    const onPress = vi.fn();
    render(
      <Button busy onPress={onPress}>
        Saving
      </Button>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Saving/ }));
    expect(onPress).not.toHaveBeenCalled();
  });
});

describe('LinkButton', () => {
  it('is a link drawn as a button; an external target opens a new tab', () => {
    render(
      <LinkButton variant="row" size="sm" href="https://example.invalid/" iconEnd="external">
        Open
      </LinkButton>,
    );
    const a = screen.getByRole('link', { name: 'Open' });
    expect(a.getAttribute('href')).toBe('https://example.invalid/');
    expect(a.getAttribute('target')).toBe('_blank');
    expect(a.getAttribute('rel')).toBe('noopener noreferrer');
    expect(a.getAttribute('data-variant')).toBe('row');
  });

  it('an upper-case scheme is external too (HTTP://)', () => {
    render(<LinkButton href="HTTP://example.invalid/">Open</LinkButton>);
    expect(screen.getByRole('link', { name: 'Open' }).getAttribute('target')).toBe('_blank');
  });
});

// A busy button keeps focus; a disabled icon button with a reason is reachable.
describe('Button: busy keeps focus', () => {
  it('busy together with isDisabled stays focusable and aria-disabled, and refuses presses', () => {
    const onPress = vi.fn();
    render(<Button busy isDisabled onPress={onPress}>Saving</Button>);
    const b = screen.getByRole('button', { name: /Saving/ });
    expect(b).not.toBeDisabled();
    expect(b).toHaveAttribute('aria-disabled', 'true');
    b.focus();
    expect(document.activeElement).toBe(b);
    fireEvent.click(b);
    expect(onPress).not.toHaveBeenCalled();
  });
  it('a glyph button keeps focus while busy and disabled too', () => {
    render(<Button variant="primary" busy isDisabled>Saving</Button>);
    const b = screen.getByRole('button', { name: /Saving/ });
    expect(b).not.toBeDisabled();
    b.focus();
    expect(document.activeElement).toBe(b);
  });
  it('a continuous isDisabled still disables the button when busy ends', () => {
    const { rerender } = render(<Button busy isDisabled>Save</Button>);
    expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute('aria-disabled', 'true');
    rerender(<Button isDisabled>Save</Button>);
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });
  it('the button disabled without busy is a real disabled button; busy off enables a plain one again', () => {
    const { rerender } = render(<Button isDisabled>Go</Button>);
    expect(screen.getByRole('button', { name: 'Go' })).toBeDisabled();
    rerender(<Button busy>Go</Button>);
    expect(screen.getByRole('button', { name: /Go/ })).not.toBeDisabled();
    rerender(<Button>Go</Button>);
    expect(screen.getByRole('button', { name: 'Go' })).not.toHaveAttribute('aria-disabled');
  });
});

describe('IconButton: a description', () => {
  it('the description is the button\'s description and the name stays the label', () => {
    render(<IconButton icon="arrow-up" label="Send" description="Nothing to send yet." onPress={() => {}} />);
    const b = screen.getByRole('button', { name: 'Send' });
    expect(b).toHaveAccessibleDescription('Nothing to send yet.');
  });
  it('disabled with a description is focusable, aria-disabled and refuses presses', () => {
    const onPress = vi.fn();
    render(<IconButton icon="arrow-up" label="Send" description="Wait for the reply." isDisabled onPress={onPress} />);
    const b = screen.getByRole('button', { name: 'Send' });
    expect(b).not.toBeDisabled();
    expect(b).toHaveAttribute('aria-disabled', 'true');
    expect(b).toHaveAccessibleDescription('Wait for the reply.');
    b.focus();
    expect(document.activeElement).toBe(b);
    fireEvent.click(b);
    fireEvent.keyDown(b, { key: 'Enter' });
    expect(onPress).not.toHaveBeenCalled();
  });
  it('the tooltip says the name, then the reason', async () => {
    render(<IconButton icon="arrow-up" label="Send" description="Wait for the reply." />);
    await userEvent.tab();
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Send. Wait for the reply.');
  });
  it('soft-disabled, then enabled again: aria-disabled goes and the press works', () => {
    const onPress = vi.fn();
    const { rerender } = render(<IconButton icon="arrow-up" label="Send" description="Wait." isDisabled onPress={onPress} />);
    expect(screen.getByRole('button', { name: 'Send' })).toHaveAttribute('aria-disabled', 'true');
    rerender(<IconButton icon="arrow-up" label="Send" description="Wait." onPress={onPress} />);
    const b = screen.getByRole('button', { name: 'Send' });
    expect(b).not.toHaveAttribute('aria-disabled');
    fireEvent.click(b);
    expect(onPress).toHaveBeenCalledTimes(1);
  });
  it('disabled without a description is still a real disabled button; enabled with one presses', () => {
    const onPress = vi.fn();
    const { rerender } = render(<IconButton icon="arrow-up" label="Send" isDisabled onPress={onPress} />);
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    rerender(<IconButton icon="arrow-up" label="Send" description="Ready." onPress={onPress} />);
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
