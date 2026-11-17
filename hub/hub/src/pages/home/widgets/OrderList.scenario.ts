// Behaviour contract of the Customize list (web and terminal). Whatever it looks like:
// - a card's switch shows or hides it (onToggle with the card's key and the new state);
// - its up/down buttons move it one place (onMove with -1 / +1); the first card's up and the last card's down are off.
// Dragging by the grip (onMoveTo) is pointer-only on the web and has no terminal form: the buttons are its keyboard and
// single-pointer equivalent there, so the terminal ignores it. The web drag is pinned by the page's order tests.
import { scenarios } from '../../../kit/scenario-types';
import { OrderList } from './OrderList';

const all = [
  { key: 'start', title: 'Start something' },
  { key: 'realms', title: 'Your realms' },
  { key: 'shortcuts', title: 'Shortcuts' },
];

const props = (s: { fn: (n: string) => () => void }, hidden: string[] = []) => ({
  all,
  hiddenKeys: new Set(hidden),
  onToggle: s.fn('onToggle'),
  onMove: s.fn('onMove'),
  onMoveTo: s.fn('onMoveTo'),
});

export default scenarios('OrderList', OrderList, {
  ignored: {
    onMoveTo: 'the drag by the grip calls it; a grip is pointer-only and has no cell form, the up/down buttons reach the same order (web: order tests)',
  },
  unsupported: {},
  cases: [
    {
      name: 'the switch hides a shown card',
      covers: ['onToggle', 'hiddenKeys', 'all'],
      props: (s) => props(s),
      steps: [{ press: { role: 'switch', name: 'Your realms' } }],
      expect: { calls: { onToggle: [['realms', false]] } },
    },
    {
      name: 'the switch shows a hidden card',
      covers: ['onToggle', 'hiddenKeys'],
      props: (s) => props(s, ['shortcuts']),
      steps: [{ press: { role: 'switch', name: 'Shortcuts' } }],
      expect: { calls: { onToggle: [['shortcuts', true]] } },
    },
    {
      name: 'down moves a card one place down',
      covers: ['onMove'],
      props: (s) => props(s),
      steps: [{ press: { role: 'button', name: 'Move Start something down' } }],
      expect: { calls: { onMove: [['start', 1]] } },
    },
    {
      name: 'up moves a card one place up',
      covers: ['onMove'],
      props: (s) => props(s),
      steps: [{ press: { role: 'button', name: 'Move Shortcuts up' } }],
      expect: { calls: { onMove: [['shortcuts', -1]] } },
    },
    {
      name: 'the first card cannot go up',
      covers: ['all'],
      props: (s) => props(s),
      steps: [{ press: { role: 'button', name: 'Move Start something up' }, force: true }],
      expect: { calls: { onMove: 0 } },
    },
  ],
});
