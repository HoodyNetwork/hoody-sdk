// Behaviour contract of the small display pieces (web and terminal). Most are PRESENTATIONAL: they show words and own
// no behaviour, so their cases only pin what a reader gets (the words, a tag's tip, a remove button's name). The only
// actions here are a removable Tag's remove button and StatusToggle's press. Look-only props are `ignored` with their
// reason.
import { scenarios } from '../scenario-types';
import { Facts, Monogram, RowNote, StatStrip, StatTile, StatusPill, StatusToggle, Tag } from './Display';

const look = 'look only: the terminal has no icon set or pixel sizes; a tone always shows its text mark';
const dlName = 'names the web <dl>, which no reader exposes as a role; the terminal draws the same label-value lines';

export default [
  scenarios('Tag', Tag, {
    ignored: { className: 'no CSS classes in a terminal' },
    unsupported: {},
    cases: [
      {
        name: 'a removable tag: its remove button is named by the tag and removes it',
        props: (s) => ({ children: 'linux', onRemove: s.fn('onRemove') }),
        steps: [{ press: { role: 'button', name: 'Remove linux' } }],
        expect: { calls: { onRemove: 1 } },
      },
      {
        name: 'a tag with a tip: its words open what it means',
        props: { children: 'system', tip: 'Made by the Hub, not by you' },
        steps: [{ press: { role: 'button', name: /system/ } }],
        expect: { nodes: [{ target: { text: 'Made by the Hub, not by you' } }] },
      },
    ],
  }),
  scenarios('StatTile', StatTile, {
    ignored: { className: 'no CSS classes in a terminal', icon: look },
    unsupported: {},
    cases: [
      {
        name: 'label, value and hint as words (presentational)',
        props: { label: 'Computers', value: '12', hint: '3 stopped', tip: 'Every computer you own' },
        steps: [],
        expect: { nodes: [{ target: { role: 'button', name: 'About Computers' } }, { target: { text: '12' } }, { target: { text: '3 stopped' } }] },
      },
    ],
  }),
  scenarios('StatusPill', StatusPill, {
    ignored: { className: 'no CSS classes in a terminal', icon: look },
    unsupported: {},
    cases: [
      {
        name: 'the status in words, never colour alone (presentational)',
        props: { tone: 'danger', children: 'Failed' },
        steps: [],
        expect: { nodes: [{ target: { text: 'Failed', exact: false } as never }] },
      },
    ],
  }),
  scenarios('StatusToggle', StatusToggle, {
    ignored: { className: 'no CSS classes in a terminal' },
    unsupported: {},
    cases: [
      {
        name: 'one toggle named by its words, pressed while on; a press asks the caller to change the state',
        props: (s) => ({ tone: 'ok', dot: true, children: 'Enabled', isPressed: true, onPress: s.fn('onPress') }),
        steps: [{ expect: { nodes: [{ target: { role: 'button', name: 'Enabled' }, states: { pressed: true } }] } }, { press: { role: 'button', name: 'Enabled' } }],
        expect: { calls: { onPress: 1 } },
      },
      {
        name: 'a state that cannot be told reads as mixed',
        props: (s) => ({ tone: 'warn', children: 'Unknown', isPressed: 'mixed', onPress: s.fn('onPress') }),
        steps: [],
        expect: { nodes: [{ target: { role: 'button', name: 'Unknown' }, states: { pressed: 'mixed' } }] },
      },
      {
        name: 'a disabled toggle refuses presses',
        props: (s) => ({ children: 'Disabled', isPressed: false, isDisabled: true, onPress: s.fn('onPress') }),
        steps: [{ press: { role: 'button', name: 'Disabled' }, force: true }],
        expect: { calls: { onPress: 0 }, nodes: [{ target: { role: 'button', name: 'Disabled' }, states: { disabled: true, pressed: false } }] },
      },
    ],
  }),
  scenarios('Monogram', Monogram, {
    ignored: { className: 'no CSS classes in a terminal', size: look, tint: 'decoration only (the web says so): no meaning to carry' },
    unsupported: {},
    cases: [
      { name: 'decoration only: nothing for a reader to act on (presentational)', props: { name: 'Personal' }, steps: [], expect: { nodes: [{ target: { role: 'button' }, absent: true }] } },
    ],
  }),
  scenarios('Facts', Facts, {
    ignored: { className: 'no CSS classes in a terminal', label: dlName },
    unsupported: {},
    cases: [
      {
        name: 'each fact\'s label and value as words (presentational)',
        props: { items: [{ label: 'Region', value: 'Singapore' }, { label: 'Plan', value: 'Plus' }] },
        steps: [],
        expect: { nodes: [{ target: { text: 'Singapore', exact: false } as never }, { target: { text: 'Plus', exact: false } as never }] },
      },
    ],
  }),
  scenarios('RowNote', RowNote, {
    ignored: {
      className: 'no CSS classes in a terminal',
      cut: 'no hover in a terminal, so a cut note wraps whole: the web\'s (hover: none) rule, where it wraps instead of hiding its end behind a tooltip',
    },
    unsupported: {},
    cases: [
      {
        name: 'the note in words, whole even when cut (presentational)',
        props: { cut: true, children: 'ada@laptop' },
        steps: [],
        expect: { nodes: [{ target: { text: 'ada@laptop' } }] },
      },
    ],
  }),
  scenarios('StatStrip', StatStrip, {
    ignored: { className: 'no CSS classes in a terminal', label: dlName },
    unsupported: {},
    cases: [
      {
        name: 'each stat as words (presentational)',
        props: { items: [{ label: 'Running', value: '4' }, { label: 'Stopped', value: '1' }] },
        steps: [],
        expect: { nodes: [{ target: { text: 'Running', exact: false } as never }, { target: { text: 'Stopped', exact: false } as never }] },
      },
    ],
  }),
];
