// Named screenshot states of the Tunnels page (`bun run hub:shots --page tunnels`). A read that failed is *error*.
import type { Shots } from '@app/shots.types';

const S1 = 'S-4f2a9c1e-7b3d-4e21-9a55-0c1d2e3f4a51';
const S2 = 'S-9b1d7e20-41c6-4f8a-b2d3-5e6f7a8b9c02';
const OLD = 'S-77aa31c5-2d4e-4b6f-8a9b-1c2d3e4f5a09';
const sel = (id: string) => `?sel=${encodeURIComponent(id)}`;
// The first session's Disconnect: in the ⋯ menu of one of its rows (its inside :5432), or the inspector's (the last
// button on the page).
const S1_MENU = 'css=tr:has-text("127.0.0.1:5432") >> role=button[name="Row actions"]';
const MENU_DISCONNECT = 'menu';
const DETAIL_DISCONNECT = 'role=button[name="Disconnect"] >> nth=-1';
const openDisconnect = (via: string) =>
  via === MENU_DISCONNECT
    ? [{ waitFor: 'text=127.0.0.1:5432' }, { click: S1_MENU }, { click: 'role=menuitem[name=/^Disconnect session/]' }]
    : [{ waitFor: 'text=Not loading?' }, { click: via }];
const disconnect = (via: string) => [
  ...openDisconnect(via),
  { waitFor: 'text=The laptop can connect again' },
  { click: 'role=alertdialog >> role=button[name="Disconnect"]' },
];

