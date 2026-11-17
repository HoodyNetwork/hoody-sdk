// Behaviour contract of Select, Combobox and EntityPicker, run on the web and in the terminal (src/term/scenario).
// Roles are React Aria's: a Select is a button (named by its shown value and its label) popping up a
// listbox of options; a Combobox an input of role combobox.
import { createElement as h } from 'react';
import { scenarios } from '../scenario-types';
import { Combobox, EntityPicker, Select } from './Select';
import type { Option } from './more.pure';

const OPTS: Option[] = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Bravo', isDisabled: true },
  { value: 'c', label: 'Charlie' },
];
/** Somewhere else to put the focus (leaving a field commits it). */
const withNext = (C: unknown, p: Record<string, unknown>, _s: unknown, html: (t: string, p: Record<string, unknown> | null, ...c: unknown[]) => unknown) =>
  html('div', null, h(C as never, p), html('button', { type: 'button' }, 'Next')) as never;

const ARIA: Record<string, string> = { 'aria-*': 'relations are carried by the semantics tree' };

// ── Select ───────────────────────────────────────────────────────────────────────────────────

const TRIGGER = { role: 'button', name: 'Region', exact: false } as const;
const sel = scenarios('Select', Select, {
  ignored: { ...ARIA, size: 'read: toolbar density is a web layout: a terminal field is one row' },
  unsupported: {
    isRequired: 'refusing a submit with no pick needs a Form submit: more.term.test.tsx (web: native validity of the hidden select)',
  },
  cases: [
    {
      name: 'closed: the button names the placeholder and the label; Enter opens the list',
      props: (s) => ({ label: 'Region', options: OPTS, value: undefined, onChange: s.fn('onChange') }),
      steps: [
        { expect: { nodes: [{ target: TRIGGER, name: 'Choose… Region', states: { expanded: false } }] } },
        { press: TRIGGER },
      ],
      expect: { calls: { onChange: 0 }, nodes: [{ target: TRIGGER, states: { expanded: true } }, { target: { role: 'option', name: 'Bravo' }, states: { disabled: true } }] },
    },
    {
      name: 'from the picked option ↓ skips a disabled one; Enter picks and closes',
      props: (s) => ({ label: 'Region', options: OPTS, value: 'a', onChange: s.fn('onChange') }),
      control: { value: 'value', onChange: 'onChange' },
      // Web (happy-dom): React Aria moves the focus into the opened list on a later frame the web driver does not reach,
      // so ↓ and Enter land on the trigger (the focused node after the press and after ↓ is the trigger).
      // A browser and the terminal both move it; the click case below holds the pick on both sides.
      only: { platform: 'term', why: 'web driver: React Aria focuses the opened list on a frame happy-dom never runs' },
      steps: [{ press: TRIGGER }, { key: 'down' }, { key: 'enter' }],
      expect: { calls: { onChange: [['c']] }, nodes: [{ target: TRIGGER, name: 'Charlie Region', states: { expanded: false } }, { target: { role: 'option', name: 'Alpha' }, absent: true }] },
    },
    {
      name: 'a click on an option picks it',
      props: (s) => ({ label: 'Region', options: OPTS, value: 'a', onChange: s.fn('onChange') }),
      // force: a terminal option is a mouse target, not a focus stop (the list holds the keyboard).
      steps: [{ press: TRIGGER }, { click: { role: 'option', name: 'Charlie' }, force: true }],
      expect: { calls: { onChange: [['c']] } },
    },
    {
      name: 'controlled without a parent update: reports the pick, closes, still names the parent\'s value',
      props: (s) => ({ label: 'Region', options: OPTS, value: 'a', onChange: s.fn('onChange') }),
      steps: [{ press: TRIGGER }, { click: { role: 'option', name: 'Charlie' }, force: true }],
      expect: { calls: { onChange: [['c']] }, nodes: [{ target: TRIGGER, name: 'Alpha Region', states: { expanded: false } }] },
    },
    {
      name: 'clicking the option already picked closes and reports nothing',
      props: (s) => ({ label: 'Region', options: OPTS, value: 'a', onChange: s.fn('onChange') }),
      steps: [{ press: TRIGGER }, { click: { role: 'option', name: 'Alpha' }, force: true }],
      expect: { calls: { onChange: 0 }, nodes: [{ target: TRIGGER, name: 'Alpha Region', states: { expanded: false } }] },
    },
    {
      name: 'the picked option is selected; Escape closes without a change',
      props: (s) => ({ label: 'Region', options: OPTS, value: 'a', onChange: s.fn('onChange') }),
      steps: [
        { press: TRIGGER },
        { expect: { nodes: [{ target: { role: 'option', name: 'Alpha' }, states: { selected: true } }, { target: { role: 'option', name: 'Charlie' }, states: { selected: false } }] } },
        { key: 'escape' },
      ],
      expect: { calls: { onChange: 0 }, nodes: [{ target: TRIGGER, states: { expanded: false } }] },
    },
    {
      name: 'a letter on the closed button picks the next option starting with it',
      props: (s) => ({ label: 'Region', options: OPTS, value: 'a', onChange: s.fn('onChange') }),
      steps: [{ focus: TRIGGER }, { key: 'c' }],
      expect: { calls: { onChange: [['c']] } },
    },
    {
      name: 'disabled: inert',
      props: (s) => ({ label: 'Region', options: OPTS, value: 'a', isDisabled: true, onChange: s.fn('onChange') }),
      steps: [{ click: TRIGGER, force: true }, { key: 'enter' }],
      expect: { calls: { onChange: 0 }, nodes: [{ target: TRIGGER, states: { disabled: true, expanded: false } }] },
    },
    {
      name: 'an error message describes it',
      props: { label: 'Region', options: OPTS, value: 'a', errorMessage: 'Pick a region near you.' },
      steps: [],
      expect: { nodes: [{ target: TRIGGER, description: 'Pick a region near you.' }] },
    },
  ],
});

