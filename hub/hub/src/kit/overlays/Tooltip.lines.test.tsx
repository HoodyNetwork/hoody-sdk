// The kit Tooltip with more than one line: `content` first, then each of `lines` on its own line in the IconButton
// tooltip's stack, on any React Aria focusable trigger (a Link as well as a Button), with `data-*` attributes passed to
// the tooltip element.
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { Link } from 'react-aria-components';
import { beforeEach, describe, expect, it } from 'vitest';
import { boot } from '@core/test/env';
import { Button } from '../controls/Button';
import btn from '../controls/Button.module.css';
import { Tooltip } from './Popover';

beforeEach(() => {
  boot();
});

async function mount(children: ReactNode) {
  const router = createRouter({ routeTree: createRootRoute({ component: () => <>{children}</> }), history: createMemoryHistory({ initialEntries: ['/'] }) });
  await act(async () => {
    render(<RouterProvider router={router} />);
    await router.load();
  });
}

describe('kit Tooltip lines', () => {
  it('draws content, then each line, as a column; a line that is empty is left out', async () => {
    await mount(
      <Tooltip content="atlas-01" lines={['Frankfurt', '', 'Running']} data-hub-computer-tip="">
        <Button>Computer</Button>
      </Tooltip>,
    );
    await userEvent.tab();
    const tip = await waitFor(() => screen.getByRole('tooltip'));
    expect(tip).toHaveAttribute('data-hub-computer-tip', '');
    const stack = tip.querySelector(`.${btn.tipStack}`);
    expect(stack).not.toBeNull();
    expect([...(stack?.children ?? [])].map((c) => c.textContent)).toEqual(['atlas-01', 'Frankfurt', 'Running']);
  });

  it('with no lines it is the one-line tip, as before', async () => {
    await mount(
      <Tooltip content="Save the draft">
        <Button>Save</Button>
      </Tooltip>,
    );
    await userEvent.tab();
    const tip = await waitFor(() => screen.getByRole('tooltip'));
    expect(tip.querySelector(`.${btn.tipStack}`)).toBeNull();
    expect(tip).toHaveTextContent('Save the draft');
  });

  it('a React Aria Link is a trigger: keyboard focus shows its tip', async () => {
    await mount(
      <Tooltip content="Computers" lines={['3 running']} placement="end">
        <Link href="/computers">Computers</Link>
      </Tooltip>,
    );
    await userEvent.tab();
    expect(document.activeElement).toBe(screen.getByRole('link', { name: 'Computers' }));
    const tip = await waitFor(() => screen.getByRole('tooltip'));
    expect(tip).toHaveTextContent('Computers3 running');
  });
});
