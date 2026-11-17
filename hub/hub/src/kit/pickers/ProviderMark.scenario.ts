// Behaviour contract of ProviderMark (web and terminal): decoration only. The provider's name always sits beside it,
// so a reader meets nothing for the mark itself.
import { scenarios } from '../scenario-types';
import { ProviderMark } from './ProviderMark';

export default [
  scenarios('ProviderMark', ProviderMark, {
    ignored: { size: 'pixel sizes (sm/md); a terminal mark is always one letter' },
    unsupported: {},
    cases: [
      {
        name: 'a provider\'s mark is hidden from readers',
        props: { id: 'openai', name: 'OpenAI' },
        steps: [],
        expect: { nodes: [{ target: { role: 'img' }, absent: true }] },
      },
      {
        name: 'Hoody AI\'s mark is hidden from readers too',
        props: { id: 'hoody-ai', name: 'Hoody AI' },
        steps: [],
        expect: { nodes: [{ target: { role: 'img' }, absent: true }] },
      },
    ],
  }),
];
