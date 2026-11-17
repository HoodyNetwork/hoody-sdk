// Behaviour contract of the code field (src/term/scenario): digits only, onComplete once with the
// whole code, wiped on a resetKey change.
import { scenarios } from '../scenario-types';
import { OtpField } from './OtpField';

const otp = scenarios('OtpField', OtpField, {
  ignored: {
    className: 'look only: CSS classes mean nothing in a terminal', name: 'no HTML forms (server field errors come through errorMessage)',
    inputRef: 'read: the page focuses the field through it; covered by the term unit test (focus handle)',
  },
  unsupported: {},
  cases: [
    {
      name: 'typing six digits reports each and completes once',
      props: (s) => ({ value: '', onChange: s.fn('onChange'), onComplete: s.fn('onComplete') }),
      control: { value: 'value', onChange: 'onChange' },
      steps: [{ type: [{ role: 'textbox', name: 'Code' }, '123456'] }],
      expect: {
        // The digits are proven by the calls: the terminal tree never carries them (a credential).
        calls: { onChange: [['1'], ['12'], ['123'], ['1234'], ['12345'], ['123456']], onComplete: [['123456']] },
        nodes: [{ target: { role: 'textbox', name: 'Code' } }],
      },
    },
    {
      name: 'anything but digits is dropped',
      props: (s) => ({ value: '', onChange: s.fn('onChange'), onComplete: s.fn('onComplete') }),
      control: { value: 'value', onChange: 'onChange' },
      steps: [{ type: [{ role: 'textbox', name: 'Code' }, '12a-3'] }],
      expect: { calls: { onChange: [['1'], ['12'], ['12'], ['12'], ['123']], onComplete: 0 }, nodes: [{ target: { role: 'textbox', name: 'Code' } }] },
    },
    {
      name: 'typed digits stay out of the semantics tree: a filled secret',
      props: (s) => ({ value: '', onChange: s.fn('onChange') }),
      control: { value: 'value', onChange: 'onChange' },
      steps: [{ type: [{ role: 'textbox', name: 'Code' }, '482913'] }],
      only: { platform: 'term', why: 'a one-time code is a credential in the agent-readable tree; the web a11y tree shows the input value' },
      expect: { nodes: [{ target: { role: 'textbox', name: 'Code' }, states: { secret: true } }], treeNever: ['482913', '4829'] },
    },
    {
      name: 'its label names it; the help describes it',
      props: { label: 'Authenticator code', value: '' , onChange: () => undefined },
      steps: [],
      expect: { nodes: [{ target: { role: 'textbox', name: 'Authenticator code' }, description: 'The 6-digit code from your authenticator app.' }] },
    },
    {
      name: 'disabled: typing changes nothing',
      props: (s) => ({ value: '', onChange: s.fn('onChange'), isDisabled: true }),
      steps: [{ type: [{ role: 'textbox', name: 'Code' }, '12'], force: true }],
      expect: { calls: { onChange: 0 }, nodes: [{ target: { role: 'textbox', name: 'Code' }, states: { disabled: true } }] },
    },
    {
      name: 'a wrong code: invalid, described by the error',
      props: { value: '', onChange: () => undefined, errorMessage: 'That code did not work.' },
      steps: [],
      expect: { nodes: [{ target: { role: 'textbox', name: 'Code' }, states: { invalid: true }, description: 'That code did not work.' }] },
    },
    {
      name: 'a resetKey change wipes the code',
      props: (s) => ({ value: '123', onChange: s.fn('onChange'), resetKey: 1 }),
      steps: [{ rerender: { resetKey: 2 } }],
      expect: { calls: { onChange: [['']] } },
    },
    {
      name: 'autoFocus takes the focus',
      props: { value: '', onChange: () => undefined, autoFocus: true },
      steps: [],
      expect: { focused: { role: 'textbox', name: 'Code' } },
    },
  ],
});

export default [otp];
