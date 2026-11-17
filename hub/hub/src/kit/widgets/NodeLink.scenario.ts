// Behaviour contract of NodeLink (web and terminal): a named group holding the selected entity (current) and each
// linked entity as a button named by the entity and what links them; one line says the centre's count of links, or the
// focused link as a sentence; a press on a linked entity asks the caller to select it, a press on the centre asks
// nothing; one keyboard stop, moved by the arrows, Home and End; links over the limit are counted in a line.
import { scenarios } from '../scenario-types';
import { loose } from '../layouts/scenarioRoute';
import { NodeLink, type NodeLinkEdge, type NodeLinkNode } from './NodeLink';

const nodes = (n: number): NodeLinkNode[] => Array.from({ length: n }, (_, i) => ({ id: `n${i}`, label: `entity ${i}` }));
const star = (n: number): NodeLinkEdge[] => Array.from({ length: n }, (_, i) => ({ id: `e${i}`, source: 'n0', target: `n${i + 1}`, relation: 'uses' }));
const base = { nodes: nodes(5), edges: star(4), selected: 'n0', label: 'Links' };

export default scenarios('NodeLink', loose(NodeLink), {
  ignored: {},
  unsupported: {},
  cases: [
    {
      name: 'a named group: the centre is current and says its count, each linked entity says what links it',
      props: (s) => ({ ...base, onSelect: s.fn('onSelect') }),
      steps: [],
      expect: {
        nodes: [
          { target: { role: 'group', name: 'Links' } },
          { target: { role: 'button', name: 'entity 0: 4 links' }, states: { current: true } },
          { target: { role: 'button', name: 'entity 1, entity 0 uses entity 1' } },
          { target: { role: 'button', name: 'entity 4, entity 0 uses entity 4' } },
          { target: { text: /more link/ }, absent: true },
        ],
      },
    },
    {
      name: 'a press on a linked entity asks for it; a press on the centre asks nothing',
      props: (s) => ({ ...base, onSelect: s.fn('onSelect') }),
      // By the keys a person has: a linked entity is no Tab stop until the arrows reach it.
      steps: [{ press: { role: 'button', name: 'entity 0: 4 links' } }, { key: 'right' }, { key: 'right' }, { key: 'enter' }],
      expect: { calls: { onSelect: [['n2']] } },
    },
    {
      name: 'the arrows, Home and End move the one stop; the line under the links says the focused link',
      props: (s) => ({ ...base, onSelect: s.fn('onSelect') }),
      steps: [{ focus: { role: 'button', name: 'entity 0: 4 links' } }, { key: 'right' }, { key: 'left' }, { key: 'home' }, { key: 'end' }],
      expect: {
        calls: { onSelect: 0 },
        focused: { role: 'button', name: 'entity 4, entity 0 uses entity 4' },
        nodes: [{ target: { text: /^entity 0 uses entity 4$/ } }],
      },
    },
    {
      name: 'both directions of a link read as sentences; a link to itself or to an entity not in the read is left out',
      props: (s) => ({
        ...base,
        edges: [{ id: 'a', source: 'n0', target: 'n1', relation: 'uses' }, { id: 'b', source: 'n1', target: 'n0', relation: 'is read by' }, { id: 'c', source: 'n0', target: 'n0', relation: 'loops' }, { id: 'd', source: 'n0', target: 'gone', relation: 'uses' }],
        onSelect: s.fn('onSelect'),
      }),
      steps: [],
      expect: { nodes: [{ target: { role: 'button', name: 'entity 1, entity 0 uses entity 1; entity 1 is read by entity 0' } }, { target: { role: 'button', name: 'entity 0: 2 links' } }] },
    },
    {
      name: 'links over the limit are counted in a line',
      props: (s) => ({ ...base, nodes: nodes(20), edges: star(19), onSelect: s.fn('onSelect') }),
      steps: [],
      expect: { nodes: [{ target: { text: /^\+\d+ more links in the table$/ } }, { target: { role: 'button', name: 'entity 0: 19 links' } }] },
    },
    {
      name: 'an entity not in the read draws nothing',
      props: (s) => ({ ...base, selected: 'gone', onSelect: s.fn('onSelect') }),
      steps: [],
      expect: { nodes: [{ target: { role: 'group', name: 'Links' }, absent: true }, { target: { role: 'button' }, absent: true }] },
    },
  ],
});
