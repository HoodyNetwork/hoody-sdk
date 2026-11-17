// ReasonButton (web and terminal): a disabled action that says why. It stays focusable, a press does
// nothing, and the reason is read with it (its description) and shown while it has the focus.
import { scenarios } from '../../scenario-types';
import { loose } from '../scenarioRoute';
import { ReasonButton } from './ReasonButton';

export default scenarios('ReasonButton', loose(ReasonButton), {
  ignored: {
    className: 'no CSS classes in a terminal',
    actionId: 'a DOM data attribute focus-follow reads on the web; terminal focus follows the control itself',
    chipIcon: 'the web chip\'s pixel icon; a terminal button draws its label only',
    literal: 'the web theme case is not applied in a terminal: every label is drawn as written',
    dismiss: 'drops the web chip\'s end glyph; a terminal button draws no chip (Button.term ButtonFace), so there is nothing to drop',
  },
  unsupported: {},
  cases: [
    {
      name: 'focusable, inert, and says why; the name may say more than the label',
      props: () => ({ reason: 'Stop the computer first', children: 'Resize', name: 'Resize atlas', variant: 'secondary', size: 'sm' }),
      covers: ['reason', 'children', 'name', 'variant', 'size'],
      steps: [{ focus: { role: 'button', name: 'Resize atlas' } }, { key: 'enter' }],
      expect: { nodes: [{ target: { role: 'button', name: 'Resize atlas' }, states: { disabled: true }, description: /Stop the computer first/ }] },
    },
    {
      name: 'a press tells the page (to show the failing fact) and the button stays disabled',
      props: (s) => ({ reason: 'Add funds first', children: 'Confirm', onPress: s.fn('onPress') }),
      steps: [{ press: { role: 'button', name: 'Confirm' }, force: true }],
      expect: { calls: { onPress: 1 }, nodes: [{ target: { role: 'button', name: 'Confirm' }, states: { disabled: true } }] },
    },
    {
      name: 'a keyboard press tells the page too',
      props: (s) => ({ reason: 'Add funds first', children: 'Confirm', onPress: s.fn('onPress') }),
      steps: [{ focus: { role: 'button', name: 'Confirm' } }, { key: 'enter' }],
      expect: { calls: { onPress: 1 } },
    },
  ],
});
