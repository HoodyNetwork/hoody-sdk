// Behaviour contract of CutFrame (web and terminal).
import { createElement as h } from 'react';
import { loose } from './scenarioRoute';
import { scenarios } from '../scenario-types';
import { CutFrame } from './CutFrame';

const HTML = 'an HTML attribute or element event of the frame element: no meaning in a terminal';

export default [scenarios('CutFrame', loose(CutFrame), {
  ignored: {
    '*': HTML,
    cut: 'the corner size in px: a cell grid draws a square border, no slanted corner',
    className: 'classes of the web frame: the terminal frame is a prim box (border in the panel line)',
    innerClassName: 'classes of the web inner box: the terminal frame is a prim box with one cell of padding',
    style: HTML,
  },
  unsupported: {},
  cases: [
    {
      name: 'it draws its content, named as a group by aria-label',
      props: { role: 'group', 'aria-label': 'Plus plan' },
      mount: (C, p) => h(C, p as never, 'Plus 5 computers'),
      covers: ['children', 'aria-label', 'role'],
      steps: [],
      expect: { nodes: [{ target: { role: 'group', name: 'Plus plan' } }] },
    },
    {
      name: 'an article frame is an article',
      props: { as: 'article', 'aria-label': 'atlas' },
      mount: (C, p) => h(C, p as never, 'atlas'),
      covers: ['as'],
      steps: [],
      expect: { nodes: [{ target: { role: 'article', name: 'atlas' } }] },
    },
  ],
})];
