// Behaviour contract of Ledger and ShortcutTable (web and terminal). PRESENTATIONAL: label-value rows with no behaviour
// of their own; the one action is the shortfall strip's button, which presses itself. The rows' words are pinned.
import { createElement as h } from 'react';
import { scenarios } from '../scenario-types';
import { Button } from '../controls/Button';
import { Ledger, ShortcutTable } from './Ledger';

const dlName = 'names the web <dl>, which no reader exposes as a role; the terminal draws the same label-amount lines';

export default [
  scenarios('Ledger', Ledger, {
    ignored: { label: dlName },
    unsupported: {},
    cases: [
      {
        name: 'a shortfall row says so in words, and its strip\'s one button presses itself',
        props: (s) => ({
          label: 'Wallet',
          rows: [{ id: 'bal', label: 'Balance', amount: '$3.20' }, { id: 'short', label: 'Short by $6.80', amount: '$6.80', tone: 'warn' }],
          total: { label: 'Due', amount: '$10.00' },
          attach: { text: 'Add funds to start the server.', action: h(Button, { onPress: s.fn('addFunds') }, 'Add funds') },
        }),
        steps: [{ press: { role: 'button', name: 'Add funds' } }],
        expect: { calls: { addFunds: 1 }, nodes: [{ target: { text: 'Short by $6.80', exact: false } as never }, { target: { text: '$10.00' } }] },
      },
    ],
  }),
  scenarios('ShortcutTable', ShortcutTable, {
    ignored: { label: dlName },
    unsupported: {},
    cases: [
      {
        name: 'each key and what it does, in words (presentational)',
        props: { label: 'Keys', groups: [{ id: 'g', rows: [{ keys: ['Ctrl K'], label: 'Open the command menu' }] }] },
        steps: [],
        expect: { nodes: [{ target: { text: 'Open the command menu' } }] },
      },
    ],
  }),
];
