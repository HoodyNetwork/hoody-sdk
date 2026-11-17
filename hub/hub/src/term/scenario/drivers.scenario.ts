// Regression cases for the scenario DRIVERS themselves: each case is a driver fault seen
// before, run on both platforms (terminal: scripts/term/scenarios.ts drivers; web: HUB_SCENARIO=drivers). A failure here
// is a driver bug, not a component bug.
import { createElement, type ReactElement } from 'react';
import { useRouterState } from '@tanstack/react-router';
import { scenarios } from './types';
import { Dialog } from '../../kit/overlays/Dialog';
import { FilterChips } from '../../kit/data/FilterChips';
import { DataTable } from '../../kit/data/DataTable';
import { Drawer } from '../../kit/overlays/Drawer';
import { CopyButton } from '../../kit/data/Ids';
import { Link } from '../../kit/controls/Link';

type Any = (p: Record<string, unknown>) => ReactElement | null;

const faults = scenarios('DriverFaults', Dialog as unknown as Any, {
  cases: [
    {
      // The terminal sent a bare ESC and read the frame before OpenTUI decided it was a lone ESC.
      name: 'escape: the next step already sees the dialog closed',
      props: (s) => ({ isOpen: true, onOpenChange: s.fn('onOpenChange'), title: 'About keys', isDismissable: true }),
      control: { value: 'isOpen', onChange: 'onOpenChange' },
      steps: [{ key: 'escape' }, { expect: { nodes: [{ target: { role: 'dialog' }, absent: true }] } }],
      expect: { calls: { onOpenChange: [[false]] } },
    },
    {
      // The drivers mounted no router, so anything reading the route threw.
      name: 'router: a component reading the route renders at the scenario path',
      props: {},
      mount: (_C, _p, _s, html) => {
        const Probe = (): ReactElement => html('p', null, `at ${useRouterState({ select: (x) => x.location.pathname })}`);
        return createElement(Probe);
      },
      steps: [],
      expect: { nodes: [{ target: { text: 'at /page' } }] },
    },
    {
      // A roleless element with an id was dropped from the terminal tree, so aria-labelledby to it named
      // nothing. A block element and an inline <span id> inside a text run (compat registers the span's text) both
      // resolve.
      name: 'labelledby: a roleless element names and describes a switch by id',
      props: {},
      mount: (_C, _p, _s, html) => html('div', null, html('div', { id: 'drv-lbl' }, 'Email me'), html('p', null, 'Note: ', html('span', { id: 'drv-hint' }, 'Weekly at most')),
        html('div', { role: 'switch', 'aria-checked': 'false', 'aria-labelledby': 'drv-lbl', 'aria-describedby': 'drv-hint', tabIndex: 0 }, '[off]')),
      steps: [],
      expect: { nodes: [{ target: { role: 'switch', name: 'Email me' }, description: 'Weekly at most' }] },
    },
    {
      // `type` sent the keys in the same tick as the focus; the input took the focus a render later.
      name: 'type: an unfocused input gets every key',
      props: (s) => ({ onChange: s.fn('onChange') }),
      mount: (_C, p, _s, html) => html('div', null, html('button', null, 'Before'), html('input', { 'aria-label': 'Search', type: 'text', onChange: (e: { target: { value: string } }) => (p.onChange as (v: string) => void)(e.target.value) })),
      // Named by its aria-label on both platforms (compat passes an <input>'s sem).
      steps: [{ type: [{ role: 'textbox', name: 'Search' }, 'char'] }],
      expect: { nodes: [{ target: { role: 'textbox', name: 'Search' }, value: 'char' }] },
    },
  ],
});

// The web driver kept localStorage between cases (ConversationView's onTab on the web), so a component that
// remembers a choice started the next case elsewhere. Two cases write and read the same key: each must see none.
// The terminal side runs under strict globals: reading localStorage there throws TERM_GLOBAL, which counts as none.
const stored = (): { get(): string; set(v: string): void } => {
  let ls: Storage | undefined;
  try { ls = (globalThis as { localStorage?: Storage }).localStorage; } catch { ls = undefined; }
  return { get: () => { try { return ls?.getItem('drv-remembered') ?? 'none'; } catch { return 'none'; } }, set: (v) => { try { ls?.setItem('drv-remembered', v); } catch { /* none */ } } };
};
const remembering = (_C: unknown, _p: unknown, _s: unknown, html: (t: string, p: unknown, ...c: unknown[]) => ReactElement): ReactElement => {
  const Probe = (): ReactElement => { const st = stored(); const seen = st.get(); st.set('picked'); return html('p', null, `remembered ${seen}`); };
  return createElement(Probe);
};
const storage = scenarios('DriverStorage', Dialog as unknown as Any, {
  cases: [
    { name: 'storage: the first case starts with nothing remembered', props: {}, mount: remembering as never, steps: [], expect: { nodes: [{ target: { text: 'remembered none' } }] } },
    { name: 'storage: the next case starts with nothing remembered either', props: {}, mount: remembering as never, steps: [], expect: { nodes: [{ target: { text: 'remembered none' } }] } },
  ],
});

