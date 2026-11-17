// Behaviour contract of ProblemList (web and terminal): a code check's diagnostics as one named list;
// with onJump a row that has a line is a press that reports that line; a row without a line is no press; no problems
// draw nothing.
import { scenarios } from '../scenario-types';
import { ProblemList } from './ProblemList';

const problems = [
  { line: 12, message: 'Unexpected token' },
  { line: null, message: 'The file has no entry point', tone: 'warn' },
];

export default [
  scenarios('ProblemList', ProblemList, {
    ignored: {},
    unsupported: {},
    cases: [
      {
        name: 'a row with a line is one press that reports its line',
        props: (s) => ({ label: 'Problems', problems, onJump: s.fn('onJump') }),
        steps: [{ press: { role: 'button', name: /Unexpected token/ } }],
        expect: { calls: { onJump: [[12]] } },
      },
      {
        name: 'a row without a line is no press, its words still read',
        props: (s) => ({ label: 'Problems', problems, onJump: s.fn('onJump') }),
        steps: [],
        expect: { nodes: [{ target: { role: 'button', name: /no entry point/ }, absent: true }, { target: { text: /no entry point/ } }] },
      },
      {
        name: 'no problems draw nothing',
        props: { label: 'Problems', problems: [] },
        steps: [],
        expect: { nodes: [{ target: { role: 'list', name: 'Problems' }, absent: true }] },
      },
    ],
  }),
];
