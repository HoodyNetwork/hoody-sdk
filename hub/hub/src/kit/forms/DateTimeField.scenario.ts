// Behaviour contract of DateTimeField, run on the web and in the terminal (src/term/scenario).
// A named group of two typed parts (date YYYY-MM-DD, time HH:MM); the value is epoch ms from the local calendar, or
// null while a part is empty or wrong. ↑/↓ step a day or `step` minutes; a part says it is wrong only once left; a
// value from outside replaces the parts; a page's errorMessage marks both parts invalid.
// The parts are found by position (date first): the terminal TextField does not name a field by aria-label yet.
import { scenarios } from '../scenario-types';
import { DateTimeField } from './DateTimeField';

const DATE = { role: 'textbox', nth: 0 } as const;
const TIME = { role: 'textbox', nth: 1 } as const;
const GROUP = { role: 'group', name: 'Around' } as const;
const at = (y: number, mo: number, d: number, h: number, mi: number): number => new Date(y, mo - 1, d, h, mi).getTime();

export default scenarios('DateTimeField', DateTimeField, {
  ignored: {
    minValue: 'bounds the calendar only (the typed parts are never refused for it); the terminal has no calendar',
    maxValue: 'bounds the calendar only (the typed parts are never refused for it); the terminal has no calendar',
    className: 'no CSS classes in a terminal',
  },
  unsupported: {},
  cases: [
    {
      name: 'a value shows as its two parts',
      props: { label: 'Around', value: at(2026, 10, 23, 9, 30), onChange: () => {} },
      steps: [],
      expect: { nodes: [{ target: DATE, value: '2026-10-23' }, { target: TIME, value: '09:30' }] },
    },
    {
      name: 'typing both parts reports the moment; leaving the time completes it',
      props: (s) => ({ label: 'Around', value: null, onChange: s.fn('onChange') }),
      control: { value: 'value', onChange: 'onChange' },
      steps: [{ type: [DATE, '2026-10-23'] }, { type: [TIME, '930'] }, { focus: DATE }],
      expect: { nodes: [{ target: DATE, value: '2026-10-23' }, { target: TIME, value: '09:30', states: { invalid: false } }] },
    },
    {
      name: '↑ on the date steps a day',
      props: (s) => ({ label: 'Around', value: at(2026, 10, 23, 9, 30), onChange: s.fn('onChange') }),
      control: { value: 'value', onChange: 'onChange' },
      steps: [{ focus: DATE }, { key: 'up' }],
      expect: { calls: { onChange: [[at(2026, 10, 24, 9, 30)]] }, nodes: [{ target: DATE, value: '2026-10-24' }] },
    },
    {
      name: '↓ on the time steps `step` minutes',
      props: (s) => ({ label: 'Around', value: at(2026, 10, 23, 9, 30), step: 5, onChange: s.fn('onChange') }),
      control: { value: 'value', onChange: 'onChange' },
      steps: [{ focus: TIME }, { key: 'down' }],
      expect: { calls: { onChange: [[at(2026, 10, 23, 9, 25)]] }, nodes: [{ target: TIME, value: '09:25' }] },
    },
    {
      name: 'a wrong time is not an error while typed, is one once left, and the value is null',
      props: (s) => ({ label: 'Around', value: at(2026, 10, 23, 9, 30), onChange: s.fn('onChange') }),
      control: { value: 'value', onChange: 'onChange' },
      steps: [
        { clear: TIME },
        { type: [TIME, '99'] },
        { expect: { nodes: [{ target: TIME, states: { invalid: false } }] } },
        { focus: DATE },
      ],
      expect: { nodes: [{ target: TIME, value: '99', states: { invalid: true }, description: 'Use a 24-hour time such as 09:30.' }] },
    },
    {
      name: 'a value from outside replaces the parts',
      props: { label: 'Around', value: at(2026, 10, 23, 9, 30), onChange: () => {} },
      steps: [{ rerender: { value: at(2026, 1, 2, 18, 5) } }],
      expect: { nodes: [{ target: DATE, value: '2026-01-02' }, { target: TIME, value: '18:05' }] },
    },
    {
      name: "a page's error marks both parts and shows",
      props: { label: 'Around', value: at(2026, 10, 23, 9, 30), onChange: () => {}, errorMessage: 'That is in the future.' },
      steps: [],
      expect: { nodes: [{ target: DATE, states: { invalid: true } }, { target: TIME, states: { invalid: true } }, { target: { text: /That is in the future\./ } }] },
    },
    {
      name: 'the group is named by the label and described by the description',
      props: { label: 'Around', value: null, onChange: () => {}, description: 'In your time zone.' },
      steps: [],
      expect: { nodes: [{ target: GROUP, description: 'In your time zone.' }] },
    },
    {
      name: 'disabled: both parts are inert',
      props: (s) => ({ label: 'Around', value: at(2026, 10, 23, 9, 30), onChange: s.fn('onChange'), isDisabled: true }),
      steps: [{ type: [DATE, '9'], force: true }, { type: [TIME, '9'], force: true }],
      expect: { calls: { onChange: 0 }, nodes: [{ target: DATE, value: '2026-10-23', states: { disabled: true } }, { target: TIME, states: { disabled: true } }] },
    },
    {
      name: 'required: both parts read as required',
      props: { label: 'Around', value: null, onChange: () => {}, isRequired: true },
      steps: [],
      expect: { nodes: [{ target: DATE, states: { required: true } }, { target: TIME, states: { required: true } }] },
    },
  ],
});
