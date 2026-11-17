// Named screenshot states of the scripts page (`bun run hub:shots --page scripts`).
// Untyped: `act` steps are read by the runner (scripts/shots-lib ShotSpec); @app/shots.types does not carry them yet.

const sel = '?sel=atlas.00a1~weather.ts';
const orders = '?sel=atlas.00a1~orders%2F%5Bid%5D.ts';

// The New script flow: each draft is its own URL; states that need a live build stream are
// in the vitest suites (new.flow.build), since the fixture assistant answers at once.
const draft = '/new';
const describe = { fill: 'role=textbox[name="What it does"]', text: 'Count last week\'s sign-ups and send me the number' };
const cont = { click: 'role=button[name="Continue"]' };
const writeWay = [{ click: 'role=button[name=/Write the code myself/]' }, { fill: 'role=textbox[name="Address"]', text: '/notes' }, cont];
// The AI way on Where (the sign-in box sits there), and its press of Build it.
const toWhereAi = [describe, cont, { waitFor: 'role=button[name="Build it"]' }];
const pressBuild = [...toWhereAi, { click: 'role=button[name="Build it"]' }];
const toCheck = [...writeWay, { fill: 'role=textbox[name="Code"]', text: 'export default () => new Response("notes");' }, cont, { waitFor: 'text=No problems found in the code.' }];
const flowShots = [
  { name: 's01-flow-what-empty', path: draft, extra: ['390-dark'] },
  { name: 's02-flow-what-filled', path: draft, act: [describe] },
  // An example pressed (its words land in the box), and the page's questions under the step with one opened.
  { name: 's31-flow-what-example', path: draft, act: [{ click: 'Summarise a web page with AI' }] },
  { name: 's32-flow-what-faq', path: draft, act: [{ click: 'What can a script do?' }] },
  { name: 's03-flow-where-free', path: draft, act: [describe, cont, { waitFor: 'role=button[name="Build it"]' }] },
  { name: 's04-flow-where-taken', state: 'addressTaken', path: draft, act: [describe, cont, { waitFor: 'role=button[name="Build it"]' }] },
  { name: 's05-flow-idea-grid', path: draft, act: [{ click: 'role=button[name=/Start from an idea/]' }] },
  { name: 's06-flow-idea-fill', path: `${draft}?idea=http-healthcheck-notify`, act: [cont, { fill: 'role=textbox[name="Address"]', text: '/health' }, cont] },
  { name: 's08-flow-write', path: draft, act: writeWay },
  { name: 's09-flow-check-ready', path: draft, act: toCheck },
  { name: 's11-flow-live-confirm', path: draft, act: [...toCheck, cont, { waitFor: 'role=button[name="Make it live"]' }], extra: ['390-dark'] },
  { name: 's12-flow-done', path: draft, act: [...toCheck, cont, { click: 'role=button[name="Make it live"]' }, { waitFor: "text=It's live" }] },
  { name: 's13-flow-done-key', path: `${draft}?idea=kv-note`, act: [cont, { fill: 'role=textbox[name="Address"]', text: '/note' }, cont, cont, { click: 'role=button[name="Make it live"]' }, { waitFor: 'text=Save your key now' }] },
  { name: 's20-flow-built', path: draft, act: [describe, cont, { fill: 'role=textbox[name="Address"]', text: '/signups' }, { click: 'role=button[name="Build it"]' }, { waitFor: 'text=Your script is written.' }] },
  // The address was taken between Check and the send: "Not made", with Change the address as the way on.
  { name: 's25-flow-live-taken', state: 'failedOps', path: draft, act: [...toCheck, cont, { click: 'role=button[name="Make it live"]' }, { waitFor: 'text=Not made: the address was just taken' }] },
  // The wizard's design widths (a laptop at 1350, light and dark; a phone in dark): every step is judged at both.
].map((x) => ({ ...x, extra: ['1350-light', '1350-dark', '390-dark'] }));

