// StepPictures: the web reads each picture and draws it; a terminal draws no picture, so its twin names each one on a
// line and reads nothing. What both keep: a stored picture shows its name, a step's pictures their paths, and the host
// draws what it wraps.
import { scenarios } from '../scenario-types';
import { StepPictureHost, StepPictures, StoredPicture } from './StepPictures';

const TERM = { platform: 'term' as const, why: 'the web reads and draws the picture; a name alone on its line exists only in a terminal' };

const host = scenarios('StepPictureHost', StepPictureHost, {
  ignored: {
    value: 'the reader of picture bytes: a terminal draws no picture, so its twin reads nothing',
    session: 'names the chat whose reads are shared: a terminal reads no picture, so there is nothing to share',
  },
  unsupported: {},
  cases: [
    {
      name: 'the host draws what it wraps',
      props: { value: null, children: 'Pictures follow.' },
      steps: [],
      expect: { nodes: [{ target: { text: 'Pictures follow.' } }] },
    },
  ],
});

const stored = scenarios('StoredPicture', StoredPicture, {
  ignored: { id: "the picture's id in the agent's record: a terminal reads no picture, so its twin shows the name only" },
  unsupported: {},
  cases: [
    {
      name: 'a stored picture is its name on a line',
      only: TERM,
      props: { id: 'att-1', name: 'shot.png' },
      steps: [],
      expect: { nodes: [{ target: { text: /shot\.png/ } }] },
    },
  ],
});

const steps = scenarios('StepPictures', StepPictures, {
  ignored: {},
  unsupported: {},
  cases: [
    {
      name: "a step's pictures are named by their paths",
      only: TERM,
      props: { items: [{ path: '/tmp/a.png', name: 'a.png' }] },
      steps: [],
      expect: { nodes: [{ target: { role: 'list', name: 'Pictures this step made' } }, { target: { text: /\/tmp\/a\.png/ } }] },
    },
  ],
});

export default [host, stored, steps];
