// Splitter (for the Board): a focusable pane divider. The kit owns the separator
// semantics (value, keys, pointer); the page owns the ratio maths.
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Splitter } from './Splitter';

const setup = (orientation: 'vertical' | 'horizontal' = 'vertical') => {
  const on = { step: vi.fn(), eq: vi.fn(), start: vi.fn(), drag: vi.fn(), end: vi.fn() };
  render(
    <Splitter
      orientation={orientation}
      value={50}
      min={20}
      max={80}
      label="Resize terminal-2 and agent-1"
      controls="pane-a"
      onStep={on.step}
      onEqualise={on.eq}
      onDragStart={on.start}
      onDrag={on.drag}
      onDragEnd={on.end}
    />,
  );
  return { on, el: screen.getByRole('separator', { name: 'Resize terminal-2 and agent-1' }) };
};

describe('Splitter', () => {
  it('is a focusable separator with its value, range, orientation and the pane it controls', () => {
    const { el } = setup();
    expect(el).toHaveAttribute('tabindex', '0');
    expect(el).toHaveAttribute('aria-orientation', 'vertical');
    expect(el).toHaveAttribute('aria-valuenow', '50');
    expect(el).toHaveAttribute('aria-valuemin', '20');
    expect(el).toHaveAttribute('aria-valuemax', '80');
    expect(el).toHaveAttribute('aria-valuetext', '50 %');
    expect(el).toHaveAttribute('aria-controls', 'pane-a');
  });

  it('a vertical divider steps 5 with ←/→ and ignores ↑/↓; Enter and double-click equalise', () => {
    const { on, el } = setup('vertical');
    fireEvent.keyDown(el, { key: 'ArrowRight' });
    fireEvent.keyDown(el, { key: 'ArrowLeft' });
    fireEvent.keyDown(el, { key: 'ArrowUp' });
    expect(on.step.mock.calls).toEqual([[5], [-5]]);
    fireEvent.keyDown(el, { key: 'Enter' });
    fireEvent.doubleClick(el);
    expect(on.eq).toHaveBeenCalledTimes(2);
  });

  it('a horizontal divider steps with ↓/↑', () => {
    const { on, el } = setup('horizontal');
    fireEvent.keyDown(el, { key: 'ArrowDown' });
    fireEvent.keyDown(el, { key: 'ArrowUp' });
    fireEvent.keyDown(el, { key: 'ArrowRight' });
    expect(on.step.mock.calls).toEqual([[5], [-5]]);
  });

  it('drags with the primary pointer: start, moves with client coordinates, end', () => {
    const { on, el } = setup();
    fireEvent.pointerDown(el, { button: 0, pointerId: 1, clientX: 10, clientY: 20 });
    fireEvent.pointerMove(el, { pointerId: 1, clientX: 30, clientY: 20 });
    fireEvent.pointerUp(el, { pointerId: 1, clientX: 30, clientY: 20 });
    fireEvent.pointerMove(el, { pointerId: 1, clientX: 50, clientY: 20 });
    expect(on.start).toHaveBeenCalledTimes(1);
    expect(on.drag.mock.calls).toEqual([[30, 20]]);
    expect(on.end).toHaveBeenCalledTimes(1);
    fireEvent.pointerDown(el, { button: 2, pointerId: 2, clientX: 10, clientY: 20 });
    expect(on.start).toHaveBeenCalledTimes(1);
  });
});
