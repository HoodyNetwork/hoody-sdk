// focusOnMount.ts: first focus without the autoFocus attribute, with autoFocus's rules.
import { useRef, useState } from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useFocusOnMount } from './focusOnMount';

afterEach(() => { cleanup(); });

function One({ on, shown = true }: { on: boolean; shown?: boolean }) {
  const ref = useFocusOnMount<HTMLInputElement>(on);
  return shown ? <input aria-label="first" ref={ref} /> : null;
}

describe('useFocusOnMount', () => {
  it('focuses the element when it is attached and `on` holds', () => {
    render(<One on />);
    expect(document.activeElement).toBe(screen.getByLabelText('first'));
  });

  it('focuses nothing when `on` is false at attach, and nothing when `on` turns true later (autoFocus rule)', () => {
    const { rerender } = render(<One on={false} />);
    expect(document.activeElement).toBe(document.body);
    rerender(<One on />);
    expect(document.activeElement).toBe(document.body);
  });

  it('a field shown again is focused again; a re-render of the same field is not', () => {
    const { rerender } = render(<One on />);
    (document.activeElement as HTMLElement).blur();
    rerender(<One on />);
    expect(document.activeElement).toBe(document.body);
    rerender(<One on shown={false} />);
    rerender(<One on />);
    expect(document.activeElement).toBe(screen.getByLabelText('first'));
  });

  it('a wrapper focuses its first input, and `keep` holds the attached element', () => {
    const kept: { el: HTMLDivElement | null } = { el: null };
    function Wrapped() {
      const keep = useRef<HTMLDivElement>(null);
      const ref = useFocusOnMount(true, keep);
      const [, bump] = useState(0);
      kept.el = keep.current;
      return (
        <div ref={ref} data-testid="box">
          <input aria-label="secret" />
          <button type="button" onClick={() => { bump((n) => n + 1); }}>Show</button>
        </div>
      );
    }
    render(<Wrapped />);
    expect(document.activeElement).toBe(screen.getByLabelText('secret'));
    act(() => { screen.getByRole('button', { name: 'Show' }).click(); });
    expect(kept.el).toBe(screen.getByTestId('box'));
  });
});
