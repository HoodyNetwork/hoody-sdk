import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { type ReactElement, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { SegmentedControl } from './SegmentedControl';

const ITEMS = [
  { id: 'all', label: 'All' },
  { id: 'running', label: 'Running', count: 9 },
  { id: 'stopped', label: 'Stopped', isDisabled: true },
] as const;

async function inRouter(Component: () => ReactElement, path = '/') {
  const router = createRouter({ routeTree: createRootRoute({ component: Component }), history: createMemoryHistory({ initialEntries: [path] }) });
  await act(async () => {
    render(<RouterProvider router={router} />);
    await router.load();
  });
  return router;
}

describe('SegmentedControl', () => {
  it('is a labelled radio group; the first item is chosen when nothing is', () => {
    render(<SegmentedControl label="State" items={ITEMS} />);
    expect(screen.getByRole('radiogroup', { name: 'State' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'All' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Running' })).toHaveTextContent('9');
  });

  it('names an option by its label alone; the count is its description', () => {
    render(<SegmentedControl label="State" items={ITEMS} />);
    const running = screen.getByRole('radio', { name: 'Running' });
    expect(running).toHaveAccessibleDescription('9');
    expect(screen.getByRole('radio', { name: 'All' })).not.toHaveAttribute('aria-describedby');
    expect(screen.queryByLabelText('Running')).toBeNull(); // a field's getByLabelText never finds a segment
  });

  it('controlled: reports the new choice and ignores the current or a disabled one', () => {
    const onChange = vi.fn();
    function Host() {
      const [v, setV] = useState<string>('all');
      return <SegmentedControl label="State" items={ITEMS} value={v} onChange={(x) => (onChange(x), setV(x))} />;
    }
    render(<Host />);
    fireEvent.click(screen.getByRole('radio', { name: 'All' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Stopped' }));
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('radio', { name: 'Running' }));
    expect(onChange).toHaveBeenCalledWith('running');
    expect(screen.getByRole('radio', { name: 'Running' })).toBeChecked();
  });

  it('param: reads and writes the URL; the first item clears it', async () => {
    const router = await inRouter(() => <SegmentedControl label="State" items={ITEMS} param="state" />, '/?state=running');
    expect(screen.getByRole('radio', { name: 'Running' })).toBeChecked();
    await act(async () => fireEvent.click(screen.getByRole('radio', { name: 'All' })));
    expect(router.state.location.search).not.toHaveProperty('state');
    await act(async () => fireEvent.click(screen.getByRole('radio', { name: 'Running' })));
    expect(router.state.location.search).toMatchObject({ state: 'running' });
  });

  it('param with an unknown value falls back to the first item', async () => {
    await inRouter(() => <SegmentedControl label="State" items={ITEMS} param="state" />, '/?state=nope');
    expect(screen.getByRole('radio', { name: 'All' })).toBeChecked();
  });
});

describe('SegmentedControl aria-describedby (board options help text)', () => {
  it('ties the group to its help text (controlled)', async () => {
    render(
      <>
        <p id="seg-help">Applies when the tile reloads.</p>
        <SegmentedControl label="State" items={ITEMS} aria-describedby="seg-help" />
      </>,
    );
    expect(screen.getByRole('radiogroup', { name: 'State' })).toHaveAccessibleDescription('Applies when the tile reloads.');
  });

  it('keeps the description with param (URL mode)', async () => {
    await inRouter(() => (
      <>
        <p id="seg-help2">Shown in the address.</p>
        <SegmentedControl label="View" param="v" items={ITEMS} aria-describedby="seg-help2" />
      </>
    ));
    expect(screen.getByRole('radiogroup', { name: 'View' })).toHaveAccessibleDescription('Shown in the address.');
  });
});
