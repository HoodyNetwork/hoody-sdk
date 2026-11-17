import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { StripMore, Tabs } from './Tabs';

const ITEMS = [
  { id: 'profile', label: 'Profile', content: <p>Profile body</p> },
  { id: 'security', label: 'Security', badge: 2, content: <p>Security body</p> },
  { id: 'sessions', label: 'Sessions', content: <p>Sessions body</p>, isDisabled: true },
];

async function inRouter(Component: () => ReactElement, path = '/') {
  const router = createRouter({ routeTree: createRootRoute({ component: Component }), history: createMemoryHistory({ initialEntries: [path] }) });
  await act(async () => {
    render(<RouterProvider router={router} />);
    await router.load();
  });
  return router;
}

describe('Tabs', () => {
  it('shows the first tab and its panel by default, with badges', () => {
    render(<Tabs label="Account" items={ITEMS} />);
    expect(screen.getByRole('tablist', { name: 'Account' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Profile' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /Security/ })).toHaveTextContent('2');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Profile body');
  });

  it('controlled: reports the choice', () => {
    const onChange = vi.fn();
    render(<Tabs label="Account" items={ITEMS} value="profile" onChange={onChange} />);
    fireEvent.mouseDown(screen.getByRole('tab', { name: /Security/ }));
    fireEvent.click(screen.getByRole('tab', { name: /Security/ }));
    expect(onChange).toHaveBeenCalledWith('security');
  });

  it('without content renders only the bar', () => {
    render(<Tabs label="Views" items={[{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }]} />);
    expect(screen.queryByRole('tabpanel')).toBeNull();
  });

  // axe aria-valid-attr-value (critical): a tab may name only a panel that exists.
  const controlsResolve = () => {
    for (const tab of screen.getAllByRole('tab')) {
      const id = tab.getAttribute('aria-controls');
      if (id) expect(document.getElementById(id), `aria-controls="${id}"`).not.toBeNull();
    }
  };

  it('bar only: no tab points at a panel that is not rendered, also after switching', async () => {
    const { rerender } = render(<Tabs label="Views" items={[{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }]} value="b" />);
    await act(async () => {});
    controlsResolve();
    rerender(<Tabs label="Views" items={[{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }]} value="a" />);
    await act(async () => {});
    controlsResolve();
  });

  it('bar only with children: the page body is the selected tab\'s panel, labelled by it', () => {
    render(
      <Tabs label="Views" items={[{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }]} value="b">
        <p>Body of B</p>
      </Tabs>,
    );
    const panel = screen.getByRole('tabpanel');
    expect(panel).toHaveTextContent('Body of B');
    expect(panel).toHaveAccessibleName('B');
    expect(screen.getByRole('tab', { name: 'B' })).toHaveAttribute('aria-controls', panel.id);
    controlsResolve();
  });

  it('bar only with children, after a switch: the panel takes the new tab\'s id, so aria-controls still resolves', async () => {
    const Bar = ({ v }: { v: string }) => (
      <Tabs label="Views" items={[{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }]} value={v}>
        <p>Body of {v}</p>
      </Tabs>
    );
    const { rerender } = render(<Bar v="a" />);
    rerender(<Bar v="b" />);
    const panel = screen.getByRole('tabpanel');
    expect(panel).toHaveTextContent('Body of b');
    expect(panel).toHaveAccessibleName('B');
    expect(screen.getByRole('tab', { name: 'B' })).toHaveAttribute('aria-controls', panel.id);
    controlsResolve();
  });

  it('with panels: every aria-controls resolves', () => {
    render(<Tabs label="Account" items={ITEMS} />);
    controlsResolve();
  });

  it('param: the URL picks the tab; switching writes it, the first tab clears it', async () => {
    const router = await inRouter(() => <Tabs label="Account" items={ITEMS} param="tab" />, '/?tab=security');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Security body');
    await act(async () => {
      fireEvent.mouseDown(screen.getByRole('tab', { name: 'Profile' }));
      fireEvent.click(screen.getByRole('tab', { name: 'Profile' }));
    });
    expect(router.state.location.search).not.toHaveProperty('tab');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Profile body');
  });

  it.each(['nope', 'sessions'])('param naming an unknown or disabled tab (%s) falls back to the first tab', async (v) => {
    await inRouter(() => <Tabs label="Account" items={ITEMS} param="tab" />, `/?tab=${v}`);
    expect(screen.getByRole('tab', { name: 'Profile' })).toHaveAttribute('aria-selected', 'true');
  });
});

describe('StripMore (shared with SettingsPage)', () => {
  it('draws nothing for a side with nothing beyond it, and scrolls the strip from a side that has more', () => {
    const scrollBy = vi.fn();
    // A real element: the press reads its computed direction (left to right here).
    const el = document.createElement('div');
    Object.defineProperty(el, 'clientWidth', { value: 300 });
    Object.defineProperty(el, 'scrollWidth', { value: 2000 });
    el.scrollBy = scrollBy as unknown as HTMLElement['scrollBy'];
    const scroller = { current: el };
    const { container, rerender } = render(<StripMore side="start" edges={{ start: false, end: true }} scroller={scroller} />);
    expect(container.querySelector('[data-more]')).toBeNull();
    rerender(<StripMore side="end" edges={{ start: false, end: true }} scroller={scroller} />);
    const b = container.querySelector<HTMLButtonElement>('[data-more="end"]');
    expect(b).toHaveAttribute('aria-hidden', 'true');
    expect(b).toHaveAttribute('tabindex', '-1');
    fireEvent.click(b!);
    expect(scrollBy).toHaveBeenCalledWith({ left: 180, behavior: 'smooth' });
  });
});
