// A React 19 callback ref may return a cleanup, which React then calls on
// detach instead of calling the ref with null. useKeyshortcuts hands the element to the control's other ref; it must
// hand that ref's cleanup back too, or the cleanup never runs and the ref gets a null it did not ask for. Checked on a
// key change (the hook's callback is a new ref, so React detaches the old one), on unmount, and under StrictMode (which
// attaches, detaches and attaches again).
import { render } from '@testing-library/react';
import { type Ref, StrictMode } from 'react';
import { Button as AriaButton } from 'react-aria-components';
import { describe, expect, it } from 'vitest';
import { useKeyshortcuts } from './keyshortcuts';

function Probe({ keys, other }: { keys?: string; other?: Ref<HTMLButtonElement> }) {
  const ref = useKeyshortcuts<HTMLButtonElement>(keys, other);
  return <AriaButton ref={ref}>Go</AriaButton>;
}

/** A callback ref with a cleanup, logging each call: 'set' with the element, 'null', or 'clean'. */
function logged() {
  const log: string[] = [];
  const ref = (el: HTMLButtonElement | null) => {
    log.push(el ? 'set' : 'null');
    return () => {
      log.push('clean');
    };
  };
  return { log, ref };
}

describe("useKeyshortcuts keeps the other ref's cleanup (React 19)", () => {
  it('on unmount the cleanup runs, and the ref is never called with null', () => {
    const { log, ref } = logged();
    const r = render(<Probe keys="Control+K" other={ref} />);
    r.unmount();
    expect(log).toEqual(['set', 'clean']);
  });

  it('on a key change the old attach is cleaned up before the new one, and the new key is set', () => {
    const { log, ref } = logged();
    const r = render(<Probe keys="Control+K" other={ref} />);
    r.rerender(<Probe keys="Meta+K" other={ref} />);
    expect(r.getByRole('button')).toHaveAttribute('aria-keyshortcuts', 'Meta+K');
    expect(log).toEqual(['set', 'clean', 'set']);
    r.unmount();
    expect(log).toEqual(['set', 'clean', 'set', 'clean']);
  });

  it('under StrictMode every attach is matched by a cleanup, and none by a null', () => {
    const { log, ref } = logged();
    const r = render(
      <StrictMode>
        <Probe keys="Control+K" other={ref} />
      </StrictMode>,
    );
    expect(r.getByRole('button')).toHaveAttribute('aria-keyshortcuts', 'Control+K');
    expect(log.filter((x) => x === 'set').length - log.filter((x) => x === 'clean').length, 'one attach live while mounted').toBe(1);
    r.unmount();
    expect(log).not.toContain('null');
    expect(log.filter((x) => x === 'set').length).toBe(log.filter((x) => x === 'clean').length);
  });

  it('a callback ref without a cleanup still gets null on detach, as React does without the hook', () => {
    const log: string[] = [];
    const r = render(<Probe keys="Control+K" other={(el) => void log.push(el ? 'set' : 'null')} />);
    r.unmount();
    expect(log).toEqual(['set', 'null']);
  });
});
