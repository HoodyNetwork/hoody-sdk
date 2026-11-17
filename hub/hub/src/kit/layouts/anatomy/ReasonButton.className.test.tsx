// ReasonButton `className`: passed to the inner Button, as Button takes it, so an off
// action can keep its enabled twin's width (a computer card's fixed-width start button).
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ReasonButton } from './ReasonButton';

describe('ReasonButton className', () => {
  it('reaches the inner button, beside the kit classes; the wrapper does not take it', () => {
    render(
      <ReasonButton reason="Sign in again first" className="wide136">
        Restart
      </ReasonButton>,
    );
    const b = screen.getByRole('button', { name: 'Restart' });
    expect(b.className).toMatch(/\bwide136\b/);
    expect(b.className).toMatch(/\bbutton\b/);
    expect((b.parentElement as HTMLElement).className).not.toMatch(/wide136/);
  });
});