// ── Combobox ─────────────────────────────────────────────────────────────────────────────────

const CB = { role: 'combobox', name: 'Computer' } as const;
const combo = scenarios('Combobox', Combobox, {
  ignored: { ...ARIA, size: 'toolbar density is a web layout: a terminal field is one row', descriptionSlots: 'the web Combobox does not use it either (options always read their description)' },
  unsupported: {},
  cases: [
    {
      name: 'typing filters; ↓ then Enter picks',
      props: (s) => ({ label: 'Computer', options: OPTS, value: undefined, onChange: s.fn('onChange') }),
      control: { value: 'value', onChange: 'onChange' },
      steps: [
        { type: [CB, 'char'] },
        { expect: { nodes: [{ target: { role: 'option', name: 'Charlie' } }, { target: { role: 'option', name: 'Alpha' }, absent: true }] } },
        { key: 'down' }, { key: 'enter' },
      ],
      expect: { calls: { onChange: [['c']] }, nodes: [{ target: CB, value: 'Charlie' }] },
    },
    {
      name: 'leaving resets the text to the pick',
      props: (s) => ({ label: 'Computer', options: OPTS, value: 'a', onChange: s.fn('onChange') }),
      mount: withNext as never,
      // Tab leaves: React Aria hides everything outside the open list from the tree, so Next cannot be targeted while open.
      steps: [{ type: [CB, 'zz'] }, { expect: { nodes: [{ target: CB, value: 'Alphazz' }] } }, { key: 'tab' }],
      expect: { calls: { onChange: 0 }, nodes: [{ target: CB, value: 'Alpha' }] },
    },
    {
      name: 'picking the option already picked reports nothing; the text is its label',
      props: (s) => ({ label: 'Computer', options: OPTS, value: 'a', onChange: s.fn('onChange') }),
      steps: [{ type: [CB, 'a'] }, { click: { role: 'option', name: 'Alpha' }, force: true }],
      expect: { calls: { onChange: 0 }, nodes: [{ target: CB, value: 'Alpha' }] },
    },
    {
      name: 'controlled without a parent update: Enter reports the pick once',
      // Not asserted: leaving afterwards. On the web React Aria's blur commit selects the focused row again there.
      props: (s) => ({ label: 'Computer', options: OPTS, value: undefined, onChange: s.fn('onChange') }),
      steps: [{ type: [CB, 'char'] }, { key: 'down' }, { key: 'enter' }],
      expect: { calls: { onChange: [['c']] } },
    },
    {
      name: 'free entry: Enter on typed text with no option highlighted hands the text over and empties the box',
      props: (s) => ({ label: 'Computer', options: OPTS, value: undefined, onChange: s.fn('onChange'), onCommitText: s.fn('onCommitText', () => true) }),
      steps: [{ type: [CB, 'delta'] }, { key: 'enter' }],
      expect: { calls: { onCommitText: [['delta']], onChange: 0 }, nodes: [{ target: CB, value: '' }] },
    },
    {
      name: 'free entry: after Enter took the text the list stays closed, so it covers nothing under the field',
      props: (s) => ({ label: 'Computer', options: OPTS, value: undefined, onChange: s.fn('onChange'), onCommitText: s.fn('onCommitText', () => true) }),
      steps: [{ type: [CB, 'delta'] }, { key: 'enter' }],
      expect: { calls: { onCommitText: [['delta']] }, nodes: [{ target: CB, value: '', states: { expanded: false } }] },
    },
    {
      name: 'free entry refused: the text stays for the page to say why',
      props: (s) => ({ label: 'Computer', options: OPTS, value: undefined, onChange: s.fn('onChange'), onCommitText: s.fn('onCommitText', () => false) }),
      steps: [{ type: [CB, 'de lta'] }, { key: 'enter' }],
      expect: { calls: { onCommitText: [['de lta']], onChange: 0 }, nodes: [{ target: CB, value: 'de lta' }] },
    },
    {
      name: 'free entry: leaving the field hands the typed text over too; nothing typed is dropped',
      props: (s) => ({ label: 'Computer', options: OPTS, value: undefined, onChange: s.fn('onChange'), onCommitText: s.fn('onCommitText', () => true) }),
      mount: withNext as never,
      steps: [{ type: [CB, 'delta'] }, { key: 'tab' }],
      expect: { calls: { onCommitText: [['delta']], onChange: 0 }, nodes: [{ target: CB, value: '' }] },
    },
    {
      name: 'free entry: an option highlighted with ↓ is still picked, not handed over as text',
      props: (s) => ({ label: 'Computer', options: OPTS, value: undefined, onChange: s.fn('onChange'), onCommitText: s.fn('onCommitText', () => true) }),
      steps: [{ type: [CB, 'char'] }, { key: 'down' }, { key: 'enter' }],
      expect: { calls: { onChange: [['c']], onCommitText: 0 } },
    },
    {
      name: 'disabled: typing changes nothing',
      props: (s) => ({ label: 'Computer', options: OPTS, value: 'a', isDisabled: true, onChange: s.fn('onChange') }),
      steps: [{ type: [CB, 'x'], force: true }],
      expect: { calls: { onChange: 0 }, nodes: [{ target: CB, states: { disabled: true } }] },
    },
    {
      name: 'an error message makes it invalid and describes it; required is a state',
      props: { label: 'Computer', options: OPTS, value: undefined, errorMessage: 'That computer is gone.', isRequired: true },
      steps: [],
      expect: { nodes: [{ target: CB, states: { invalid: true, required: true }, description: 'That computer is gone.' }] },
    },
  ],
});

