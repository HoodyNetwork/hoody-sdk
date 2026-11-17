// Behaviour contract of the id and copy family (web and terminal). Copying itself is a host effect
// (the browser clipboard, OSC 52) and not a callback; what both sides must do: a full id never shows, each copy control
// is named for what it copies, a disabled copy is inert, a lazy value is read only on the press.
import { scenarios } from '../scenario-types';
import { CodeBlock, CodeLine, CopyButton, CopyField, IdChip } from './Ids';

const ID = 'abcdef0123456789abcdef01';

const button = scenarios('CopyButton', CopyButton, {
  ignored: { className: 'no CSS classes in a terminal', size: 'web button height in pixels; a terminal row is one line, so the trigger draws the same at sm and md' },
  unsupported: { withLabel: 'look only: the name is the label either way', variant: 'look only: primary shows the label as its word; the name is the label either way' },
  cases: [
    {
      name: 'named for what it copies; the lazy value is read once, on the press',
      props: (s) => ({ label: 'Copy the token', getValue: s.fn('getValue', () => 'tok') }),
      steps: [{ expect: { calls: { getValue: 0 } } }, { press: { role: 'button', name: 'Copy the token' } }],
      expect: { calls: { getValue: 1 } },
    },
    {
      name: 'disabled: neither a click nor a key reads the value',
      props: (s) => ({ label: 'Copy the token', isDisabled: true, getValue: s.fn('getValue', () => 'tok') }),
      steps: [{ click: { role: 'button', name: 'Copy the token' }, force: true }],
      expect: { calls: { getValue: 0 }, nodes: [{ target: { role: 'button', name: 'Copy the token' }, states: { disabled: true } }] },
    },
  ],
});

const chip = scenarios('IdChip', IdChip, {
  ignored: { className: 'no CSS classes in a terminal' },
  unsupported: {},
  cases: [
    {
      name: 'shows the id masked, never whole; its copy is named',
      props: { id: ID, label: 'Box' },
      steps: [],
      expect: { neverShown: [ID], nodes: [{ target: { text: 'abcd…ef01' } }, { target: { role: 'button', name: 'Copy full reference' } }] },
    },
    {
      name: 'noCopy: no copy control (it sits in a pressable row)',
      props: { id: ID, noCopy: true },
      steps: [],
      expect: { neverShown: [ID], nodes: [{ target: { role: 'button', name: 'Copy full reference' }, absent: true }] },
    },
  ],
});

const field = scenarios('CopyField', CopyField, {
  ignored: { className: 'no CSS classes in a terminal' },
  unsupported: { plain: 'look only (link colour)', description: 'help text under the value: drawn, not behaviour', copyName: 'covered by the default copy name' },
  cases: [
    {
      name: 'a masked value never shows whole',
      props: { label: 'Reference', value: ID, masked: true },
      steps: [],
      expect: { neverShown: [ID] },
    },
    {
      name: 'noCopy: no copy control',
      props: { label: 'Reference', value: 'x', noCopy: true },
      steps: [],
      expect: { nodes: [{ target: { role: 'button' }, absent: true }] },
    },
  ],
});

const line = scenarios('CodeLine', CodeLine, {
  ignored: { className: 'no CSS classes in a terminal' },
  unsupported: { copy: 'what Copy gives: a host effect, no callback' },
  cases: [
    {
      name: 'the value and its copy, named by copyLabel',
      props: { value: '/setprivacy', copyLabel: 'Copy the command' },
      steps: [],
      expect: { nodes: [{ target: { text: '/setprivacy' } }, { target: { role: 'button', name: 'Copy the command' } }] },
    },
    {
      name: 'masked: shown as a masked id, never whole',
      props: { value: ID, masked: true },
      steps: [],
      expect: { neverShown: [ID] },
    },
  ],
});

const block = scenarios('CodeBlock', CodeBlock, {
  ignored: {
    className: 'no CSS classes in a terminal',
    wrap: 'the terminal always wraps code lines (it has no sideways scroll); Copy gives the exact text either way',
    maxHeight: 'the terminal block is as tall as its lines; the page body scrolls',
  },
  unsupported: {},
  cases: [
    {
      name: 'step lines: each line copies itself by its caption, and Copy all copies every line',
      props: { label: 'Install', lines: [{ code: 'apt update', caption: 'Refresh' }, { code: 'apt install hoody', caption: 'Install' }] },
      steps: [],
      expect: { nodes: [{ target: { role: 'button', name: 'Copy all' } }, { target: { role: 'button', name: 'Copy Refresh' } }, { target: { role: 'button', name: 'Copy Install' } }] },
    },
  ],
});

export default [button, chip, field, line, block];
