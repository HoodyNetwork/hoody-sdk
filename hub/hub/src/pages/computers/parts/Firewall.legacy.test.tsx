// Network > Firewall on real core (fixture transport): a held change this page cannot attribute. Core keeps
// holds converted from an older record format without their identity, so the page cannot tell which computer they
// belong to and shows no band for them. Core still refuses that change again (not_sent, READ_BACK_FIRST): the page says a
// change is still being checked and that nothing was sent, never a generic error and never "may have gone through".
import { answers, bootFixtureCore, queryClient, reply, type FixtureRequest } from '@core';
import type * as core from '@core';
// eslint-disable-next-line no-restricted-imports -- a test harness for the part, not page code
import { QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render as rtlRender, screen, waitFor, within, type RenderOptions } from '@testing-library/react';
// eslint-disable-next-line no-restricted-imports -- a router harness: the rules table reads the URL; not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { createContext, useContext, useState, type ReactElement, type ReactNode } from 'react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { firewallRoutes } from '../firewall.data';
import type { Computer } from '../types';
import { Firewall } from './Firewall';
import strings from './Firewall.strings.en.json';

/** The rules table (kit DataTable) reads the URL: the part mounts inside a memory router, one per mount, so a rerender
 *  keeps the part's state. */
const Mounted = createContext<ReactNode>(null);
function Routed({ children }: { children?: ReactNode }) {
  const [router] = useState(() =>
    createRouter({
      routeTree: createRootRoute({ component: function Root() { return <>{useContext(Mounted)}</>; } }),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    }),
  );
  return <Mounted.Provider value={children}><RouterProvider router={router} /></Mounted.Provider>;
}
const render = (ui: ReactElement, o?: RenderOptions) => rtlRender(ui, { wrapper: Routed, ...o });

vi.mock('@core', async (importOriginal) => {
  const real = await importOriginal<typeof core>();
  // Every held firewall change reads as converted from the older format: no identity.
  return { ...real, heldChanges: (...a: Parameters<typeof real.heldChanges>) => real.heldChanges(...a).map((h) => ({ ...h, identity: undefined })) };
});

const C = { id: 'c'.repeat(24), name: 'atlas', status: 'running', project_id: 'p'.repeat(24), server_id: 's'.repeat(24), server_name: 'n12' } as Computer;

afterEach(() => {
  cleanup();
  queryClient.clear();
  // eslint-disable-next-line no-restricted-globals -- the test clears what a run kept (core's held changes)
  localStorage.clear();
});

describe('Network > Firewall: a held change with no computer', () => {
  it('the same change again is refused by core and the page says another change is still being checked, nothing sent', async () => {
    const sent: FixtureRequest[] = [];
    bootFixtureCore({
      rules: [
        reply(firewallRoutes.rules, () => answers.ok({ statusCode: 200, data: { ingress: [], egress: [], rule_count: 0, max_rules: 500 } })),
        reply(firewallRoutes.addIn, (r) => {
          sent.push(r);
          return answers.pending5xx();
        }),
      ],
    });
    render(<QueryClientProvider client={queryClient}><Firewall c={C} canWrite /></QueryClientProvider>);
    const add = async (port: string) => {
      await userEvent.click(await screen.findByRole('button', { name: strings['fw.add'] }));
      const g = screen.getByRole('dialog', { name: strings['fw.form.addTitle'] });
      await userEvent.type(within(g).getByLabelText(new RegExp(strings['fw.form.ports'])), port);
      await userEvent.type(within(g).getByLabelText(new RegExp(strings['fw.form.description'])), 'test rule');
      await userEvent.click(within(g).getByRole('button', { name: strings['fw.form.go'] }));
      return g;
    };
    await add('8080');
    await waitFor(() => expect(sent).toHaveLength(1));
    await waitFor(() => expect(screen.getByRole('button', { name: strings['fw.add'] })).toBeEnabled());
    // The same rule again: core holds it back behind its own unresolved change (another rule would be a new change).
    const g = await add('8080');
    expect(await within(g).findByText(strings['fw.refused.wait'].replace('{{name}}', 'atlas'))).toBeInTheDocument();
    expect(screen.queryByText(/may have gone through/)).toBeNull();
    expect(sent).toHaveLength(1);
  });
});
