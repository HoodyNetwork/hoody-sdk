// Handoff: the web draws its children (nothing of its own); the terminal stands in with the reason, the web address and
// a copy action. The copy is the terminal's only behaviour, so its cases run there alone. The driver's test terminal
// takes no OSC 52, so a copy reads "Copy failed" there: the cases check that the press copied (the key line answered),
// not which answer. The copied text and both answers are pinned in Handoff.term.test.tsx.
// The address carries only a DECLARED page path (search, fragment and free sub-paths dropped), so the block case
// mounts under a router that declares its page (`/schedules`); a bare splat router would give the Hub root.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory } from '@tanstack/history';
import { createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { createElement as h, type ReactElement } from 'react';
import { scenarios } from '../scenario-types';
import { atRoute, loose } from '../layouts/scenarioRoute';
import { ShellDataProvider, type ShellData } from '../../shell/context';
import { Handoff } from './Handoff';

/** The component under a router that declares `page` (as the app's router does), at `page`. */
function atPage(node: () => ReactElement, page: string): ReactElement {
  const root = createRootRoute({ component: () => node() });
  const route = createRoute({ getParentRoute: () => root, path: `${page}/$`, component: () => null });
  const index = createRoute({ getParentRoute: () => root, path: '/', component: () => null });
  const router = createRouter({ routeTree: root.addChildren([index, route]), history: createMemoryHistory({ initialEntries: [page] }), origin: 'http://hub.test' } as never);
  return h(QueryClientProvider, { client: new QueryClient() }, h(RouterProvider, { router: router as never }));
}

// A shell that lists the realm and the computer, so both travel in the address (placeQuery): two 24-hex ids.
const REALM = 'feedfacefeedfacefeedface';
const CID = 'c0a7150000000000000000a1';
const SHELL: ShellData = { realms: [{ id: REALM, name: 'Lab' } as ShellData['realms'][number]], realmId: REALM, computers: [{ id: CID, name: 'atlas' }], computerId: CID };
const WHOLE = `https://hub.example.com/auth/home?realm=${REALM}&computer=${CID}#/schedules`;

const TERM = { platform: 'term' as const, why: 'the web renders the children in place; the copy stand-in exists only in a terminal' };

export default scenarios('Handoff', loose(Handoff), {
  ignored: {},
  unsupported: {},
  cases: [
    {
      name: 'block: Copy link copies the web address (the declared page path only) and answers on its line',
      only: TERM,
      props: () => ({ reason: 'The chart needs a browser to draw.', what: 'chart', to: '/schedules?sel=abc' }),
      mount: (C, p) => atPage(() => h(C, p as never), '/schedules'),
      covers: ['reason', 'what', 'to'],
      steps: [{ press: { role: 'button', name: 'Copy link' } }],
      expect: { nodes: [{ target: { text: '[c Copy link]' }, absent: true }, { target: { text: '/auth/home#/schedules' } }, { target: { text: /sel=abc/ }, absent: true }, { target: { text: /Open the chart on the web/ } }] },
    },
    {
      name: 'line: the c key copies once the action has the focus',
      only: TERM,
      props: () => ({ reason: 'Needs a browser.', size: 'line' }),
      mount: (C, p) => atRoute(() => h(C, p as never)),
      covers: ['size'],
      steps: [{ focus: { role: 'button', name: 'Copy link' } }, { key: 'c' }],
      expect: { nodes: [{ target: { text: '[c Copy link]' }, absent: true }, { target: { text: /Needs a browser\./ } }, { target: { role: 'group', name: 'Continue on the web' } }, { target: { text: /on the web:/ }, absent: true }] },
    },
    {
      name: 'o opens the whole address while the drawn one masks its ids',
      only: TERM,
      webOrigin: 'https://hub.example.com',
      props: () => ({ reason: 'The chart needs a browser to draw.', what: 'chart', to: '/schedules' }),
      mount: (C, p) => atPage(() => h(ShellDataProvider, { value: SHELL, children: h(C, p as never) }), '/schedules'),
      steps: [{ press: { role: 'button', name: 'Open' } }],
      expect: { opened: [WHOLE], neverShown: [REALM, CID], nodes: [{ target: { text: 'feed…face' } }, { target: { text: 'c0a7…00a1' } }] },
    },
    {
      name: 'no web origin from the host: no Open, nothing opened',
      only: TERM,
      props: () => ({ reason: 'Needs a browser.', size: 'line' }),
      mount: (C, p) => atRoute(() => h(C, p as never)),
      steps: [{ key: 'o' }],
      expect: { opened: 0, nodes: [{ target: { role: 'button', name: 'Open' }, absent: true }] },
    },
    {
      name: 'web: the children are drawn as they are',
      only: { platform: 'web', why: 'the terminal never renders the children (it draws the stand-in)' },
      props: () => ({ reason: 'x' }),
      mount: (C, p, _s, html) => h(C, { ...(p as Record<string, unknown>), children: (html as (t: string, a: null, c: string) => unknown)('p', null, 'web chart') } as never),
      covers: ['children'],
      steps: [],
      expect: { nodes: [{ target: { text: 'web chart' } }] },
    },
  ],
});
