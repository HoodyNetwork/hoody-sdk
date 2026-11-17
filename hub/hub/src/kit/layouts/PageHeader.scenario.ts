// Behaviour contract of the page header parts (web and terminal).
import { createElement as h } from 'react';
import { scenarios } from '../scenario-types';
import { atRoute, loose } from './scenarioRoute';
import { PageHeader, Toolbar, ToolbarScope } from './PageHeader';

type P = Record<string, unknown>;
type Html = (t: string, a: null, ...c: unknown[]) => unknown;
const SIZE = 'control heights (32 px / default): a terminal row is one cell high';

const header = scenarios('PageHeader', loose(PageHeader), {
  ignored: { primaryAsFab: 'there is no floating layer: the primary is always the same button in place' },
  unsupported: {},
  cases: [
    {
      name: 'the title is the page heading; breadcrumbs are a named list',
      props: { title: 'Schedules', breadcrumbs: [{ label: 'Home', href: '/home' }, { label: 'Schedules' }] },
      mount: (C, p) => atRoute(() => h(C, p as never)),
      steps: [],
      expect: { nodes: [{ target: { role: 'heading', name: 'Schedules', level: 1 } }, { target: { role: 'list', name: 'Breadcrumbs' } }] },
    },
    {
      name: 'the primary action calls onPress once when pressed',
      props: (s) => ({ title: 'Schedules', primary: { label: 'New schedule', onPress: s.fn('onPress') } }),
      mount: (C, p) => atRoute(() => h(C, p as never)),
      covers: ['primary'],
      steps: [{ press: { role: 'button', name: 'New schedule' } }],
      expect: { calls: { onPress: 1 } },
    },
    {
      // A primary that ignored isDisabled survived every run; this case kills it.
      name: 'a disabled primary action is inert',
      props: (s) => ({ title: 'Schedules', primary: { label: 'New schedule', onPress: s.fn('onPress'), isDisabled: true } }),
      mount: (C, p) => atRoute(() => h(C, p as never)),
      covers: ['primary'],
      steps: [{ press: { role: 'button', name: 'New schedule' }, force: true }],
      expect: { calls: { onPress: 0 }, nodes: [{ target: { role: 'button', name: 'New schedule' }, states: { disabled: true } }] },
    },
  ],
});

const toolbar = scenarios('Toolbar', loose(Toolbar), {
  ignored: { size: SIZE },
  unsupported: {},
  cases: [
    {
      name: 'the controls are one group named by its label; the notice is outside it',
      props: { label: 'Filters' },
      mount: (C, p, _s, html) => h(C, { ...(p as P), start: (html as Html)('span', null, 'search'), notice: 'Showing 3 of 9' } as never),
      covers: ['notice'],
      steps: [],
      expect: { nodes: [{ target: { role: 'group', name: 'Filters' } }, { target: { text: 'Showing 3 of 9' } }] },
    },
    {
      name: 'the start side draws what the page puts there',
      props: { label: 'Filters' },
      mount: (C, p, _s, html) => h(C, { ...(p as P), start: (html as Html)('span', null, 'Search schedules') } as never),
      covers: ['start'],
      steps: [],
      expect: { nodes: [{ target: { text: 'Search schedules' } }] },
    },
  ],
});

const scope = scenarios('ToolbarScope', loose(ToolbarScope), {
  ignored: { size: SIZE },
  unsupported: {},
  cases: [
    {
      name: 'it draws its children',
      props: {},
      mount: (C, p, _s, html) => h(C, { ...(p as P), children: (html as Html)('span', null, 'inside') } as never),
      covers: ['children'],
      steps: [],
      expect: { nodes: [{ target: { text: 'inside' } }] },
    },
  ],
});

export default [header, toolbar, scope];
