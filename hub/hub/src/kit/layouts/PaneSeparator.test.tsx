// useElementWidth: a ref holds no signal, so the width still comes when the element arrives after the first commit, and
// follows a replaced element. The AI rail's first frame has no element while its computer is read.
import { render } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useElementWidth } from './PaneSeparator';

const observed: Element[] = [];
class FakeRO {
  observe(el: Element) { observed.push(el); }
  disconnect() { /* nothing held */ }
  unobserve() { /* nothing held */ }
}

function Probe({ shown, keyName, on = true }: { shown: boolean; keyName?: string; on?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const w = useElementWidth(ref, on);
  return (
    <>
      <output data-testid="w">{w ?? 'none'}</output>
      {shown && <div key={keyName} ref={ref} data-testid="el" />}
    </>
  );
}

const wide = (px: number) => vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(px);

afterEach(() => {
  observed.length = 0;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('useElementWidth', () => {
  it('measures an element that arrives after the first commit', () => {
    vi.stubGlobal('ResizeObserver', FakeRO);
    wide(944);
    const { rerender, getByTestId } = render(<Probe shown={false} />);
    expect(getByTestId('w').textContent).toBe('none');
    rerender(<Probe shown />);
    expect(getByTestId('w').textContent).toBe('944');
    expect(observed).toHaveLength(1);
  });

  it('follows a replaced element, and observes each one once', () => {
    vi.stubGlobal('ResizeObserver', FakeRO);
    wide(700);
    const { rerender } = render(<Probe shown keyName="a" />);
    expect(observed).toHaveLength(1);
    rerender(<Probe shown keyName="a" />);
    expect(observed, 'a commit with the same element adds no observer').toHaveLength(1);
    rerender(<Probe shown keyName="b" />);
    expect(observed).toHaveLength(2);
  });

  it('measures nothing while it is off', () => {
    vi.stubGlobal('ResizeObserver', FakeRO);
    wide(700);
    const { getByTestId } = render(<Probe shown on={false} />);
    expect(getByTestId('w').textContent).toBe('none');
    expect(observed).toHaveLength(0);
  });
});
