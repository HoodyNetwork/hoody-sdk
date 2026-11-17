// Behaviour contract of Why, run on the web and in the terminal: a closed question that opens to its
// answer and always ends with the page FAQ's link.
import { createElement as h } from 'react';
import { scenarios } from '../scenario-types';
import { atRoute, loose } from './scenarioRoute';
import { Why } from './Why';

const question = { role: 'button', name: 'Which one should I pick?' };
const base = { question: 'Which one should I pick?', children: 'Pick the first one for a quick start.', faq: { item: { id: 'pick', q: 'Which one should I pick?', a: 'The first one suits most people.' }, label: 'More about picking' } };

export default scenarios('Why', loose(Why), {
  ignored: { className: 'no CSS classes in a terminal' },
  unsupported: {},
  cases: [
    {
      name: 'closed by default: the question is a closed fold',
      props: () => base,
      mount: (C, p) => atRoute(() => h(C, p as never)),
      covers: ['question'],
      steps: [],
      expect: { nodes: [{ target: question, states: { expanded: false } }, { target: { role: 'link', name: 'More about picking' }, absent: true }] },
    },
    {
      name: 'open: the answer, then the link to the page question',
      props: () => ({ ...base, level: 3 }),
      mount: (C, p) => atRoute(() => h(C, p as never)),
      covers: ['children', 'faq', 'level'],
      steps: [{ press: question }],
      expect: { nodes: [{ target: question, states: { expanded: true } }, { target: { text: 'Pick the first one for a quick start.' } }, { target: { role: 'link', name: 'More about picking' } }] },
    },
  ],
});
