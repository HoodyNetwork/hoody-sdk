// A caller's aria-pressed reaches the button. `pressed` is the kit's prop for a toggle; a caller that passes the ARIA
// attribute instead must not lose it, and the pressed look follows whichever one says "on".
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Button, IconButton } from './Button';
import s from './Button.module.css';

describe('Button and IconButton: aria-pressed from the caller', () => {
  it('a Button given aria-pressed keeps it and draws pressed', () => {
    render(<Button aria-pressed={true}>Doors</Button>);
    const b = screen.getByRole('button', { name: 'Doors' });
    expect(b).toHaveAttribute('aria-pressed', 'true');
    expect(b.classList.contains(s.pressed!)).toBe(true);
  });
  it('a Button given aria-pressed false is a toggle that is off', () => {
    render(<Button aria-pressed={false}>Doors</Button>);
    const b = screen.getByRole('button', { name: 'Doors' });
    expect(b).toHaveAttribute('aria-pressed', 'false');
    expect(b.classList.contains(s.pressed!)).toBe(false);
  });
  it('the pressed prop wins over the attribute, and a plain Button has neither', () => {
    render(<><Button pressed={false} aria-pressed={true}>A</Button><Button>B</Button></>);
    expect(screen.getByRole('button', { name: 'A' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'B' })).not.toHaveAttribute('aria-pressed');
  });
  it('an IconButton given aria-pressed keeps it and draws pressed', () => {
    render(<IconButton icon="filter" label="Filters" aria-pressed="true" />);
    const b = screen.getByRole('button', { name: 'Filters' });
    expect(b).toHaveAttribute('aria-pressed', 'true');
    expect(b.classList.contains(s.pressed!)).toBe(true);
  });
});