export default [
  ...flowShots,
  { name: 'many' },
  { name: 'agent-hint', act: [{ click: 'role=button[name="Use with your agent"]' }] },
  { name: 'long', state: 'long' },
  { name: 'loading', state: 'loading' },
  { name: 'error', state: 'error' },
  { name: 'empty', state: 'empty' },
  { name: 'no-computers', state: 'noComputers' },
  { name: 'old-kit', state: 'oldKit' },
  { name: 'detail-overview', path: sel },
  { name: 'detail-failing', path: orders },
  { name: 'detail-code', path: `${sel}&tab=code`, extra: ['1350-light', '1350-dark', '390-dark'] },
  { name: 'detail-code-invalid', state: 'invalid', path: `${sel}&tab=code`, act: [{ click: 'role=textbox[name="Script code"]' }, { press: 'Control+End' }, { press: 'x' }, { press: 'Control+s' }] },
  { name: 'detail-code-preview', path: `${sel}&tab=code`, act: [{ click: 'role=button[name="Preview"] >> nth=0' }] },
  { name: 'detail-code-pending', state: 'pendingOps', path: `${sel}&tab=code`, act: [{ click: 'role=button[name="Preview"] >> nth=0' }, { click: 'role=button[name="Restore this version"]' }] },
  { name: 'detail-code-conflict', state: 'conflict', path: `${sel}&tab=code`, act: [{ click: 'role=button[name="Preview"] >> nth=0' }, { click: 'role=button[name="Restore this version"]' }] },
  { name: 'detail-test', path: `${orders}&tab=test` },
  { name: 'detail-test-fails', state: 'testFails', path: `${orders}&tab=test`, act: [{ click: 'Send' }] },
  { name: 'detail-test-answer', path: `${orders}&tab=test`, act: [{ click: 'Send' }, { waitFor: 'role=button[name="Show body"]' }] },
  { name: 'detail-test-body', path: `${orders}&tab=test`, act: [{ click: 'Send' }, { click: 'Show body' }, { waitFor: 'role=button[name="Hide body"]' }] },
  { name: 'detail-settings', path: `${orders}&tab=settings`, extra: ['1350-light', '1350-dark', '768-dark', '390-dark'] },
  { name: 'detail-settings-unknown-owner', state: 'ownershipUnknown', path: `${sel}&tab=settings`, noOutcome: 'ownership is a note about what the page cannot read; nothing was sent' },
  { name: 'detail-settings-failed', state: 'failedOps', path: `${sel}&tab=settings`, act: [{ click: 'css=label:has(input[aria-label="Turned on"])' }, { click: 'role=button[name="Check changes"]' }, { click: 'role=button[name="Save 1 changes"]' }] },
  { name: 'detail-settings-edited', path: `${orders}&tab=settings`, act: [{ click: 'css=label:has(input[aria-label="Turned on"])' }, { click: 'role=button[name="Check changes"]' }] },
  { name: 'detail-link-dialog', path: sel, act: [{ click: 'role=button[name="Make a link"]' }] },
  // Magic comments below the fold of the Settings tab: the Access group, the More settings groups, and the panel's foot.
  { name: 'magic-access', path: `${orders}&tab=settings`, act: [{ hover: 'role=button[name=/More settings/]' }], extra: ['1350-light', '1350-dark', '768-dark', '390-dark'] },
  { name: 'magic-more', path: `${orders}&tab=settings`, act: [{ click: 'role=button[name=/More settings/]' }, { hover: 'role=group[name="Calls from other websites"]' }], extra: ['1350-light', '1350-dark', '768-dark', '390-dark'] },
  { name: 'magic-ai', path: `${orders}&tab=settings`, act: [{ click: 'role=button[name=/More settings/]' }, { hover: 'text=AI key' }], extra: ['1350-light', '1350-dark', '768-dark', '390-dark'] },
  { name: 'magic-foot',path: `${orders}&tab=settings`, act: [{ click: 'role=button[name=/More settings/]' }, { hover: 'role=button[name="Check changes"]' }], extra: ['1350-light', '1350-dark', '768-dark', '390-dark'] },
  // The agent sign-in on Where, the AI way: the box, unticked, signed out again, the assistant not there,
  // then a press of Build it and each outcome of the sign-in.
  { name: 'flow-signin-box', state: 'aiLogin', path: draft, act: toWhereAi },
  { name: 'flow-signin-unticked', state: 'aiLogin', path: draft, act: [...toWhereAi, { click: 'text=Sign the agent in to my Hoody account' }] },
  { name: 'flow-signin-renew', state: 'aiLoginRenew', path: draft, act: toWhereAi },
  { name: 'flow-no-assistant', state: 'aiDown', path: draft },
  { name: 'flow-signin-busy', state: 'aiLoginBusy', path: draft, act: [...pressBuild, { waitFor: 'text=Signing the agent in to your account' }] },
  { name: 'flow-signin-unknown', state: 'aiLoginUnknown', path: draft, act: [...pressBuild, { waitFor: 'role=button[name="Check again"]' }] },
  { name: 'flow-signin-key', state: 'aiLoginKey', path: draft, act: [...pressBuild, { waitFor: 'role=button[name="Try again"]' }] },
  { name: 'flow-signin-computer', state: 'aiLoginComputer', path: draft, act: [...pressBuild, { waitFor: 'text=The agent has a sign-in set on the computer' }] },
  { name: 'flow-signin-notbox', state: 'aiLoginNotBox', path: draft, act: [...pressBuild, { waitFor: "text=couldn't confirm that atlas is yours" }] },
  { name: 'flow-signin-disabled', state: 'aiLoginDisabled', path: draft, act: [...pressBuild, { waitFor: 'text=This agent is set to refuse sign-in from the Hub' }] },
  { name: 'flow-signin-other', state: 'aiLoginOther', path: draft, act: [...pressBuild, { waitFor: 'text=signed in to a different Hoody account' }] },
  { name: 'flow-signin-admin', state: 'aiLoginAdmin', path: draft, act: [...pressBuild, { waitFor: "text=An administrator account can't sign agents in" }] },
  { name: 'flow-assistant-account', state: 'aiAccount', path: draft },
  { name: 'flow-assistant-identity', state: 'aiIdentity', path: draft },
  { name: 'flow-where-long-address', path: draft, act: [...writeWay.slice(0, 1), { fill: 'role=textbox[name="Address"]', text: '/orders/archive/2026/customers/with-a-very-long-name/invoices/and-receipts-for-the-year' }] },
  { name: 'row-menu', click: 'Row actions' },
  { name: 'deleted-drawer', click: 'Recently deleted' },
  // Exec folders (?exec=): Advanced closed is 'many'; open on folder 1, folder 3 closed and open (exclusive), a folder the page cannot open.
  { name: 'folder-advanced', act: [{ click: 'role=button[name="Advanced"]' }] },
  { name: 'folder-3', state: 'folder3', path: '?exec=3' },
  { name: 'folder-3-advanced', state: 'folder3', path: '?exec=3', act: [{ click: 'role=button[name="Advanced"]' }] },
  { name: 'folder-bad', path: '?exec=shop' },
  // Being built in this browser (and each of these at the phone width): three builds, one on
  // another computer; an empty list with a build; no computer ready with builds; the shared store full, its change requests open.
  { name: 'building-three', state: 'builds', act: [{ waitFor: 'text=Running a code check' }] },
  { name: 'building-empty-list', state: 'buildsEmpty' },
  { name: 'building-no-computer', state: 'buildsNoComputer' },
  { name: 'building-full', state: 'buildsFull', act: [{ click: 'role=button[name="Show the change requests"]' }] },
];
