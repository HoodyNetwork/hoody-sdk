// Behaviour contract of the calendar button (src/term/scenario). The terminal keeps the button (its
// name and disabled state) and hands the calendar itself to the web, so what both sides share is: the button is there,
// a disabled one is inert, and nothing is picked by opening it.
import { scenarios } from '../scenario-types';
import { DatePickButton } from './DatePickButton';

const CAL = 'the calendar\'s own state: the terminal hands the calendar to the web (the date is typed in the field beside it)';

const dp = scenarios('DatePickButton', DatePickButton, {
  ignored: { value: CAL, minValue: CAL, maxValue: CAL, onChange: 'never called in the terminal: picking is in the web calendar' },
  unsupported: {},
  cases: [
    {
      // Pressing it is not driven here: the terminal's hand-off needs the router, which the scenario mount has no
      // provider for (handoffs.term.test.tsx presses it under one).
      name: 'enabled: the button is offered and nothing is picked by itself',
      props: (s) => ({ value: '2026-11-11', onPick: s.fn('onPick') }),
      steps: [{ focus: { role: 'button', name: 'Pick a date' } }],
      expect: { calls: { onPick: 0 }, nodes: [{ target: { role: 'button', name: 'Pick a date' }, states: { disabled: false } }] },
    },
    {
      name: 'disabled: the button is off and inert',
      props: (s) => ({ value: '', onPick: s.fn('onPick'), isDisabled: true }),
      steps: [{ click: { role: 'button', name: 'Pick a date' }, force: true }, { press: { role: 'button', name: 'Pick a date' }, force: true }],
      expect: { calls: { onPick: 0 }, nodes: [{ target: { role: 'button', name: 'Pick a date' }, states: { disabled: true } }] },
    },
  ],
});

export default [dp];
