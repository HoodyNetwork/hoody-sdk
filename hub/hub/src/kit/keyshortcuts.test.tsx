// React Aria's Button drops aria-keyshortcuts, so the kit sets it through a ref (kit/keyshortcuts.ts).
// The hook sets it, follows a change, removes it when emptied, and still hands the element to the control's other refs;
// kit Button and IconButton pass their aria-keyshortcuts through it.
import { render } from '@testing-library/react';
import { createRef } from 'react';
import { Button as AriaButton } from 'react-aria-components';
import { describe, expect, it, vi } from 'vitest';
import { Button, IconButton } from './controls/Button';
import { useKeyshortcuts } from './keyshortcuts';

function Probe({ keys, other }: { keys?: string; other?: React.Ref<HTMLButtonElement> }) {
  const ref = useKeyshortcuts<HTMLButtonElement>(keys, other);
  return <AriaButton ref={ref}>Go</AriaButton>;
}

describe('useKeyshortcuts', () => {
  it('a React Aria Button alone drops the attribute (why the hook exists)', () => {
    const { getByRole } = render(<AriaButton aria-keyshortcuts="Control+K">Go</AriaButton>);
    expect(getByRole('button')).not.toHaveAttribute('aria-keyshortcuts');
  });
  it('sets it, follows a change, and removes it when emptied', () => {
    const { getByRole, rerender } = render(<Probe keys="Control+K" />);
    expect(getByRole('button')).toHaveAttribute('aria-keyshortcuts', 'Control+K');
    rerender(<Probe keys="Meta+K" />);
    expect(getByRole('button')).toHaveAttribute('aria-keyshortcuts', 'Meta+K');
    rerender(<Probe keys={undefined} />);
    expect(getByRole('button')).not.toHaveAttribute('aria-keyshortcuts');
  });
  it('hands the element to the other refs, object and callback', () => {
    const obj = createRef<HTMLButtonElement>();
    const { getByRole, unmount } = render(<Probe keys="Alt+R" other={obj} />);
    expect(obj.current).toBe(getByRole('button'));
    unmount();
    const fn = vi.fn();
    const r = render(<Probe keys="Alt+R" other={fn} />);
    expect(fn).toHaveBeenCalledWith(r.getByRole('button'));
  });
});

describe('kit buttons pass aria-keyshortcuts to the element', () => {
  it('Button', () => {
    const { getByRole } = render(<Button aria-keyshortcuts="Control+J">Agent</Button>);
    expect(getByRole('button', { name: 'Agent' })).toHaveAttribute('aria-keyshortcuts', 'Control+J');
  });
  it('Button without one has none', () => {
    const { getByRole } = render(<Button>Agent</Button>);
    expect(getByRole('button', { name: 'Agent' })).not.toHaveAttribute('aria-keyshortcuts');
  });
  it('IconButton, its tooltip ref kept', () => {
    const { getByRole } = render(<IconButton icon="search" label="Find" aria-keyshortcuts="Control+F" />);
    expect(getByRole('button', { name: 'Find' })).toHaveAttribute('aria-keyshortcuts', 'Control+F');
  });
});
