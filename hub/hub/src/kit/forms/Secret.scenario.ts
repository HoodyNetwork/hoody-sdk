// Behaviour contract of SecretField and SecretInput (src/term/scenario). The security rule is the point:
// a secret is readable (frame, tree, attributes) only after Show, and a wipe takes it away for good.
import { scenarios } from '../scenario-types';
import { SecretField, SecretInput } from './Secret';

const SECRET = 'sk-live-Q7v9Zt4Wd2';
const CODES = 'aaaa-1111\nbbbb-2222';
const copyNone = async () => ({ wrote: false as const, reason: 'none' as const });

const field = scenarios('SecretField', SecretField, {
  ignored: { className: 'look only: CSS classes mean nothing in a terminal' },
  unsupported: {},
  cases: [
    {
      name: 'masked at first: the value is nowhere, Show is offered unpressed',
      props: { label: 'API key', value: SECRET },
      steps: [],
      expect: { neverShown: [SECRET, SECRET.slice(3, 12)], nodes: [{ target: { role: 'group', name: 'API key' } }, { target: { role: 'button', name: 'Show' }, states: { pressed: false } }] },
    },
    {
      name: 'Show reveals it; Hide masks it again',
      props: { label: 'API key', value: SECRET },
      steps: [
        { press: { role: 'button', name: 'Show' } },
        // The name says the state (Show / Hide): the web Button drops aria-pressed (reported), so no pressed state is asserted.
        { expect: { nodes: [{ target: { text: SECRET } }, { target: { role: 'button', name: 'Hide' } }] } },
        { press: { role: 'button', name: 'Hide' } },
      ],
      only: { platform: 'web', why: 'on the web the shown value is page text; the terminal tree keeps it out, see the term case below' },
      expect: { neverShown: [SECRET] },
    },
    {
      name: 'Show reveals it on screen only: no part of it in the agent-readable tree; Hide masks it again',
      props: { label: 'API key', value: SECRET },
      steps: [
        { press: { role: 'button', name: 'Show' } },
        { expect: { nodes: [{ target: { role: 'button', name: 'Hide' } }], treeNever: [SECRET, SECRET.slice(0, 8)] } },
        { press: { role: 'button', name: 'Hide' } },
      ],
      expect: { neverShown: [SECRET] },
    },
    {
      name: 'Copy calls onCopy (never with the value) and shows nothing',
      props: (s) => ({ label: 'API key', value: SECRET, onCopy: s.fn('onCopy') }),
      steps: [{ press: { role: 'button', name: 'Copy' } }],
      expect: { calls: { onCopy: [[]] }, neverShown: [SECRET] },
    },
    {
      name: 'a resetKey change wipes it: onWipe once, the gone text, no buttons',
      props: (s) => ({ label: 'API key', value: SECRET, resetKey: 1, onWipe: s.fn('onWipe') }),
      steps: [{ press: { role: 'button', name: 'Show' } }, { rerender: { resetKey: 2 } }],
      expect: {
        calls: { onWipe: 1 }, neverShown: [SECRET],
        nodes: [{ target: { text: 'It is no longer shown here.' } }, { target: { role: 'button', name: 'Show' }, absent: true }, { target: { role: 'button', name: 'Hide' }, absent: true }],
      },
    },
    {
      name: 'codes: masked items until Show codes',
      props: { label: 'Backup codes', value: CODES, format: 'lines' },
      steps: [
        { expect: { neverShown: ['aaaa-1111', 'bbbb-2222'] } },
        { press: { role: 'button', name: 'Show codes' } },
      ],
      only: { platform: 'web', why: 'on the web the shown value is page text; the terminal tree keeps it out, see the term case below' },
      expect: { nodes: [{ target: { text: 'bbbb-2222' } }, { target: { role: 'button', name: 'Copy codes' } }] },
    },
    {
      name: 'codes: Show codes reveals them on screen only, never in the agent-readable tree',
      props: { label: 'Backup codes', value: CODES, format: 'lines' },
      steps: [{ press: { role: 'button', name: 'Show codes' } }],
      expect: { nodes: [{ target: { role: 'button', name: 'Hide codes' } }], treeNever: ['aaaa-1111', 'bbbb-2222'] },
    },
    {
      name: 'the saved tick reports its change',
      props: (s) => ({ label: 'API key', value: SECRET, confirm: { checked: false, onChange: s.fn('saved') } }),
      steps: [{ press: { role: 'checkbox', name: 'I saved it' } }],
      expect: { calls: { saved: [[true]] } },
    },
    {
      name: 'load field: Show reads the stored value (onRead), Copy reads and copies (onReadCopy)',
      props: (s) => ({ label: 'Password', onRead: s.fn('onRead'), onReadCopy: s.fn('onReadCopy', copyNone) }),
      steps: [{ press: { role: 'button', name: 'Show' } }, { press: { role: 'button', name: 'Copy' } }],
      expect: { calls: { onRead: 1, onReadCopy: 1 } },
    },
    {
      name: 'load field while reading: no Show, Copy is off',
      props: (s) => ({ label: 'Password', onRead: s.fn('onRead'), isReading: true }),
      steps: [{ click: { role: 'button', name: 'Copy' }, force: true }],
      expect: { calls: { onRead: 0 }, nodes: [{ target: { role: 'button', name: 'Show' }, absent: true }, { target: { role: 'button', name: 'Copy' }, states: { disabled: true } }] },
    },
    {
      name: 'load field with its step closed: both buttons off',
      props: (s) => ({ label: 'Password', onRead: s.fn('onRead'), isReadDisabled: true }),
      steps: [{ click: { role: 'button', name: 'Show' }, force: true }],
      expect: { calls: { onRead: 0 }, nodes: [{ target: { role: 'button', name: 'Show' }, states: { disabled: true } }, { target: { role: 'button', name: 'Copy' }, states: { disabled: true } }] },
    },
  ],
});

