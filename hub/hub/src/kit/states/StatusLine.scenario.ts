// Behaviour contract of StatusLine (web and terminal): a status that stays mounted and says its words.
import { loose } from '../layouts/scenarioRoute';
import { scenarios } from '../scenario-types';
import { StatusLine } from './StatusLine';

export default scenarios('StatusLine', loose(StatusLine), {
  ignored: {},
  unsupported: {},
  cases: [
    {
      name: 'the line is a status and says its words',
      props: { children: 'Starting the run…' },
      steps: [],
      expect: { nodes: [{ target: { role: 'status' } }, { target: { text: 'Starting the run…' } }] },
    },
    {
      name: 'with nothing to say the status stays in place',
      props: { children: null },
      steps: [],
      expect: { nodes: [{ target: { role: 'status' } }] },
    },
  ],
});
