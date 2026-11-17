// Behaviour contract of ComputerMark (web and terminal): decoration only. The computer's name always sits beside it, so
// a reader meets nothing for the mark itself.
import { scenarios } from '../scenario-types';
import { ComputerMark } from './ComputerMark';

export default [
  scenarios('ComputerMark', ComputerMark, {
    ignored: {
      className: 'no CSS classes in a terminal',
      size: 'pixel sizes (10/12 px); a terminal mark is always one cell',
    },
    unsupported: {},
    cases: [
      {
        name: 'a coloured mark is hidden from readers',
        props: { color: '#e07a5f' },
        steps: [],
        expect: { nodes: [{ target: { role: 'img' }, absent: true }] },
      },
      {
        name: 'no valid colour draws nothing',
        props: { color: 'not-a-colour' },
        steps: [],
        expect: { nodes: [{ target: { role: 'img' }, absent: true }] },
      },
    ],
  }),
];
