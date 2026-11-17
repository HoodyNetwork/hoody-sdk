// Behaviour contract of the "Add a web widget" form at the top of Customize.
// Web: typing an address (and a name) and pressing Add widget hands both to onAdd; a full list or an unknown realm
// says so and the button is off.
// Terminal: no web page can be drawn inside a terminal card (UrlFrame.term.tsx), so the sibling draws no form and
// reads none of these props (AddWidget.term.tsx). The term case pins that nothing of the form is drawn.
import { scenarios } from '../../../kit/scenario-types';
import { AddWidget } from './AddWidget';
import strings from './strings.en.json';

const NOT_DRAWN = 'the terminal draws no add form: a terminal card cannot show a web page (AddWidget.term.tsx)';

export default scenarios('AddWidget', AddWidget, {
  ignored: { onAdd: NOT_DRAWN, full: NOT_DRAWN, realmKnown: NOT_DRAWN },
  unsupported: {},
  cases: [
    {
      name: 'an address and a name typed, Add widget hands both to onAdd',
      only: { platform: 'web', why: 'the terminal draws no add form (see the term case)' },
      covers: ['onAdd'],
      props: (s) => ({ onAdd: s.fn('onAdd', () => ({ ok: true })), full: false, realmKnown: true }),
      steps: [
        { type: [{ role: 'textbox', name: strings['add.url'] }, 'https://example.com'] },
        { type: [{ role: 'textbox', name: strings['add.name'] }, 'Docs'] },
        { press: { role: 'button', name: strings['add.submit'] } },
      ],
      expect: { calls: { onAdd: [['https://example.com', 'Docs']] } },
    },
    {
      name: 'a full list says so and the button is off',
      only: { platform: 'web', why: 'the terminal draws no add form (see the term case)' },
      covers: ['full'],
      steps: [],
      props: (s) => ({ onAdd: s.fn('onAdd', () => ({ ok: true })), full: true, realmKnown: true }),
      expect: { nodes: [{ target: { text: strings['add.full'] } }, { target: { role: 'button', name: strings['add.submit'] }, states: { disabled: true } }] },
    },
    {
      name: 'an unknown realm says so and the button is off',
      only: { platform: 'web', why: 'the terminal draws no add form (see the term case)' },
      covers: ['realmKnown'],
      steps: [],
      props: (s) => ({ onAdd: s.fn('onAdd', () => ({ ok: true })), full: false, realmKnown: false }),
      expect: { nodes: [{ target: { text: strings['add.noRealm'] } }, { target: { role: 'button', name: strings['add.submit'] }, states: { disabled: true } }] },
    },
    {
      name: 'the terminal draws nothing of the form',
      only: { platform: 'term', why: 'the web form is pinned by the cases above' },
      steps: [],
      props: (s) => ({ onAdd: s.fn('onAdd', () => ({ ok: true })), full: false, realmKnown: true }),
      expect: {
        calls: { onAdd: 0 },
        nodes: [
          { target: { role: 'textbox', name: strings['add.url'] }, absent: true },
          { target: { role: 'button', name: strings['add.submit'] }, absent: true },
          { target: { text: strings['add.title'] }, absent: true },
        ],
      },
    },
  ],
});
