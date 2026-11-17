// ComputerPicker and its trigger (web and terminal): the trigger names the pick then what it is for;
// it opens the panel; a pick reports once and closes; the pick again reports nothing; a value not among the rows shows
// the placeholder (never a stale name); loading disables the trigger.

import { scenarios } from '../scenario-types';
import { loose } from '../layouts/scenarioRoute';
import { ComputerPicker, PickerTrigger } from './ComputerPicker';

const COMPUTERS = [
  { id: 'a', name: 'atlas', running: true, state: 'Running', stateKind: 'running', place: 'Singapore · n12' },
  { id: 'b', name: 'birch', running: false, state: 'Stopped', stateKind: 'stopped' },
  { id: 'e', name: 'ember', running: true, state: 'Running', disabledReason: 'Already in the other pane' },
];

const picker = scenarios('ComputerPicker', loose(ComputerPicker), {
  ignored: {
    className: 'no CSS classes in a terminal',
    size: 'the web toolbar height (40/32/44 px); a terminal trigger is one row either way',
  },
  unsupported: { status: 'the error is PickerPanel\'s ErrorState (its own scenarios)' },
  cases: [
    {
      name: 'the trigger names the pick and its state, then the label; a pick reports once and closes',
      props: (s) => ({ label: 'Computer', computers: COMPUTERS, value: 'a', onChange: s.fn('onChange') }),
      covers: ['label', 'computers', 'value'],
      steps: [{ press: { role: 'button', name: /^atlas.*Running.*Computer$/ } }, { click: { role: 'radio', name: /^birch/ } }],
      expect: { calls: { onChange: [['b']] }, nodes: [{ target: { role: 'dialog' }, absent: true }] },
    },
    {
      name: 'the row already picked reports nothing; a disabled row says why',
      props: (s) => ({ label: 'Computer', computers: COMPUTERS, value: 'a', onChange: s.fn('onChange') }),
      covers: ['onChange'],
      steps: [{ press: { role: 'button', name: /Computer$/ } }, { expect: { nodes: [{ target: { role: 'radio', name: /^ember.*Already in the other pane/ }, states: { disabled: true } }] } }, { click: { role: 'radio', name: /^atlas/ } }],
      expect: { calls: { onChange: 0 } },
    },
    {
      name: 'a value not among the rows shows the placeholder, never a stale name',
      props: (s) => ({ label: 'Computer', computers: COMPUTERS, value: 'gone', onChange: s.fn('onChange'), placeholder: 'Pick a computer' }),
      covers: ['placeholder'],
      steps: [],
      expect: { nodes: [{ target: { role: 'button', name: /^Pick a computer/ } }] },
    },
    {
      name: 'loading (no rows) disables the trigger; disabled too',
      props: (s) => ({ label: 'Computer', computers: undefined, value: undefined, onChange: s.fn('onChange'), isDisabled: false }),
      covers: ['isDisabled'],
      steps: [],
      expect: { nodes: [{ target: { role: 'button', name: /Computer$/ }, states: { disabled: true } }] },
    },
    {
      name: 'isDisabled with rows loaded: the trigger says disabled and a press opens nothing',
      props: (s) => ({ label: 'Computer', computers: COMPUTERS, value: 'a', onChange: s.fn('onChange'), isDisabled: true }),
      covers: ['isDisabled'],
      steps: [{ press: { role: 'button', name: /Computer$/ }, force: true }],
      expect: { calls: { onChange: 0 }, nodes: [{ target: { role: 'button', name: /Computer$/ }, states: { disabled: true } }, { target: { role: 'dialog' }, absent: true }] },
    },
  ],
});

const trigger = scenarios('PickerTrigger', loose(PickerTrigger), {
  ignored: {
    className: 'no CSS classes in a terminal',
    width: 'a web field width class; the terminal trigger takes its row',
    triggerRef: 'a DOM button ref for a page to focus; terminal pages focus through FocusControl',
  },
  unsupported: { lead: 'a decorative mark (hidden from the tree on both)' },
  cases: [
    {
      name: 'named by what it shows (text, tail, spoken words), then what it is for',
      props: () => ({ label: 'Project', text: 'Acme', tail: 'shared', spoken: 'default' }),
      covers: ['label', 'text', 'tail', 'spoken'],
      steps: [],
      expect: { nodes: [{ target: { role: 'button', name: 'Acme shared default Project' } }] },
    },
    {
      name: 'disabled: inert',
      props: () => ({ label: 'Project', text: 'Loading', placeholder: true, isDisabled: true }),
      covers: ['isDisabled', 'placeholder'],
      steps: [],
      expect: { nodes: [{ target: { role: 'button', name: /Project$/ }, states: { disabled: true } }] },
    },
  ],
});

export default [picker, trigger];
