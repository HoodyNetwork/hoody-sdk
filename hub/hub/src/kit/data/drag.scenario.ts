// Behaviour contract of DropArea (web and terminal): it is its children, whatever drop target it is given; nothing is
// dragged over it in these cases, so it draws nothing of its own (no ring, no hint).
import { scenarios } from '../scenario-types';
import { DropArea } from './drag';

export default scenarios('DropArea', DropArea, {
  ignored: { drop: 'a terminal has no pointer drag: nothing is ever dropped there, so the area is only its children' },
  unsupported: {},
  cases: [
    {
      name: 'its children are shown, with no hint of its own',
      props: { drop: undefined, children: 'The listing' },
      steps: [],
      expect: { nodes: [{ target: { text: 'The listing' } }] },
    },
  ],
});
