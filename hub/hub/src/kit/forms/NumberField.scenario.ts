// Behaviour contract of NumberField, run on the web and in the terminal (src/term/scenario). Its role
// is React Aria's: a plain textbox.
import { createElement as h } from 'react';
import { scenarios } from '../scenario-types';
import { NumberField } from './NumberField';

/** Somewhere else to put the focus (leaving a field commits it). */
const withNext = (C: unknown, p: Record<string, unknown>, _s: unknown, html: (t: string, p: Record<string, unknown> | null, ...c: unknown[]) => unknown) =>
  html('div', null, h(C as never, p), html('button', { type: 'button' }, 'Next')) as never;
const NEXT = { role: 'button', name: 'Next' } as const;

const FOCUS_EVENTS: Record<string, string> = {
  'onFocus*': 'GAP: focus events are not raised by this terminal field', onBlur: 'GAP: focus events are not raised by this terminal field',
  'onKey*': 'keys go through the focus store', 'on(Copy|Cut|Paste|Select|Composition|BeforeInput|Input)*': 'GAP: DOM editing events are not raised in the terminal (onChange is)',
};
const ARIA: Record<string, string> = { 'aria-*': 'relations are carried by the semantics tree' };
const PLUMBING: Record<string, string> = {
  ...ARIA, id: 'the semantics id comes from sem', form: 'no HTML forms', hidden: 'a hidden control is not rendered by its page', inert: 'no inert subtrees in the terminal',
};

const NF = { role: 'textbox', name: 'CPUs' } as const;
const nf = scenarios('NumberField', NumberField, {
  ignored: {
    ...PLUMBING, ...FOCUS_EVENTS,
    commitBehavior: 'commits on leaving or Enter, as the web default', isWheelDisabled: 'no wheel stepping in the terminal field',
    incrementAriaLabel: 'the [+] cell is mouse-only, not a node', decrementAriaLabel: 'the [−] cell is mouse-only, not a node',
  },
  unsupported: {
    validate: 'custom validation: shared useValidation path, covered by TextField scenarios',
  },
  cases: [
    {
      name: '↑ steps up and reports the number',
      props: (s) => ({ label: 'CPUs', value: 4, minValue: 1, maxValue: 8, step: 1, onChange: s.fn('onChange') }),
      control: { value: 'value', onChange: 'onChange' },
      steps: [{ focus: NF }, { key: 'up' }],
      expect: { calls: { onChange: [[5]] }, nodes: [{ target: NF, value: '5' }] },
    },
    {
      name: 'uncontrolled from defaultValue: ↓ steps down',
      props: (s) => ({ label: 'CPUs', defaultValue: 3, onChange: s.fn('onChange') }),
      steps: [{ focus: NF }, { key: 'down' }],
      expect: { calls: { onChange: [[2]] }, nodes: [{ target: NF, value: '2' }] },
    },
    {
      name: 'typed text commits on leaving, clamped to the bounds',
      props: (s) => ({ label: 'CPUs', value: 4, minValue: 1, maxValue: 8, onChange: s.fn('onChange') }),
      control: { value: 'value', onChange: 'onChange' },
      mount: withNext as never,
      steps: [{ setValue: [NF, '42'] }, { focus: NEXT }],
      expect: { calls: { onChange: [[8]] }, nodes: [{ target: NF, value: '8' }] },
    },
    {
      name: 'typing refuses what is not part of a number',
      props: (s) => ({ label: 'CPUs', onChange: s.fn('onChange') }),
      steps: [{ type: [NF, '1x2'] }],
      expect: { calls: { onChange: 0 }, nodes: [{ target: NF, value: '12' }] },
    },
    {
      name: 'leaving snaps typed text to the step (counted from the minimum)',
      props: (s) => ({ label: 'CPUs', value: 10, minValue: 10, maxValue: 100, step: 5, onChange: s.fn('onChange') }),
      control: { value: 'value', onChange: 'onChange' },
      mount: withNext as never,
      steps: [{ setValue: [NF, '22'] }, { focus: NEXT }],
      expect: { calls: { onChange: [[20]] }, nodes: [{ target: NF, value: '20' }] },
    },
    {
      name: 'at rest it shows the number grouped',
      props: { label: 'CPUs', value: 1234567 },
      steps: [],
      expect: { nodes: [{ target: NF, value: '1,234,567' }] },
    },
    {
      name: 'disabled: typing changes nothing',
      props: (s) => ({ label: 'CPUs', value: 4, isDisabled: true, onChange: s.fn('onChange') }),
      steps: [{ type: [NF, '1'], force: true }],
      expect: { calls: { onChange: 0 }, nodes: [{ target: NF, states: { disabled: true } }] },
    },
    {
      name: 'read-only: reachable, ↑ changes nothing',
      props: (s) => ({ label: 'CPUs', value: 4, isReadOnly: true, onChange: s.fn('onChange') }),
      steps: [{ focus: NF }, { key: 'up' }],
      expect: { calls: { onChange: 0 }, nodes: [{ target: NF, states: { readonly: true } }] },
    },
    {
      name: 'an error message makes it invalid and describes it; required is a state',
      props: { label: 'CPUs', value: 4, errorMessage: 'Too many for this plan.', isRequired: true },
      steps: [],
      expect: { nodes: [{ target: NF, states: { invalid: true, required: true }, description: 'Too many for this plan.' }] },
    },
    {
      name: 'isInvalid without a message is invalid',
      props: { label: 'CPUs', value: 4, isInvalid: true },
      steps: [],
      expect: { nodes: [{ target: NF, states: { invalid: true } }] },
    },
    {
      name: 'autoFocus takes the focus',
      props: { label: 'CPUs', value: 4, autoFocus: true },
      steps: [],
      expect: { focused: NF },
    },
  ],
});

export default [nf];
