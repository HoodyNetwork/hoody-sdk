// Vitest: the header subtitle is a two-line clamp, which clips anything grown
// past its line box, so a ContextLine (whose links' tap targets grow past the line) never sits in it. `context` is the
// header's unclamped row for it, after the subtitle; a ContextLine passed in `subtitle`, directly or inside a page's
// own component, throws in a dev build.
import { render } from '@testing-library/react';
import { act, Component, type ReactNode, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ContextLine } from '../data/Display';
import { PageHeader } from './PageHeader';

vi.mock('../nav', () => ({ useSearchParam: () => [undefined, () => undefined] }));
vi.mock('../ask', () => ({ useAskDock: () => ({ isOpen: false }) }));

const line = <ContextLine realm={{ name: 'Work', href: '/computers' }} computer={{ name: 'box-1', href: '/computers' }} />;
/** A page's own wrapper, as Home's HomeContext is: the guard is the ContextLine's own render, not the props. */
const Wrapped = () => line;

class Caught extends Component<{ children: ReactNode }, { error?: Error }> {
  override state: { error?: Error } = {};
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  override render() {
    return this.state.error ? <p data-caught="">{this.state.error.message}</p> : this.props.children;
  }
}

function caught(node: ReactNode): string | null {
  const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  try {
    const { container } = render(<Caught>{node}</Caught>);
    return container.querySelector('[data-caught]')?.textContent ?? null;
  } finally {
    err.mockRestore();
  }
}

describe('PageHeader context row', () => {
  it('renders `context` after the subtitle, outside the clamped subtitle', () => {
    const { container } = render(<PageHeader title="Home" subtitle="Two lines at most" context={line} />);
    const titles = container.querySelector('.titles');
    const sub = container.querySelector('.subtitle');
    const row = container.querySelector('header .context:not(p)');
    expect(sub?.textContent).toBe('Two lines at most');
    expect(row?.querySelector('p.context a[href]')).not.toBeNull();
    expect(sub?.querySelector('p.context')).toBeNull();
    expect(row?.parentElement).toBe(titles);
    expect(sub?.nextElementSibling).toBe(row);
  });

  it('a ContextLine in `subtitle` throws in a dev build, also inside a page component', () => {
    expect(caught(<PageHeader title="Home" subtitle={line} />)).toMatch(/ContextLine is in `subtitle`.*pass it as `context`/);
    expect(caught(<PageHeader title="Home" subtitle={<Wrapped />} />)).toMatch(/ContextLine is in `subtitle`/);
    expect(caught(<PageHeader title="Home" subtitle="Plain text" context={<Wrapped />} />)).toBeNull();
  });

  // The old guard queried the subtitle's DOM after PageHeader rendered, so a ContextLine a
  // descendant added by its own state update (no header render) slipped past it, and any element with a plain
  // `context` class (vitest's non-scoped CSS names) tripped it.
  it('a ContextLine a subtitle descendant adds later, by its own state update, still throws', () => {
    let show: () => void = () => undefined;
    function Later() {
      const [on, setOn] = useState(false);
      show = () => setOn(true);
      return on ? line : <span>Loading</span>;
    }
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const { container } = render(
        <Caught>
          <PageHeader title="Home" subtitle={<Later />} />
        </Caught>,
      );
      expect(container.querySelector('[data-caught]')).toBeNull();
      act(() => show());
      expect(container.querySelector('[data-caught]')?.textContent).toMatch(/ContextLine is in `subtitle`/);
    } finally {
      err.mockRestore();
    }
  });

  it('nothing else in the subtitle trips it: an element whose class is the ContextLine class name does not throw', () => {
    expect(caught(<PageHeader title="Home" subtitle={<span className="context">Context menu help</span>} />)).toBeNull();
  });
});
