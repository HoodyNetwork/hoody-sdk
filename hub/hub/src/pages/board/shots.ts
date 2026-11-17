// Named screenshot states of the Board (`bun run hub:shots --page board`). Boards live in this browser's storage,
// so every shot starts from a first visit; the Board states are built by acting (picker, keys), as a person would.
import type { Shots } from '@app/shots.types';

const pick = (computer: string, program: string, session?: string) => [
  { click: `role=option[name=/^${computer}/]` },
  { click: `role=option[name=/^${program}/]` },
  ...(session ? [{ click: `role=option[name=/^${session}/]` }] : []),
];

export default [
  { name: 'first-visit', waitForText: 'Put your computers side by side' },
  // The strip with several Boards and two tiles: the room above the strip, under it and around the tiles. Two Boards are
  // made from the Boards menu (the strip's on a wide screen, the bottom row's on a phone, which draws no strip), then
  // the tiles go on the last one.
  {
    name: 'strip-boards',
    act: [
      { click: 'css=button[aria-haspopup]:has-text("Boards"), button[aria-haspopup]:has-text("Main") >> nth=0' },
      { click: 'role=menuitem[name=/^New Board/]' },
      { click: 'css=button[aria-haspopup]:has-text("Boards"), button[aria-haspopup]:has-text("Board 2") >> nth=0' },
      { click: 'role=menuitem[name=/^New Board/]' },
      { click: 'Add a program' },
      ...pick('atlas', 'Terminal', 'terminal-1'),
      { waitFor: 'css=iframe[title="terminal-1 on atlas"]' },
      { click: 'Tile menu' },
      { click: 'Split right' },
      ...pick('atlas', 'Files'),
      { waitFor: 'css=iframe[title="files-1 on atlas"]' },
    ],
    extra: ['1350-light', '1350-dark', '390-dark'],
  },
  { name: 'picker', click: 'Add a program', act: [{ waitFor: 'role=option[name=/^atlas/]' }] },
  { name: 'picker-program', click: 'Add a program', act: [{ click: 'role=option[name=/^atlas/]' }, { waitFor: 'text=Terminal' }] },
  // Web address is on the chosen computer's step.
  { name: 'picker-web', click: 'Add a program', act: [{ click: 'role=option[name=/^atlas/]' }, { click: 'role=option[name=/^Web address/]' }, { waitFor: 'role=textbox[name="Address"]' }] },
  { name: 'picker-named', click: 'Add a program', act: [{ click: 'role=option[name=/^atlas/]' }, { click: 'role=option[name=/Terminal/]' }, { click: 'role=option[name="Open by number"]' }, { waitFor: 'role=textbox[name="Name (optional)"]' }] },
  { name: 'picker-read-error', state: 'failed', click: 'Add a program', act: [{ waitFor: 'text=The computers could not be read.' }] },
  { name: 'picker-no-computers', state: 'empty', click: 'Add a program', act: [{ waitFor: 'text=No computers in Personal' }] },
  // A computer's Apps, in its own step under its Hoody Kit: the launcher in place on a running computer, and a
  // stopped computer's Start.
  { name: 'picker-app-launcher', state: 'oneComputer', click: 'Add a program', act: [{ click: 'role=option[name=/^atlas/]' }, { waitFor: 'role=group[name="Apps"] >> role=radio[name="From GitHub"]' }], extra: ['768-dark'] },
  { name: 'picker-app-stopped', state: 'noneRunning', click: 'Add a program', act: [{ click: 'role=option[name=/^cedar/]' }, { waitFor: 'text=Start it to launch apps.' }], extra: ['768-dark'] },
  {
    name: 'grid-two',
    click: 'Add a program',
    act: [...pick('atlas', 'Terminal', 'terminal-1'), { waitFor: 'css=iframe[title="terminal-1 on atlas"]' }, { click: 'Tile menu' }, { click: 'Split right' }, ...pick('atlas', 'Files'), { waitFor: 'css=iframe[title="files-1 on atlas"]' }],
  },
  // The Layout menu: each preset row leads with a picture of its panes. A phone has no Layout menu (one tile at a time):
  // there the shot opens the Boards menu that takes the strip's place.
  {
    name: 'layout-menu',
    click: 'Add a program',
    act: [...pick('atlas', 'Terminal', 'terminal-1'), { waitFor: 'css=iframe[title="terminal-1 on atlas"]' }, { click: 'role=button[name=/^(Layout|Main)$/] >> nth=-1' }, { waitFor: 'role=menu' }],
    extra: ['1350-light', '1350-dark', '390-dark'],
  },
  { name: 'stopped-card', click: 'Add a program', act: [...pick('cedar', 'Terminal', 'terminal-1'), { waitFor: 'text=cedar is stopped' }] },
  { name: 'paused-card', click: 'Add a program', act: [...pick('fjord', 'Terminal', 'terminal-1'), { waitFor: 'text=fjord is paused' }] },
  { name: 'starting', click: 'Add a program', act: [...pick('cedar', 'Terminal', 'terminal-1'), { click: 'Start' }, { waitFor: 'text=Starting cedar…' }] },
  {
    name: 'start-unknown',
    state: 'powerUnknown',
    click: 'Add a program',
    act: [...pick('cedar', 'Terminal', 'terminal-1'), { click: 'Start' }, { waitFor: 'text=Start may have gone through' }],
  },
  { name: 'expired-card', state: 'needsLook', click: 'Add a program', act: [...pick('cedar', 'Terminal', 'terminal-1'), { waitFor: "text=cedar's subscription has ended" }] },
  // A note put on Board from Notes (its Add link), opened with the notebook sidebar hidden.
  { name: 'note-tile', path: '?add=notes-1&cid=c0a7150000000000000000a1&open=node&user=u0000000000000000000000a1&node=n0000000000000000000000b2', act: [{ waitFor: 'css=iframe[title^="notes-1 on atlas"]' }] },
  { name: 'note-tile-options', path: '?add=notes-1&cid=c0a7150000000000000000a1&open=node&user=u0000000000000000000000a1&node=n0000000000000000000000b2', act: [{ waitFor: 'css=iframe[title^="notes-1 on atlas"]' }, { click: 'role=button[name="Options for notes-1"]' }, { waitFor: 'role=switch[name="Show the notebook sidebar"]' }] },
  // The terminal's Background option is the kit colour picker.
  { name: 'terminal-colour', path: '?add=terminal-2&cid=c0a7150000000000000000a1', act: [{ waitFor: 'css=iframe[title^="terminal-2 on atlas"]' }, { click: 'role=button[name="Options for terminal-2"]' }, { click: 'role=button[name=/^Colours/]' }, { waitFor: 'role=radiogroup[name="Background"]' }], extra: ['768-dark'] },
  // A terminal's Options show its shell and Change.
  { name: 'terminal-shell', path: '?add=terminal-2&cid=c0a7150000000000000000a1', act: [{ waitFor: 'css=iframe[title^="terminal-2 on atlas"]' }, { click: 'role=button[name="Options for terminal-2"]' }, { waitFor: 'role=button[name="Change the shell of terminal-2"]' }], extra: ['768-dark'] },
  // Restart terminal's confirmation.
  { name: 'terminal-restart', path: '/open/atlas.00a1/terminal-1', act: [{ waitFor: 'css=iframe[title="terminal-1 on atlas"]' }, { click: 'role=button[name="Tile menu"]' }, { click: 'role=menuitem[name=/^Restart terminal/]' }, { waitFor: 'role=button[name="Restart"]' }], extra: ['768-dark'] },
  { name: 'program-view', path: '/open/atlas.00a1/terminal-2', act: [{ waitFor: 'css=iframe[title="terminal-2 on atlas"]' }] },
  // Open with: a keyed Add link lands on the program board "Nano · atlas", made for it.
  { name: 'program-board', path: '?add=terminal-8003&cid=c0a7150000000000000000a1&for=ow%3Anano&label=Nano', act: [{ waitFor: 'css=iframe[title^="terminal-8003 on atlas"]' }] },
  // New browser with options (basics, then one folded section open), and a browser tile's DevTools.
  // Connect over SSH's computer is the kit ComputerPicker (its list open).
  { name: 'ssh-form-computer', click: 'Add a program', act: [{ click: 'role=option[name=/^atlas/]' }, { click: 'role=option[name=/^Connect over SSH/]' }, { click: 'role=button[name=/ Connect from$/]' }, { waitFor: 'role=dialog[name=/^Connect from/]' }], extra: ['768-dark'] },
  { name: 'browser-form', click: 'Add a program', act: [...pick('atlas', 'Browser'), { click: 'role=option[name=/^New browser with options/]' }, { waitFor: 'role=button[name=/^Start browser-/]' }], extra: ['768-dark'] },
  { name: 'browser-form-network', click: 'Add a program', act: [...pick('atlas', 'Browser'), { click: 'role=option[name=/^New browser with options/]' }, { click: 'role=button[name=/^Network/]' }, { waitFor: 'role=textbox[name="Proxy address"]' }] },
  { name: 'browser-devtools', state: 'browserUp', path: '/open/atlas.00a1/browser-1', act: [{ waitFor: 'css=iframe[title="browser-1 on atlas"]' }, { click: 'role=button[name="Tile menu"]' }, { click: 'role=menuitem[name="DevTools…"]' }, { waitFor: 'role=button[name="Open DevTools"]' }], extra: ['768-dark'] },
  { name: 'menu-keep', act: [{ click: 'css=button[aria-haspopup]:has-text("Boards"), button[aria-haspopup]:has-text("Main") >> nth=0' }, { waitFor: 'role=menuitemcheckbox[name="Keep frames loaded on other pages"]' }] },
  // Boards ▾ open (every Board, New Board, the open Board's rows; a tray on a phone).
  { name: 'boards-menu', act: [{ click: 'css=button[aria-haspopup]:has-text("Boards"), button[aria-haspopup]:has-text("Main") >> nth=0' }, { waitFor: 'role=menuitem[name=/^New Board/]' }] },
  { name: 'program-view-no-match', path: '/open/nowhere.0000/terminal-1', waitForText: "This program link doesn't match a computer here." },
] satisfies Shots;