export default [
  { name: 'two' },
  // The inspector beside the list: a web address, a PULL listener on 127.0.0.1:6379, a listener waiting for its session.
  { name: 'web-detail', path: sel(`${S1}~1`), waitForText: 'Not loading?' },
  { name: 'web-detail-shown', path: sel(`${S1}~1`), click: 'role=button[name=/^Show the connection address/]', act: [{ waitFor: 'text=203.0.113.42' }] },
  { name: 'web-detail-why', path: sel(`${S1}~1`), act: [{ waitFor: 'text=Not loading?' }, { click: 'role=button[name="Not loading?"]' }, { waitFor: 'text=Each cause, explained' }] },
  { name: 'pull-detail', path: sel(`${S2}~2`), waitForText: 'it gets no public address' },
  { name: 'reconnecting-detail', path: sel(`r~${OLD}~4`), waitForText: 'waiting for its session' },
  { name: 'filter-pull', path: '?kind=pull' },
  { name: 'no-match', path: '?q=zzzz' },
  { name: 'many', state: 'many' },
  { name: 'idle', state: 'idle' },
  { name: 'nothing-shared', state: 'nothing-shared' },
  { name: 'orphans', state: 'orphans' },
  { name: 'stopped', state: 'program-stopped' },
  { name: 'not-installed', state: 'not-installed' },
  { name: 'loading', state: 'loading' },
  { name: 'kit-loading', state: 'kit-loading' },
  { name: 'error', state: 'error' },
  { name: 'stale', state: 'stale', click: 'Refresh', act: [{ waitFor: 'text=Showing what was read at' }] },
  // The inspector after a failed refresh: its own "as of" line (on a phone the list is hidden).
  { name: 'stale-detail', state: 'stale', click: 'Refresh', act: [{ waitFor: 'text=Showing what was read at' }, { click: 'text=127.0.0.1:6379' }, { waitFor: 'text=it gets no public address' }] },
  { name: 'partial', state: 'partial', click: 'Refresh', act: [{ waitFor: 'text=Showing what was read at' }] },
  { name: 'cannot-tell', state: 'program-unknown' },
  { name: 'daemon-forbidden', state: 'daemon-forbidden' },
  { name: 'forbidden', state: 'forbidden' },
  { name: 'daemon-error', state: 'daemon-error' },
  { name: 'token', state: 'token', path: sel(`${S1}~1`), waitForText: 'Not loading?' },
  { name: 'no-computer', computer: false },
  // The Setup drawer: the default command, a database port's warning, a pull with a fixed port, a password-protected computer.
  // Waits on the drawer's first heading: the whole body draws in one pass, and "Run it on the laptop" sits below a 40-row fold.
  { name: 'setup', path: '?setup=new', waitForText: 'What to connect' },
  { name: 'setup-command', path: '?setup=new', act: [{ waitFor: 'text=Open the tunnel' }, { hover: 'text=If it fails' }] },
  { name: 'setup-risky', path: '?setup=new', act: [{ fill: 'role=textbox[name="Port"s]', text: '5432' }, { waitFor: 'text=often belongs to a database' }, { hover: 'text=often belongs to a database' }] },
  { name: 'setup-pull', path: '?setup=new', act: [{ click: 'text=Bring a laptop service into this computer' }, { click: 'role=button[name=/^Advanced/]' }, { fill: 'role=textbox[name="Port on atlas"s]', text: '5432' }, { waitFor: 'text=tunnel pull' }, { hover: 'text=tunnel pull' }] },
  { name: 'setup-login', path: '?setup=new', act: [{ click: 'role=button[name=/^Advanced/]' }, { click: 'text=atlas protects its programs with a password' }, { fill: 'role=textbox[name="User name"s]', text: 'ops' }, { waitFor: 'text=--kit-user' }, { hover: 'text=--kit-user' }] },
  { name: 'setup-sdk', path: '?setup=new', act: [{ click: 'role=radio[name="SDK"s]' }, { waitFor: 'text=box.tunnel.expose' }, { hover: 'text=box.tunnel.expose' }] },
  // The first step's Why open, and a field to fix (the run step waits and says so).
  { name: 'setup-why', path: '?setup=new', act: [{ waitFor: 'text=Run it on the laptop' }, { click: 'role=button[name="Which one should I pick?"]' }, { waitFor: 'text=Both ways, compared' }] },
  { name: 'setup-fix', path: '?setup=new', act: [{ fill: 'role=textbox[name="Port"s]', text: '0' }, { waitFor: 'text=Fix the fields above to see the command.' }] },
  // Rows that came after the drawer opened carry New.
  { name: 'new-rows', state: 'appears', path: '?setup=new', act: [{ waitFor: 'text=Run it on the laptop' }, { press: 'Escape' }, { click: 'Refresh' }, { waitFor: 'text=127.0.0.2:5432' }] },
  // Disconnect: the confirm, Disconnecting (the kit has not closed it yet), a lost answer, a refusal; the
  // inspector's own lines for the last three (on a phone the list is hidden).
  { name: 'disconnect-confirm', state: 'disconnect', act: [...openDisconnect(MENU_DISCONNECT), { waitFor: 'text=The laptop can connect again' }] },
  // The session's rows' menu: Disconnect session, with Open and Copy.
  { name: 'session-menu', state: 'disconnect', act: [{ waitFor: 'text=127.0.0.1:5432' }, { click: S1_MENU }, { waitFor: 'role=menuitem[name=/^Disconnect session/]' }] },
  { name: 'disconnecting', state: 'disconnect-slow', act: [...disconnect(MENU_DISCONNECT), { waitFor: 'text=Disconnecting…' }] },
  { name: 'may-have-disconnected', state: 'disconnect-lost-listed', act: [...disconnect(MENU_DISCONNECT), { waitFor: 'text=May have disconnected' }] },
  { name: 'disconnecting-detail', state: 'disconnect-slow', path: sel(`${S1}~1`), act: [...disconnect(DETAIL_DISCONNECT), { waitFor: 'text=is closing this session' }] },
  { name: 'may-have-disconnected-detail', state: 'disconnect-lost-listed', path: sel(`${S1}~1`), act: [...disconnect(DETAIL_DISCONNECT), { waitFor: 'text=The answer did not come back' }] },
  { name: 'disconnect-refused', state: 'disconnect-refused', act: [...disconnect(MENU_DISCONNECT), { waitFor: 'text=Could not disconnect session' }] },
  // A lost answer: the menu offers Check again; a search that hides the session still names it above the list.
  { name: 'may-have-disconnected-menu', state: 'disconnect-lost-listed', act: [...disconnect(MENU_DISCONNECT), { waitFor: 'text=May have disconnected' }, { click: S1_MENU }, { waitFor: 'role=menuitem[name=/^Check again/]' }] },
  { name: 'held-searched-out', state: 'disconnect-lost-listed', act: [...disconnect(MENU_DISCONNECT), { waitFor: 'text=May have disconnected' }, { fill: 'role=searchbox >> nth=0', text: '127.0.0.2' }, { waitFor: 'text=may have gone through' }] },
  { name: 'disconnect-refused-detail', state: 'disconnect-refused', path: sel(`${S1}~1`), act: [...disconnect(DETAIL_DISCONNECT), { waitFor: 'text=Could not disconnect this session' }] },
] satisfies Shots;
