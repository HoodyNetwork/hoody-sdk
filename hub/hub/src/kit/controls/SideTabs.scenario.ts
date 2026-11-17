// Behaviour contract of SideTabs, run on the web and in the terminal (src/term/scenario): toggle
// buttons in a named group; a press or an arrow key picks a row through onChange.
import { scenarios } from '../scenario-types';
import { SideTabs } from './SideTabs';

const items = [
  { id: 'cli', label: 'Terminal' },
  { id: 'ssh', label: 'SSH' },
  { id: 'web', label: 'Browser' },
];
const row = (name: string) => ({ role: 'button' as const, name });

const sideTabs = scenarios('SideTabs', SideTabs, {
  unsupported: {},
  cases: [
    {
      name: 'the group is named; the picked row says pressed, the others do not',
      props: { items, value: 'ssh', label: 'Ways in', onChange: () => {} },
      steps: [],
      expect: { nodes: [{ target: { role: 'group', name: 'Ways in' } }, { target: row('SSH'), states: { pressed: true } }, { target: row('Terminal'), states: { pressed: false } }] },
    },
    {
      name: 'pressing another row reports its id once',
      props: (s) => ({ items, value: 'cli', label: 'Ways in', onChange: s.fn('onChange') }),
      steps: [{ press: row('Browser') }],
      expect: { calls: { onChange: [['web']] } },
    },
    {
      name: 'Down on the picked row picks the next one',
      props: (s) => ({ items, value: 'cli', label: 'Ways in', onChange: s.fn('onChange') }),
      steps: [{ focus: row('Terminal') }, { key: 'down' }],
      expect: { calls: { onChange: [['ssh']] }, focused: row('SSH') },
    },
    {
      name: 'End picks the last row; Up on the first row picks nothing',
      props: (s) => ({ items, value: 'cli', label: 'Ways in', onChange: s.fn('onChange') }),
      steps: [{ focus: row('Terminal') }, { key: 'up' }, { key: 'end' }],
      expect: { calls: { onChange: [['web']] } },
    },
  ],
});

export default [sideTabs];
