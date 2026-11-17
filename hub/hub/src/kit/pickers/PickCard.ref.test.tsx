// Vitest: a standalone PickCard hands its pressable to the page (`ref`), so a drawer can return focus to the card the
// person came from; `endIcon` draws a decorative mark after the end words ("Opens Programs" + the external mark).
import { render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it } from 'vitest';
import { PickCard } from './PickCard';

describe('PickCard ref and endIcon', () => {
  it('ref is the card\'s button, and focusing it focuses the card', () => {
    const ref = createRef<HTMLButtonElement>();
    render(<PickCard ref={ref} title="Run a command" line="On a schedule" onPress={() => {}} />);
    const card = screen.getByRole('button', { name: /Run a command/ });
    expect(ref.current).toBe(card);
    ref.current!.focus();
    expect(document.activeElement).toBe(card);
  });

  it('a callback ref gets the button too', () => {
    let got: HTMLButtonElement | null = null;
    render(<PickCard ref={(el) => { got = el; }} title="Ask an agent" onPress={() => {}} />);
    expect(got).toBe(screen.getByRole('button', { name: /Ask an agent/ }));
  });

  it('endIcon is a decorative mark after the end words; the name keeps the words only', () => {
    const { container } = render(<PickCard title="Run a script" end="Opens Programs" endIcon="external" onPress={() => {}} />);
    expect(screen.getByRole('button')).toHaveAccessibleName('Run a script Opens Programs');
    const mark = container.querySelector('[data-pick-end-icon]');
    expect(mark).not.toBeNull();
    expect(mark).toHaveAttribute('aria-hidden', 'true');
  });
});
