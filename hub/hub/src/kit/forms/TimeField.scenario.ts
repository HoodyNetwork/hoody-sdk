// Behaviour contract of TimeField, run on the web and in the terminal (src/term/scenario). Its role is
// a plain textbox.
import { createElement as h } from 'react';
import { scenarios } from '../scenario-types';
import { TimeField } from './TimeField';

/** Somewhere else to put the focus (leaving a field commits it). */
const withNext = (C: unknown, p: Record<string, unknown>, _s: unknown, html: (t: string, p: Record<string, unknown> | null, ...c: unknown[]) => unknown) =>
  html('div', null, h(C as never, p), html('button', { type: 'button' }, 'Next')) as never;
const NEXT = { role: 'button', name: 'Next' } as const;

const AT = { role: 'textbox', name: 'At' } as const;
const tm = scenarios('TimeField', TimeField, {
  ignored: {},
  unsupported: {},
  cases: [
    {
      name: '930 becomes 09:30 on leaving',
      props: (s) => ({ label: 'At', value: '', onChange: s.fn('onChange') }),
      control: { value: 'value', onChange: 'onChange' },
      mount: withNext as never,
      steps: [{ type: [AT, '930'] }, { focus: NEXT }],
      expect: { calls: { onChange: [['9'], ['93'], ['930'], ['09:30']] }, nodes: [{ target: AT, value: '09:30' }] },
    },
    {
      name: '↑ steps by the step',
      props: (s) => ({ label: 'At', value: '09:30', step: 15, onChange: s.fn('onChange') }),
      steps: [{ focus: AT }, { key: 'up' }],
      expect: { calls: { onChange: [['09:45']] } },
    },
    {
      name: 'a non-time is invalid and says how to write one',
      props: { label: 'At', value: '99', onChange: () => {} },
      steps: [],
      expect: { nodes: [{ target: AT, states: { invalid: true }, description: 'Use a 24-hour time such as 09:30.' }] },
    },
    {
      name: 'the page error replaces the built-in one; required is a state',
      props: { label: 'At', value: '09:30', onChange: () => {}, errorMessage: 'Pick a time after now.', isRequired: true },
      steps: [],
      expect: { nodes: [{ target: AT, states: { invalid: true, required: true }, description: 'Pick a time after now.' }] },
    },
    {
      name: 'disabled: typing changes nothing',
      props: (s) => ({ label: 'At', value: '09:30', isDisabled: true, onChange: s.fn('onChange') }),
      steps: [{ type: [AT, '1'], force: true }],
      expect: { calls: { onChange: 0 }, nodes: [{ target: AT, states: { disabled: true } }] },
    },
  ],
});

export default [tm];
