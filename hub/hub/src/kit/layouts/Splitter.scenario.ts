// Behaviour contract of Splitter (the two-pane split handle; web and terminal).
import { loose } from './scenarioRoute';
import { scenarios } from '../scenario-types';
import { Splitter } from './Splitter';

export default scenarios('Splitter', loose(Splitter), {
  ignored: { min: 'bounds are the caller\'s: the handle reports steps, never clamps', max: 'bounds are the caller\'s: the handle reports steps, never clamps' },
  unsupported: {
    onDragStart: 'pointer drag: a mouse drag is not a scenario step', onDrag: 'pointer drag: a mouse drag is not a scenario step',
    onDragEnd: 'pointer drag: a mouse drag is not a scenario step',
  },
  cases: [
    {
      name: 'vertical: Right and Left step by 5, Enter equalises',
      props: (s) => ({ orientation: 'vertical', value: 50, label: 'Resize panes', onStep: s.fn('onStep'), onEqualise: s.fn('onEqualise') }),
      steps: [{ focus: { role: 'separator', name: 'Resize panes' } }, { key: 'right' }, { key: 'left' }, { key: 'enter' }],
      expect: { calls: { onStep: [[5], [-5]], onEqualise: 1 } },
    },
    {
      name: 'horizontal: Down and Up step; Left and Right do nothing',
      props: (s) => ({ orientation: 'horizontal', value: 50, label: 'Resize panes', controls: 'top-pane', onStep: s.fn('onStep'), onEqualise: s.fn('onEqualise') }),
      steps: [{ focus: { role: 'separator', name: 'Resize panes' } }, { key: 'down' }, { key: 'up' }, { key: 'left' }, { key: 'right' }],
      expect: { calls: { onStep: [[5], [-5]], onEqualise: 0 } },
    },
  ],
});
