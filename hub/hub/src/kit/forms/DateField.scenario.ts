// Behaviour contract of DateField, run on the web and in the terminal (src/term/scenario).
// The value is the typed text: blur completes a compact or short date, ↑/↓ step a day, text being typed is not an
// error until the field is left, a page's errorMessage shows at once.
import { createElement as h, Fragment } from 'react';
import { scenarios, type Html } from '../scenario-types';
import { DateField } from './DateField';

const START = { role: 'textbox', name: 'Start' } as const;
/** Something to Tab to, so leaving the field is a real blur on both platforms. */
const withNext = (C: unknown, p: Record<string, unknown>, _s: unknown, html: Html) => h(Fragment, null, h(C as never, p), html('button', null, 'Next'));

export default scenarios('DateField', DateField, {
  ignored: {
    minValue: 'bounds the calendar only (typed text is never refused for it); the terminal has no calendar',
    maxValue: 'bounds the calendar only (typed text is never refused for it); the terminal has no calendar',
    className: 'no CSS classes in a terminal',
  },
  unsupported: {},
  cases: [
    {
      name: 'leaving completes a compact date',
      props: (s) => ({ label: 'Start', value: '', onChange: s.fn('onChange') }),
      control: { value: 'value', onChange: 'onChange' },
      mount: withNext,
      steps: [{ type: [START, '20261023'] }, { key: 'tab' }],
      expect: { nodes: [{ target: START, value: '2026-10-23', states: { invalid: false } }] },
    },
    {
      name: '↑ steps a day and reports it',
      props: (s) => ({ label: 'Start', value: '2026-10-23', onChange: s.fn('onChange') }),
      control: { value: 'value', onChange: 'onChange' },
      steps: [{ focus: START }, { key: 'up' }],
      expect: { calls: { onChange: [['2026-10-24']] }, nodes: [{ target: START, value: '2026-10-24' }] },
    },
    {
      name: 'unfinished text is not an error while typed, is one once left',
      props: (s) => ({ label: 'Start', value: '', onChange: s.fn('onChange') }),
      control: { value: 'value', onChange: 'onChange' },
      mount: withNext,
      steps: [
        { type: [START, '2026-1'] },
        { expect: { nodes: [{ target: START, states: { invalid: false } }] } },
        { key: 'tab' },
      ],
      expect: { nodes: [{ target: START, value: '2026-1', states: { invalid: true }, description: 'Use a date such as 2026-10-23.' }] },
    },
    {
      name: "a page's error shows at once",
      props: { label: 'Start', value: '2026-10-23', onChange: () => {}, errorMessage: 'Pick a day after today.' },
      steps: [],
      expect: { nodes: [{ target: START, states: { invalid: true }, description: 'Pick a day after today.' }] },
    },
    {
      name: 'its description describes it',
      props: { label: 'Start', value: '', onChange: () => {}, description: 'The first day it runs.' },
      steps: [],
      expect: { nodes: [{ target: START, description: 'The first day it runs.' }] },
    },
    {
      name: 'disabled: typing changes nothing',
      props: (s) => ({ label: 'Start', value: '2026-10-23', onChange: s.fn('onChange'), isDisabled: true }),
      steps: [{ type: [START, '9'], force: true }],
      expect: { calls: { onChange: 0 }, nodes: [{ target: START, value: '2026-10-23', states: { disabled: true } }] },
    },
    {
      name: 'required reads as required',
      props: { label: 'Start', value: '', onChange: () => {}, isRequired: true },
      steps: [],
      expect: { nodes: [{ target: START, states: { required: true } }] },
    },
  ],
});
