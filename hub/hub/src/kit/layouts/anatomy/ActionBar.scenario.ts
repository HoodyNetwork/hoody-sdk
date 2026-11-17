// ActionBar, InlineActions, SuggestionActions and ActionControl: a group of actions as a person uses it (web and
// terminal). The bar is one named group: secondaries, then the primary, then ⋯ with the rest; a
// disabled action stays pressable for its reason and never runs; a link action is a link. Inline actions are a named
// group once there is more than one; suggestions are a list named by their visible label.
import { scenarios } from '../../scenario-types';
import { loose } from '../scenarioRoute';
import { ActionBar, ActionControl, InlineActions, SuggestionActions } from './ActionBar';

const SIZE = 'read and passed to the controls; sm and md are one control height in a terminal (one row), on the web a size class';

export default [
  scenarios('ActionBar', loose(ActionBar), {
    ignored: { size: SIZE },
    unsupported: {
      withoutPrimary: 'a Section moves the primary into its empty state: pinned in the Section scenarios and Layouts tests',
    },
    cases: [
      {
        name: 'one named group: pressing the primary and a secondary runs them; the rest are in More',
        props: (s) => ({
          label: 'Actions for this key',
          primary: { id: 'new', label: 'New key', onPress: s.fn('onNew') },
          secondary: [{ id: 'rot', label: 'Rotate', onPress: s.fn('onRotate') }],
          menu: [{ id: 'del', label: 'Delete', onAction: s.fn('onDelete') }],
        }),
        covers: ['label', 'primary', 'secondary', 'menu'],
        steps: [{ press: { role: 'button', name: 'New key' } }, { press: { role: 'button', name: 'Rotate' } }],
        expect: {
          calls: { onNew: 1, onRotate: 1, onDelete: 0 },
          nodes: [{ target: { role: 'group', name: 'Actions for this key' } }, { target: { role: 'button', name: /More/ } }],
        },
      },
    ],
  }),
  scenarios('ActionControl', loose(ActionControl), {
    ignored: { size: SIZE },
    unsupported: {},
    cases: [
      {
        name: 'a disabled action says why and never runs',
        props: (s) => ({ action: { id: 'up', label: 'Upgrade', onPress: s.fn('onUp'), disabledReason: 'Only the owner can upgrade' }, variant: 'secondary' }),
        covers: ['action', 'variant'],
        steps: [{ press: { role: 'button', name: /^Upgrade/ }, force: true }],
        expect: { calls: { onUp: 0 }, nodes: [{ target: { role: 'button', name: /^Upgrade/ }, states: { disabled: true }, description: /Only the owner can upgrade/ }] },
      },
      {
        name: 'a link action is a link to its address',
        props: { action: { id: 'docs', label: 'Read the guide', href: '/guide' }, variant: 'secondary' },
        steps: [],
        expect: { nodes: [{ target: { role: 'link', name: 'Read the guide' } }] },
      },
    ],
  }),
  scenarios('InlineActions', loose(InlineActions), {
    ignored: { size: SIZE },
    unsupported: {},
    cases: [
      {
        name: 'more than one action is a named group; each runs; the fourth is in More',
        props: (s) => ({
          label: 'Actions for this outcome',
          actions: [{ id: 'retry', label: 'Retry', onPress: s.fn('onRetry') }],
          primary: { id: 'fix', label: 'Put in the code', onPress: s.fn('onFix') },
          more: [{ id: 'discard', label: 'Discard', onAction: s.fn('onDiscard') }],
        }),
        covers: ['label', 'actions', 'primary', 'more'],
        steps: [{ press: { role: 'button', name: 'Retry' } }, { press: { role: 'button', name: 'Put in the code' } }],
        expect: { calls: { onRetry: 1, onFix: 1, onDiscard: 0 }, nodes: [{ target: { role: 'group', name: 'Actions for this outcome' } }] },
      },
    ],
  }),
  scenarios('SuggestionActions', loose(SuggestionActions), {
    ignored: { size: SIZE },
    unsupported: {},
    cases: [
      {
        name: 'every suggestion is drawn, in a list named by the visible label; pressing one runs it',
        props: (s) => ({
          label: 'Examples',
          actions: [
            { id: 'a', label: 'Back up nightly', onPress: s.fn('onA') },
            { id: 'b', label: 'Ping my site', onPress: s.fn('onB') },
          ],
        }),
        covers: ['label', 'actions'],
        steps: [{ press: { role: 'button', name: 'Ping my site' } }],
        expect: { calls: { onA: 0, onB: 1 }, nodes: [{ target: { role: 'list', name: 'Examples' } }, { target: { role: 'button', name: 'Back up nightly' } }] },
      },
    ],
  }),
];
