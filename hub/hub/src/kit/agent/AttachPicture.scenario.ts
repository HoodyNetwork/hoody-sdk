// AttachPicture: the web draws the picture itself; a terminal draws no picture, so its twin shows the picture's name (or
// the picture glyph when it has none). The address and the broken-picture report have nothing to land on there.
import { scenarios } from '../scenario-types';
import { AttachPicture } from './AttachPicture';

const TERM = { platform: 'term' as const, why: 'the web draws the picture itself; the name in its place exists only in a terminal' };

export default scenarios('AttachPicture', AttachPicture, {
  ignored: {
    url: "the picture's address: a terminal draws no picture, so its twin shows the name instead",
    look: 'which size the web draws the picture at: a terminal draws no picture, so its twin shows the name instead',
    onBroken: 'the browser could not draw the picture: a terminal never draws one, so it never fails to',
  },
  unsupported: {},
  cases: [
    {
      name: 'a picture is not drawn: its name stands in its place',
      only: TERM,
      props: { url: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=', alt: 'screen.png', look: 'full' },
      steps: [],
      expect: { nodes: [{ target: { text: 'screen.png' } }] },
    },
  ],
});
