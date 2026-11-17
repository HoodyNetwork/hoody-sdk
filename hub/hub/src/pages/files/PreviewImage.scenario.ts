// PreviewImage: the web draws the computer's thumbnail of a picture as an image; a terminal draws no picture, so its
// twin says so in words, and the preview's other ways (Download in the drawer's foot, the viewer in the rows below)
// stay Preview's own. The picture's address and its accessible name have nothing to land on here.
import { scenarios } from '../../kit/scenario-types';
import { PreviewImage } from './PreviewImage';

const TERM = { platform: 'term' as const, why: 'the web draws the picture itself; the words exist only in a terminal' };

export default scenarios('PreviewImage', PreviewImage, {
  ignored: {
    url: "the picture's address: a terminal draws no picture, so its twin says so in words instead",
    alt: "the picture's accessible name: a terminal draws no picture, and its twin's words say what is missing",
  },
  unsupported: {},
  cases: [
    {
      name: 'a picture is not drawn: the preview says so in words',
      only: TERM,
      props: { url: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=', alt: 'Preview of photo-001.jpg' },
      steps: [],
      expect: { nodes: [{ target: { text: "Pictures can't be shown in a terminal." } }] },
    },
  ],
});
