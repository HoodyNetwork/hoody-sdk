// Behaviour contract of the Billing announcement band. The web draws one sentence in a band; the terminal view of
// Billing draws none, so the terminal part reads neither prop; the one shared case is the switch
// turned off, where both draw nothing.
import { scenarios } from '../../../kit/scenario-types';
import { OpenNotice } from './OpenNotice';

export default [
  scenarios('OpenNotice', OpenNotice, {
    ignored: {
      t: 'the band is drawn in the web view only, so the terminal part has no sentence to translate',
      show: 'the band is drawn in the web view only, so there is nothing for the switch to hide in the terminal',
    },
    unsupported: {},
    cases: [
      {
        name: 'switched off, it draws nothing',
        props: { t: ((k: string) => k) as never, show: false },
        steps: [],
        expect: { nodes: [] },
      },
    ],
  }),
];