// ── EntityPicker ─────────────────────────────────────────────────────────────────────────────

const ep = scenarios('EntityPicker', EntityPicker, {
  ignored: { ...ARIA, size: 'toolbar density is a web layout: a terminal field is one row', descriptionSlots: 'passed to Combobox, which does not use it' },
  unsupported: {},
  cases: [
    {
      name: 'loading: says so and cannot be used',
      props: (s) => ({ label: 'Computer', options: undefined, isLoading: true, value: undefined, onChange: s.fn('onChange') }),
      steps: [],
      expect: { nodes: [{ target: CB, states: { disabled: true } }, { target: { text: 'Loading choices' } }] },
    },
    {
      name: 'an error offers Try again',
      props: (s) => ({ label: 'Computer', options: undefined, error: new Error('boom'), onRetry: s.fn('onRetry'), value: undefined, onChange: s.fn('onChange') }),
      steps: [{ press: { role: 'button', name: 'Try again' } }],
      expect: { calls: { onRetry: 1, onChange: 0 }, nodes: [{ target: { text: "Choices didn't load." } }] },
    },
    {
      name: 'loaded: typing and Enter pick',
      props: (s) => ({ label: 'Computer', options: OPTS, value: undefined, onChange: s.fn('onChange') }),
      control: { value: 'value', onChange: 'onChange' },
      steps: [{ type: [CB, 'alp'] }, { key: 'down' }, { key: 'enter' }],
      expect: { calls: { onChange: [['a']] } },
    },
    {
      name: 'free entry: while the list cannot be read the field stays open for typing',
      props: (s) => ({ label: 'Computer', options: undefined, error: new Error('boom'), onRetry: s.fn('onRetry'), value: undefined, onChange: s.fn('onChange'), onCommitText: s.fn('onCommitText', () => true) }),
      steps: [{ type: [CB, 'delta'] }, { key: 'enter' }],
      expect: { calls: { onCommitText: [['delta']], onChange: 0 }, nodes: [{ target: CB, states: { disabled: false } }] },
    },
    {
      name: 'disabled, required and an error message reach the combobox',
      props: { label: 'Computer', options: OPTS, value: undefined, isDisabled: true, isRequired: true, errorMessage: 'Pick one.' },
      steps: [],
      expect: { nodes: [{ target: CB, states: { disabled: true, required: true, invalid: true }, description: 'Pick one.' }] },
    },
  ],
});

export default [sel, combo, ep];
