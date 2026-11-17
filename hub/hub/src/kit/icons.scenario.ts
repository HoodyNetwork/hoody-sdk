// Behaviour contract of Icon (web and terminal): a labelled icon is an image with that name.
import { loose } from './layouts/scenarioRoute';
import { scenarios } from './scenario-types';
import { Icon } from './icons';

const icon = scenarios('Icon', loose(Icon), {
  ignored: { size: 'a terminal glyph is one cell at every size' },
  unsupported: {},
  cases: [
    { name: 'a labelled icon is an image named by its label', props: { name: 'lock', label: 'Locked' }, steps: [],
      expect: { nodes: [{ target: { role: 'img', name: 'Locked' } }] } },
    { name: 'without a label it is decoration: no image in the tree', props: { name: 'sparkle' }, steps: [],
      expect: { nodes: [{ target: { role: 'img' }, absent: true }] } },
  ],
});

export default [icon];
