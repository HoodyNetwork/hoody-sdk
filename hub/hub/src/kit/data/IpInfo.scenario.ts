// Behaviour contract of IpInfo (web and terminal): the address shows as text, Copy is named by what it copies, and the
// details control opens the place and network rows.
import { scenarios } from '../scenario-types';
import { IpInfo } from './IpInfo';

const details = { ip: '203.0.113.7', version: 4 as const, city: 'Paris', country: 'FR', network: { asn: 'AS64500', name: 'Example Net' }, hosting: true };

export default [
  scenarios('IpInfo', IpInfo, {
    ignored: {
      className: 'no CSS classes in a terminal',
      flags: 'a terminal always shows the two-letter code: an emoji flag is a wide colour cell',
    },
    unsupported: {},
    cases: [
      {
        name: 'the address is text, and Copy and Details are named by the address',
        props: { details },
        steps: [],
        expect: { neverShown: ['\u{1F1EB}'], nodes: [{ target: { role: 'button', name: 'Copy 203.0.113.7' } }, { target: { role: 'button', name: 'Details for 203.0.113.7' } }] },
      },
      {
        name: 'Details opens the network row and the marks',
        props: { details, note: 'Allow lists take IPv4 only' },
        steps: [{ click: { role: 'button', name: 'Details for 203.0.113.7' } }],
        expect: { nodes: [{ target: { text: /AS64500 Example Net/ } }, { target: { text: /Hosting or data center/ } }, { target: { text: /Allow lists take IPv4 only/ } }] },
      },
    ],
  }),
];
