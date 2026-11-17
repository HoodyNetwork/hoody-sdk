// Named screenshot states of the programs page (`bun run hub:shots --page programs`).
import type { Shots } from '@app/shots.types';

export default [
  { name: 'many', extra: ['1350-light', '1350-dark', '390-dark'] },
  // The header's Launch an app, pressed: the Apps tab with the launcher open.
  { name: 'launch-from-running', click: 'role=button[name="Launch an app"] >> nth=0', act: [{ waitFor: 'role=dialog >> role=row[name=/VS Code/]' }] },
  // The New program drawer, with the Keep it / Run once question open.
  { name: 'new-program', click: 'role=button[name="New program"]', act: [{ waitFor: 'text=How it runs' }, { click: 'role=button[name="Which one should I pick?"]' }, { waitFor: 'text=More about Keep it and Run once' }] },
  { name: 'running-detail', path: '?sel=prog%3A1' },
  { name: 'range-detail', path: '?sel=prog%3A2' },
  { name: 'stopped-detail', state: 'web-stopped', path: '?sel=prog%3A1' },
  { name: 'big-range-detail', state: 'big-range', path: '?sel=prog%3A41' },
  { name: 'attention', path: '?sel=prog%3A3'},
  { name: 'system', path: '?sel=prog%3A100' },
  { name: 'system-confirm', path: '?sel=prog%3A100', click: 'Restart hoody-agent' },
  { name: 'temporary', path: '?sel=temp%3Aquick_1760000000_1' },
  { name: 'filter-problems', path: '?state=problems' },
  { name: 'no-match', path: '?q=zzzz' },
  // One program running, one stopped.
  { name: 'small', state: 'small', extra: ['1350-light', '1350-dark', '390-dark'] },
  { name: 'empty', state: 'empty', extra: ['1350-light', '1350-dark', '390-dark'] },
  // The first read is out: the header, its buttons and the tab bar stay; the lines stand in the list only.
  { name: 'loading', state: 'loading', waitForText: 'Reading programs on', extra: ['1350-light', '1350-dark', '390-dark'] },
  { name: 'error', state: 'error', extra: ['1350-light', '1350-dark', '390-dark'] },
  { name: 'private', state: 'private' },
  { name: 'old-kit', state: 'old' },
  { name: 'op-pending', state: 'press-pending', path: '?sel=prog%3A1', click: 'Restart web', extra: ['1350-light', '1350-dark', '390-dark'] },
  // The same held change in the table (no detail open): its note has the Ports cell, with Check again.
  { name: 'op-pending-row', state: 'press-pending', click: 'role=row[name=/web/] >> role=button[name=/Restart/]', act: [{ waitFor: 'role=row[name=/web/] >> role=button[name=/Check again/]' }], noOutcome: 'the row shows the short Outcome line; the wait above proves it', extra: ['1350-light', '1350-dark', '390-dark'] },
  // New program whose send has no answer: the held band in the drawer, with what the last check said.
  { name: 'new-program-unknown', state: 'add-unknown', click: 'role=button[name="New program"]', act: [{ fill: 'Name', text: 'my-app' }, { fill: 'Command', text: 'node server.js' }, { click: 'Add program' }, { waitFor: "text=We can't tell yet whether my-app was added." }, { click: 'Check again' }, { waitFor: 'css=[data-held-note]' }], noOutcome: 'the drawer shows the kit held band, not an Outcome line', extra: ['1350-light', '1350-dark', '390-dark'] },
  { name: 'op-failed', state: 'press-failed', path: '?sel=prog%3A6', click: 'Start docs-preview' },
  { name: 'op-working', state: 'press-slow', path: '?sel=prog%3A1', click: 'Stop web' },
  // The Ports & aliases tab: open ports, aliases and their domain target, and its states.
  { name: 'ports', path: '?tab=ports', waitForText: 'shop-front', extra: ['1350-light', '1350-dark', '390-dark'] },
  // The aliases section's Why open; its link opens the own-domain question in the tab's Questions, under the tables.
  { name: 'ports-why', path: '?tab=ports', waitForText: 'shop-front', click: 'role=button[name="How do I use my own domain?"]', act: [{ click: 'More about your own domain' }, { waitFor: 'text=Where you manage your DNS' }], extra: ['390-dark'] },
  // The tab's Questions with one answer open: a list between two short paragraphs, and numbered steps.
  { name: 'ports-faq', path: '?tab=ports', waitForText: 'shop-front', click: 'role=button[name="Which open ports get a web address?"]', act: [{ click: 'role=button[name="How do I create an alias?"]' }, { waitFor: 'text=Choose Make alias.' }], extra: ['1350-light', '1350-dark', '390-dark'] },
  // Long alias names on a long server name: the whole address shows; the own-domain steps closed, then open.
  { name: 'ports-long', state: 'ports-long', path: '?tab=ports', waitForText: 'lively-harbor', extra: ['1350-light', '1350-dark', '390-dark'] },
  { name: 'ports-long-open', state: 'ports-long', path: '?tab=ports', waitForText: 'lively-harbor', click: 'role=button[name="How do I use my own domain?"]', act: [{ waitFor: 'text=More about your own domain' }], extra: ['1350-light', '1350-dark', '390-dark'] },
  // The system's avahi-daemon ports are counted with Hoody's own, not listed.
  { name: 'ports-avahi', state: 'ports-avahi', path: '?tab=ports', waitForText: '4 ports Hoody uses itself are not shown.' },
  { name: 'ports-loading', state: 'ports-loading', path: '?tab=ports', waitForText: 'Open ports', extra: ['1350-light', '1350-dark', '390-dark'] },
  { name: 'ports-error', state: 'ports-error', path: '?tab=ports', extra: ['1350-light', '1350-dark', '390-dark'] },
  { name: 'ports-empty', state: 'ports-empty', path: '?tab=ports', waitForText: 'Nothing is listening', extra: ['1350-light', '1350-dark', '390-dark'] },
  // The Apps tab: the default fixtures, then its own states (pages/apps/fixtures.ts).
  { name: 'apps-open', path: '?tab=apps', extra: ['1350-light', '1350-dark', '390-dark'] },
  { name: 'apps-loading', state: 'loading', path: '?tab=apps', waitForText: 'Apps on atlas', extra: ['1350-light', '1350-dark', '390-dark'] },
  { name: 'apps-empty', state: 'no-open', path: '?tab=apps', extra: ['1350-light', '1350-dark', '390-dark'] },
  { name: 'apps-error', state: 'open-error', path: '?tab=apps', extra: ['1350-light', '1350-dark', '390-dark'] },
  // A JupyterLab copy whose Open is not read back: the held row and its details.
  { name: 'apps-held', state: 'held', path: '?tab=apps&appsel=a1b2c3', extra: ['1350-light', '1350-dark', '390-dark'] },
  { name: 'apps-detail-board', state: 'board', path: '?tab=apps&appsel=b2c3d4' },
  { name: 'apps-detail-web', path: '?tab=apps&appsel=a1b2c3', extra: ['1350-light', '1350-dark', '390-dark'] },
  { name: 'apps-detail-terminal', path: '?tab=apps&appsel=b2c3d4' },
  { name: 'apps-detail-check-needed', path: '?tab=apps&appsel=a7b8c9' },
  { name: 'apps-detail-port', path: '?tab=apps&appsel=b8c9d0' },
  { name: 'apps-detail-error', path: '?tab=apps&appsel=f6a7b8' },
  { name: 'apps-note-opening', path: '?tab=apps&launch=1', act: [{ click: 'role=dialog >> role=row[name=/VS Code/] >> role=button[name="Open"]' }, { waitFor: 'text=Already opening >> visible=true' }] },
  { name: 'apps-filter-attention', path: '?tab=apps&appf=attention' },
  { name: 'apps-no-match', path: '?tab=apps&appq=zzzz' },
  { name: 'apps-launch-starters', path: '?tab=apps&launch=1' },
  { name: 'apps-launch-search', path: '?tab=apps&launch=1&launchq=jupyter', waitForText: 'jupyter-notebook' },
  { name: 'apps-launch-hidden', path: '?tab=apps&launch=1&launchq=jupyter', act: [{ click: 'role=button[name=/Show \\d+ hidden/]' }, { waitFor: 'text=jupytext-nvim' }] },
  { name: 'apps-options', path: '?tab=apps&launch=1', act: [{ click: 'role=dialog >> role=row[name=/JupyterLab/] >> role=button[name="Row actions"]' }, { click: 'role=menuitem[name=/^Options/]' }, { waitFor: 'text=Options for JupyterLab' }] },
] satisfies Shots;
