// Behaviour contract of ListItemButton (web and terminal): a press calls onPress once, a disabled row refuses it, and
// the row's name for readers is its label, then " · " and its facts when it has any (the web reads it from the row's
// text, the terminal draws it as the button's words).
import { scenarios } from '../scenario-types';
import { ListItemButton } from './ListItemButton';

export default [
  scenarios('ListItemButton', ListItemButton, {
    ignored: {
      leading: 'a decorative mark hidden from readers; a terminal row draws no leading box',
    },
    unsupported: {},
    cases: [
      {
        name: 'a press calls onPress once; a row with facts is named label · facts',
        props: (s) => ({ children: 'OpenAI', meta: '88 models · API key', onPress: s.fn('onPress') }),
        steps: [{ press: { role: 'button', name: 'OpenAI · 88 models · API key' } }],
        expect: { calls: { onPress: 1 }, focused: { role: 'button', name: 'OpenAI · 88 models · API key' } },
      },
      {
        name: 'a row without facts is named by its label',
        props: (s) => ({ children: 'Mistral', onPress: s.fn('onPress') }),
        steps: [{ press: { role: 'button', name: 'Mistral' } }],
        expect: { calls: { onPress: 1 } },
      },
      {
        name: 'disabled: neither click nor keys press it',
        props: (s) => ({ children: 'OpenAI', isDisabled: true, onPress: s.fn('onPress') }),
        steps: [{ click: { role: 'button', name: 'OpenAI' }, force: true }, { press: { role: 'button', name: 'OpenAI' }, force: true }],
        expect: { calls: { onPress: 0 }, nodes: [{ target: { role: 'button', name: 'OpenAI' }, states: { disabled: true } }] },
      },
      {
        name: 'id: another element names itself by the row (aria-labelledby its id)',
        props: () => ({ children: 'Mistral', id: 'row-mistral' }),
        mount: (C, p, _s, h) => h('div', { role: 'group', 'aria-labelledby': 'row-mistral' }, h(C, p)),
        steps: [],
        expect: { nodes: [{ target: { role: 'group', name: 'Mistral' } }] },
      },
    ],
  }),
];
