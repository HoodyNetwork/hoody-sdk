// Behaviour contract of Tabs, run on the web and in the terminal (src/term/scenario).
// The web strip is React Aria's Tabs with automatic activation: the arrows (and Home / End) select, skipping disabled
// tabs; only the open tab's panel is rendered.
import { scenarios } from '../scenario-types';
import { StripMore, Tabs } from './Tabs';

const items = [
  { id: 'a', label: 'Alpha', content: 'Panel of Alpha' },
  { id: 'b', label: 'Bravo', content: 'Panel of Bravo', isDisabled: true },
  { id: 'c', label: 'Charlie', content: 'Panel of Charlie' },
  { id: 'd', label: 'Delta', content: 'Panel of Delta' },
];
const tab = (name: string) => ({ role: 'tab', name });
const LOOK = 'look only: the terminal draws no colour band or sticky bar';

const tabs = scenarios('Tabs', Tabs, {
  ignored: {
    sticky: LOOK, accent: LOOK, accentWhen: LOOK, panelClassName: 'no CSS classes in a terminal',
    edit: 'GAP: rename / reorder / tab menu gestures are not drawn in the terminal (web-only editing)',
    editRef: 'GAP: no rename gesture to start (see edit)', dropTargetId: 'drag and drop is not in the terminal',
  },
  unsupported: {},
  cases: [
    {
      name: 'the strip is named; no value opens the first enabled tab and only its panel',
      props: { label: 'Sections', items },
      steps: [],
      expect: {
        nodes: [
          { target: { role: 'tablist', name: 'Sections' } },
          { target: tab('Alpha'), states: { selected: true } },
          { target: tab('Charlie'), states: { selected: false } },
          { target: { text: 'Panel of Alpha' } },
          { target: { text: 'Panel of Charlie' }, absent: true },
        ],
      },
    },
    {
      name: 'a click opens a tab and reports its id',
      props: (s) => ({ label: 'Sections', items, value: 'a', onChange: s.fn('onChange') }),
      control: { value: 'value', onChange: 'onChange' },
      steps: [{ click: tab('Charlie') }],
      expect: { calls: { onChange: [['c']] }, nodes: [{ target: tab('Charlie'), states: { selected: true } }, { target: { text: 'Panel of Charlie' } }, { target: { text: 'Panel of Alpha' }, absent: true }] },
    },
    {
      name: 'Right selects the next enabled tab (skipping a disabled one); End the last',
      props: (s) => ({ label: 'Sections', items, value: 'a', onChange: s.fn('onChange') }),
      control: { value: 'value', onChange: 'onChange' },
      steps: [{ focus: tab('Alpha') }, { key: 'right' }, { expect: { focused: tab('Charlie') } }, { key: 'end' }],
      expect: { calls: { onChange: [['c'], ['d']] }, focused: tab('Delta'), nodes: [{ target: tab('Delta'), states: { selected: true } }] },
    },
    {
      name: 'Left and Home go back',
      props: (s) => ({ label: 'Sections', items, value: 'd', onChange: s.fn('onChange') }),
      control: { value: 'value', onChange: 'onChange' },
      steps: [{ focus: tab('Delta') }, { key: 'left' }, { key: 'home' }],
      expect: { calls: { onChange: [['c'], ['a']] }, nodes: [{ target: tab('Alpha'), states: { selected: true } }] },
    },
    {
      name: 'the open tab again is no change',
      props: (s) => ({ label: 'Sections', items, value: 'c', onChange: s.fn('onChange') }),
      steps: [{ click: tab('Charlie') }],
      expect: { calls: { onChange: 0 } },
    },
    {
      name: 'a disabled tab is inert',
      props: (s) => ({ label: 'Sections', items, value: 'a', onChange: s.fn('onChange') }),
      steps: [{ click: tab('Bravo'), force: true }],
      expect: { calls: { onChange: 0 }, nodes: [{ target: tab('Bravo'), states: { disabled: true, selected: false } }] },
    },
    {
      name: 'a parent changing value is shown',
      props: { label: 'Sections', items, value: 'a' },
      steps: [{ rerender: { value: 'd' } }],
      expect: { nodes: [{ target: tab('Delta'), states: { selected: true } }, { target: { text: 'Panel of Delta' } }] },
    },
    {
      name: 'without item content, children are the open tab\'s panel',
      props: { label: 'Sections', items: [{ id: 'a', label: 'Alpha' }, { id: 'c', label: 'Charlie' }], value: 'c', children: 'Shared body' },
      steps: [],
      expect: { nodes: [{ target: { role: 'tabpanel' } }, { target: { text: 'Shared body' } }] },
    },
  ],
});

const stripMore = scenarios('StripMore', StripMore, {
  ignored: { scroller: 'the terminal strip counts its hidden tabs itself (Tabs): nothing to scroll' },
  cases: [
    {
      name: 'nothing shows while that side has no more',
      props: { side: 'start', edges: { start: false, end: false }, scroller: { current: null } },
      steps: [],
      expect: { nodes: [{ target: { role: 'button' }, absent: true }] },
    },
  ],
});

export default [tabs, stripMore];
