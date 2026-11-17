// Behaviour contract of SshKeyHelp and SshKeyFinish, run on the web and in the terminal (src/term/scenario).
// Shared: the fold (closed by default, opened by its header), the system choice and the commands it
// shows. Not shared on purpose: "Make one here" (the web makes a key in the browser and downloads it to the person's
// machine; the terminal hands that off, since a key made there would be written where the Hub runs).
import { scenarios } from '../scenario-types';
import { SshKeyFinish, SshKeyHelp } from './SshKeyHelp';

const fold = { role: 'button', name: 'How do I get a key?' };
const radio = (name: string) => ({ role: 'radio', name });
const MAKE_HERE = 'the terminal never makes a key (it would be written where the Hub runs, not on the machine the person connects from): Make one here is a hand-off to the web Hub';

export default [
  scenarios('SshKeyHelp', SshKeyHelp, {
    ignored: { onKey: MAKE_HERE, useSets: MAKE_HERE, sentKeys: MAKE_HERE },
    unsupported: {
      // The commands themselves (they name the computer's file and the host) are held by SshKeyHelp.term.test.tsx.
      host: 'names the key file and the connect line inside the commands: held by SshKeyHelp.term.test.tsx',
      computer: 'names the key file and the connect line inside the commands: held by SshKeyHelp.term.test.tsx',
    },
    cases: [
      {
        name: 'closed by default: one fold header, no commands',
        props: { computer: 'web1', os: 'linux' },
        steps: [],
        expect: { nodes: [{ target: fold, states: { expanded: false } }, { target: radio('Linux'), absent: true }] },
      },
      {
        name: 'defaultExpanded opens it on the given system',
        props: { computer: 'web1', os: 'windows', defaultExpanded: true },
        steps: [],
        expect: { nodes: [{ target: fold, states: { expanded: true } }, { target: radio('Windows'), states: { checked: true } }, { target: { text: 'Or use a terminal' } }] },
      },
    ],
  }),
  scenarios('SshKeyFinish', SshKeyFinish, {
    ignored: {},
    unsupported: {},
    cases: [
      {
        name: 'the given system is chosen; its move step names the file',
        props: { file: 'hoody-web1-ab12', host: 'web1.example.test', os: 'mac' },
        steps: [],
        expect: { nodes: [{ target: radio('macOS'), states: { checked: true } }, { target: { text: 'web1.example.test' } }] },
      },
      {
        name: 'choosing Windows shows the PowerShell move',
        props: { file: 'hoody-web1-ab12', os: 'linux' },
        steps: [{ click: radio('Windows') }],
        expect: { nodes: [{ target: radio('Windows'), states: { checked: true } }, { target: { text: 'Move-Item' } }] },
      },
    ],
  }),
];
