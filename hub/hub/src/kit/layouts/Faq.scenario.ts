// Faq: a named "Questions" region whose questions fold open (the web's <details>). Web and terminal.
import { createElement as h } from 'react';
import { scenarios } from '../scenario-types';
import { atRoute, loose } from './scenarioRoute';
import { Faq } from './Faq';

const faq = { items: [{ id: 'what', q: 'What goes in the vault?', a: 'Tokens and passwords.' }, { id: 'copy', q: 'How do I copy a value?', a: 'Open it, then Copy.' }] };

export default scenarios('Faq', loose(Faq), {
  ignored: {},
  unsupported: {},
  cases: [
    {
      name: 'a question opens to its answer and closes again; the other stays shut',
      props: () => ({ faq }),
      mount: (C, p) => atRoute(() => h(C, p as never)),
      covers: ['faq'],
      steps: [
        { press: { role: 'button', name: 'What goes in the vault?' } },
        {
          expect: { nodes: [
            { target: { role: 'button', name: 'What goes in the vault?' }, states: { expanded: true } },
            { target: { text: 'Tokens and passwords.' } },
            { target: { role: 'button', name: 'How do I copy a value?' }, states: { expanded: false } },
          ] },
        },
        { press: { role: 'button', name: 'What goes in the vault?' } },
      ],
      // A closed <details> keeps its answer in the DOM (hidden): the fold is checked by state.
      expect: { nodes: [{ target: { role: 'button', name: 'What goes in the vault?' }, states: { expanded: false } }] },
    },
    {
      name: 'the section is headed "Questions" at the given level',
      props: () => ({ faq, titleLevel: 3 }),
      mount: (C, p) => atRoute(() => h(C, p as never)),
      covers: ['titleLevel'],
      steps: [],
      expect: { nodes: [{ target: { role: 'heading', name: 'Questions' }, states: {} }] },
    },
  ],
});