const state = (s: { fn: (n: string) => (...a: unknown[]) => void }) => ({
  id: 'state', label: 'State', onChange: s.fn('onChange'), options: [{ value: 'running', label: 'Running' }, { value: 'stopped', label: 'Stopped' }],
});

const menu = scenarios('DriverMenuPick', FilterChips as unknown as Any, {
  cases: [
    {
      // On the web, press on a React Aria menuitemradio never reached onAction.
      name: 'press: a menuitemradio pick reaches onAction',
      props: (s) => ({ filters: [state(s)] }),
      steps: [{ press: { role: 'button', name: 'State', exact: false } }, { press: { role: 'menuitemradio', name: 'Running' } }],
      expect: { calls: { onChange: [['running']] } },
    },
  ],
});

// The repro: a terminal TextInput takes the engine focus a render after the focus store moves, while the table
// holds the focus before it; keys sent in the same tick went to the table.
const rows = [{ id: 'a', name: 'alpha' }, { id: 'b', name: 'bravo' }, { id: 'c', name: 'charlie' }];
const typing = scenarios('DriverTypeFocus', DataTable as unknown as Any, {
  cases: [
    {
      name: 'type: a search box the table held the focus from gets every key',
      props: { label: 'Things', data: rows, columns: [{ id: 'name', header: 'Name', accessorKey: 'name', meta: { pinned: true, list: 'primary' } }],
        getRowId: (r: { id: string }) => r.id, sortParam: false, pageParam: false, search: true },
      steps: [{ type: [{ role: 'searchbox', name: 'Search' }, 'char'] }],
      expect: { nodes: [{ target: { role: 'row', name: 'charlie', exact: false } }, { target: { role: 'row', name: 'bravo', exact: false }, absent: true }] },
    },
  ],
});

// The repro: the step right after Escape read the drawer before its discard question was drawn.
const esc = scenarios('DriverEscape', Drawer as unknown as Any, {
  cases: [
    {
      name: 'escape: the next step sees what Escape opened',
      props: (s) => ({ title: 'New schedule', resizeKey: 'drv-drawer', children: 'Body line', isOpen: true, onOpenChange: s.fn('onOpenChange'), dirty: true, cancel: 'Cancel' }),
      steps: [{ key: 'escape' }, { expect: { nodes: [{ target: { text: /Discard changes\?/ } }] } }],
      expect: { calls: { onOpenChange: 0 } },
    },
  ],
});

// `copied` (clipboard), Ctrl+C as a plain key (the terminal renderer must not end), `at` and `location` (the router).
const clip = scenarios('DriverClipboard', CopyButton as unknown as Any, {
  cases: [
    {
      name: 'copied: a press puts its text on the clipboard; Ctrl+C after it leaves the mount alive',
      props: { text: 'drv-copy-1', label: 'Copy id' },
      steps: [{ press: { role: 'button', name: 'Copy id' } }, { key: 'ctrl+c' }, { expect: { nodes: [{ target: { role: 'button', name: 'Copy id' } }] } }],
      expect: { copied: ['drv-copy-1'] },
    },
    { name: 'copied 0: nothing is copied without a press', props: { text: 'drv-copy-2', label: 'Copy id' }, steps: [], expect: { copied: 0 } },
  ],
});
const route = scenarios('DriverRoute', Link as unknown as Any, {
  cases: [
    {
      name: 'at and location: the case starts where it says, and following a link moves the router',
      at: '/start?tab=2',
      props: { href: '/next', children: 'Next page' },
      steps: [{ expect: { location: '/start?tab=2' } }, { press: { role: 'link', name: 'Next page' } }],
      expect: { location: /^\/next/ },
    },
  ],
});

export default [faults, menu, typing, esc, storage, clip, route];