const input = scenarios('SecretInput', SecretInput, {
  ignored: {
    kind: 'browser autofill hints (autocomplete, password-manager opt-outs): no autofill in a terminal',
    inputMode: 'touch keyboard hint: no touch keyboard in a terminal',
  },
  unsupported: {},
  cases: [
    {
      name: 'typed text is masked everywhere',
      props: (s) => ({ label: 'API key', value: '', onChange: s.fn('onChange') }),
      control: { value: 'value', onChange: 'onChange' },
      steps: [{ type: [{ role: 'textbox', name: 'API key' }, SECRET] }],
      expect: { neverShown: [SECRET, SECRET.slice(0, 8)], nodes: [{ target: { role: 'textbox', name: 'API key' }, states: { secret: true } }] },
    },
    {
      name: 'Show reveals what was typed',
      props: (s) => ({ label: 'API key', value: '', onChange: s.fn('onChange') }),
      control: { value: 'value', onChange: 'onChange' },
      steps: [{ type: [{ role: 'textbox', name: 'API key' }, 'abc123'] }, { press: { role: 'button', name: 'Show what you typed' } }],
      // The web input turns type=text, so its accessibility tree holds the value (what a browser does).
      only: { platform: 'web', why: 'the terminal tree keeps a revealed secret out: see the term case below' },
      expect: { nodes: [{ target: { role: 'textbox', name: 'API key' }, value: 'abc123', states: { secret: false } }, { target: { role: 'button', name: 'Hide what you typed' } }] },
    },
    {
      name: 'Show reveals what was typed on screen, never in the semantics tree',
      props: (s) => ({ label: 'API key', value: '', onChange: s.fn('onChange') }),
      control: { value: 'value', onChange: 'onChange' },
      steps: [{ type: [{ role: 'textbox', name: 'API key' }, 'abc123'] }, { press: { role: 'button', name: 'Show what you typed' } }],
      // The screen shows it on purpose; the agent export, snapshots and diagnostics say only "a secret, filled".
      only: { platform: 'term', why: 'a revealed secret stays out of the agent-readable tree; the web input turns type=text, so its a11y value holds it' },
      expect: { nodes: [{ target: { role: 'textbox', name: 'API key' }, states: { secret: true } }, { target: { role: 'button', name: 'Hide what you typed' } }], treeNever: ['abc123', 'abc'] },
    },
    {
      name: 'reveal false: no Show toggle',
      props: { label: 'API key', value: 'x', onChange: () => undefined, reveal: false },
      steps: [],
      expect: { nodes: [{ target: { role: 'button', name: 'Show what you typed' }, absent: true }] },
    },
    {
      name: 'disabled: typing changes nothing, the toggle is off',
      props: (s) => ({ label: 'API key', value: '', onChange: s.fn('onChange'), isDisabled: true }),
      steps: [{ type: [{ role: 'textbox', name: 'API key' }, 'z'], force: true }],
      expect: { calls: { onChange: 0 }, nodes: [{ target: { role: 'textbox', name: 'API key' }, states: { disabled: true } }, { target: { role: 'button', name: 'Show what you typed' }, states: { disabled: true } }] },
    },
    {
      name: 'required and a page error: required, invalid, described by the error',
      props: { label: 'API key', value: '', onChange: () => undefined, isRequired: true, errorMessage: 'That key was refused.' },
      steps: [],
      expect: { nodes: [{ target: { role: 'textbox', name: 'API key' }, states: { required: true, invalid: true }, description: 'That key was refused.' }] },
    },
    {
      name: 'a resetKey change clears what was typed',
      props: (s) => ({ label: 'API key', value: 'typed', onChange: s.fn('onChange'), resetKey: 1 }),
      steps: [{ rerender: { resetKey: 2 } }],
      expect: { calls: { onChange: [['']] } },
    },
    {
      name: 'autoFocus takes the focus',
      props: { label: 'API key', value: '', onChange: () => undefined, autoFocus: true },
      steps: [],
      expect: { focused: { role: 'textbox', name: 'API key' } },
    },
    {
      name: 'multiline: masked while typed, never readable',
      props: (s) => ({ label: 'Private key', value: '', onChange: s.fn('onChange'), multiline: true }),
      control: { value: 'value', onChange: 'onChange' },
      steps: [{ type: [{ role: 'textbox', name: 'Private key' }, SECRET], force: true }],
      expect: { neverShown: [SECRET, SECRET.slice(0, 8)], calls: { onChange: SECRET.split('').map((_, i) => [SECRET.slice(0, i + 1)]) } },
    },
    {
      name: 'multiline: Enter starts a new line in the value',
      props: (s) => ({ label: 'Private key', value: '', onChange: s.fn('onChange'), multiline: true }),
      control: { value: 'value', onChange: 'onChange' },
      steps: [{ type: [{ role: 'textbox', name: 'Private key' }, 'ab'], force: true }, { key: 'enter' }, { type: [{ role: 'textbox', name: 'Private key' }, 'c'], force: true }],
      expect: { neverShown: ['ab\nc'], calls: { onChange: [['a'], ['ab'], ['ab\n'], ['ab\nc']] } },
    },
  ],
});

export default [field, input];
