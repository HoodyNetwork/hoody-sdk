// Behaviour contract of StaticTable (web and terminal): a small written table a person reads, named by
// its label; every cell's words show. Presentational: no actions.
import { scenarios } from '../scenario-types';
import { StaticTable } from './StaticTable';

export default [
  scenarios('StaticTable', StaticTable, {
    ignored: { mono: 'look only: a terminal draws every cell in its one fixed-width face already' },
    unsupported: {},
    cases: [
      {
        name: 'the table named by its label; row headers and cells as words (presentational)',
        props: {
          label: 'Where each agent keeps skills',
          mono: true,
          columns: [{ id: 'agent', label: 'Agent' }, { id: 'project', label: 'Project' }],
          rows: [{ id: 'codex', cells: ['codex', '.codex/skills'] }],
        },
        steps: [],
        expect: { nodes: [{ target: { role: 'table', name: 'Where each agent keeps skills' } }, { target: { text: /^codex$/ } }, { target: { text: /^\.codex\/\s?skills$/ } }] },
      },
    ],
  }),
];
