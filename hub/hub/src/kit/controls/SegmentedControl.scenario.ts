// Behaviour contract of SegmentedControl, run on the web and in the terminal (src/term/scenario).
// The web control is React Aria's ToggleButtonGroup in single mode: a radiogroup of radios inside a toolbar, so the
// arrows move the focus only and Enter / Space / a click choose.
import { scenarios } from '../scenario-types';
import { SegmentedControl } from './SegmentedControl';

const items = [
  { id: 'all', label: 'All', count: 12 },
  { id: 'run', label: 'Running' },
  { id: 'gone', label: 'Gone', isDisabled: true },
  { id: 'stop', label: 'Stopped' },
];
const radio = (name: string) => ({ role: 'radio', name });

export default scenarios('SegmentedControl', SegmentedControl, {
  ignored: {
    'aria-describedby': 'help is the description prop, drawn under the control',
    iconOnly: 'look only: the terminal draws every segment with its label (an icon alone does not read in mono)',
  },
  unsupported: {},
  cases: [
    {
      name: 'the group is named by its label; no value = the first enabled item is chosen',
      props: { label: 'State', items },
      steps: [],
      expect: { nodes: [{ target: { role: 'radiogroup', name: 'State' } }, { target: radio('All'), states: { checked: true } }, { target: radio('Running'), states: { checked: false } }] },
    },
    {
      name: 'a click chooses a segment and reports its id',
      props: (s) => ({ label: 'State', items, value: 'all', onChange: s.fn('onChange') }),
      control: { value: 'value', onChange: 'onChange' },
      steps: [{ click: radio('Running') }],
      expect: { calls: { onChange: [['run']] }, nodes: [{ target: radio('Running'), states: { checked: true } }, { target: radio('All'), states: { checked: false } }] },
    },
    {
      name: 'arrows move the focus only, skipping a disabled segment; Enter chooses',
      props: (s) => ({ label: 'State', items, value: 'all', onChange: s.fn('onChange') }),
      steps: [
        { focus: radio('Running') },
        { key: 'right' },
        { expect: { calls: { onChange: 0 }, focused: radio('Stopped') } },
        { key: 'enter' },
      ],
      expect: { calls: { onChange: [['stop']] } },
    },
    {
      name: 'Space chooses the focused segment',
      props: (s) => ({ label: 'State', items, value: 'all', onChange: s.fn('onChange') }),
      steps: [{ focus: radio('Running') }, { key: 'space' }],
      expect: { calls: { onChange: [['run']] } },
    },
    {
      name: 'choosing the chosen segment again is no change',
      props: (s) => ({ label: 'State', items, value: 'run', onChange: s.fn('onChange') }),
      steps: [{ press: radio('Running') }, { click: radio('Running') }],
      expect: { calls: { onChange: 0 }, nodes: [{ target: radio('Running'), states: { checked: true } }] },
    },
    {
      name: 'a disabled segment is inert',
      props: (s) => ({ label: 'State', items, value: 'all', onChange: s.fn('onChange') }),
      steps: [{ click: radio('Gone'), force: true }],
      expect: { calls: { onChange: 0 }, nodes: [{ target: radio('Gone'), states: { disabled: true, checked: false } }] },
    },
    {
      name: 'isDisabled: every segment is inert',
      props: (s) => ({ label: 'State', items, value: 'all', isDisabled: true, onChange: s.fn('onChange') }),
      steps: [{ click: radio('Running'), force: true }, { press: radio('Stopped'), force: true }],
      expect: { calls: { onChange: 0 }, nodes: [{ target: radio('Running'), states: { disabled: true } }] },
    },
    {
      name: 'a parent changing value is shown',
      props: { label: 'State', items, value: 'all' },
      steps: [{ rerender: { value: 'stop' } }],
      expect: { nodes: [{ target: radio('Stopped'), states: { checked: true } }, { target: radio('All'), states: { checked: false } }] },
    },
    {
      // variant changes the look only (folder tabs vs segments; the terminal's folder row marks the chosen view as a
      // tab, "▸ Label"): the group, its radios and choosing are the same.
      name: 'variant="folder": the same radiogroup; a click chooses and reports its id',
      props: (s) => ({ label: 'Views', items, value: 'all', variant: 'folder', onChange: s.fn('onChange') }),
      control: { value: 'value', onChange: 'onChange' },
      steps: [{ click: radio('Running') }],
      expect: { calls: { onChange: [['run']] }, nodes: [{ target: { role: 'radiogroup', name: 'Views' } }, { target: radio('Running'), states: { checked: true } }, { target: radio('All'), states: { checked: false } }] },
    },
    {
      name: 'a form row shows its label and help',
      props: { label: 'Run as', items, showLabel: true, description: 'Who owns the files.' },
      steps: [],
      expect: { nodes: [{ target: { text: 'Run as' } }, { target: { text: 'Who owns the files.' } }] },
    },
  ],
});
