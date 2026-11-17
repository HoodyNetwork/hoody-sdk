// The demo opens what a person opens first (boot.demo.ts, scripts/term/build/demo-client.ts, demo-answers.ts): the
// first row of Bots, Support and Programs, and the first folder of Files, drawn whole. Before the fix the demo
// answered only the reads of each page's default state: the opened Bot drew "Couldn't read this Bot", the ticket
// "This ticket isn't yours or no longer exists", the folder `bin` "This folder isn't there any more" and the
// program's sandbox "Could not read this program's sandbox"; the Keys SSH tab said "This computer is no longer
// available.", and a script's Code and Settings tabs, the Logs Programs source and the Notices tab "This didn't load";
// the chat waiting on a decision said "The agent on atlas can't take requests from the Hub yet." (no capability listed).
// Computers in the realm the demo opens on listed the computers of every realm (the realm's host was not asked).
// Every other listed chat said "This chat is gone or not reachable." (only the waiting one was answered).
// Logs opened on "Nothing happened in the last hour" (the logs program's record was empty), a script's runs in Logs on
// "Per-script logs need the next Scripts update", and a script's Overview on "Nobody has called it" while the list
// counted its calls.
// Tunnels said "No tunnel program" (the programs overview the demo answered named none).
// Opening an unread notification marked it read, a change the demo refuses: "Couldn’t mark “…” as read." (the sample
// notices are all read now).
// Account showed the address "Not verified", no display name and no joining date (the recorded profile held none).
// Every server for rent said "Not for sale" (its durations were not in the tier shape the page quotes from).
// Renting a server and Add funds drew the web Hub's payment steps, whose Confirm and Continue the demo refuses: a rent's
// Confirm drew "Purchase not completed". The live terminal draws no payment step: it hands payments to the web Hub.
// Each test mounts the demo once, with no reads kept from an earlier mount and after that mount has ended: a second
// mount in the same test drew "The scripts could not be read". It ends each mount by its signal, as a host does.
//
// | # | Behaviour | Test |
// |---|---|---|
// | 1 | Bots: the first Bot opens with its log | 'Bots: the first Bot opens' |
// | 2 | Support: the first ticket opens with its thread | 'Support: the first ticket opens' |
// | 3 | Files: the first folder opens with its files | 'Files: the first folder opens' |
// | 4 | Programs: the first program's sandbox reads | 'Programs: the first program\'s sandbox reads' |
// | 5 | Keys: the SSH tab shows the current computer's host | 'Keys: the SSH tab opens' |
// | 6 | Scripts: a script's Code and Settings tabs read | 'Scripts: the first script\'s Code tab opens', '… Settings tab opens' |
// | 7 | Logs: the Programs source shows the computer's programs' output | 'Logs: the Programs source opens' |
// | 8 | Notifications: the Notices tab reads (no notices) | 'Notifications: the Notices tab opens' |
// | 9 | AI: the chat waiting on a decision opens with its transcript | 'AI: the chat waiting on a decision opens' |
// | 10 | Computers: the realm the demo opens on lists its own computers only | 'Computers: one realm lists its own computers' |
// | 11 | AI: a listed chat that is not waiting opens with its transcript | 'AI: another listed chat opens' |
// | 12 | Logs: the default view (Everything, last hour) shows the computer's visits | 'Logs: the default view shows the last hour\'s visits' |
// | 13 | Logs: a script's runs (the hand-off from Scripts) list its calls | 'Logs: a script\'s runs open' |
// | 14 | Scripts: a script's Overview shows its last 24 hours | 'Scripts: the first script\'s Overview shows its calls' |
// | 15 | Tunnels: the connected laptop's two shares | 'Tunnels: the connected laptop shows' |
// | 16 | Notifications: the inbox is caught up, and the newest notice opens from the archive | 'Notifications: the inbox is caught up', 'Notifications: the newest notice opens' |
// | 17 | Account: the profile shows a verified address and a display name | 'Account: the profile shows a verified address and a display name' |
// | 18 | Billing: the servers for rent list their prices | 'Billing: the servers for rent show their prices' |
// | 19 | Billing: renting a server shows its price and hands the payment to the web Hub (no Confirm), as the live terminal | NOT HERE: this process builds the Hub with fixtures on, so the drawer reads the fixture-only listing; the built bundle draws it: scripts/term/build/ship-gate.ts DEMO_CHECKS 'billing-rent' (its data: demo-world 'the rent drawer\'s listing') |
// | 20 | Billing: Add funds hands the payment to the web Hub (no Continue), as the live terminal | 'Billing: Add funds hands the payment to the web Hub' |
import { afterEach, expect, setDefaultTimeout, test } from 'bun:test';
import { queryClient } from '@core';
import { DEMO_BOTS } from '../../../scripts/term/build/demo-answers';
import { DEMO_CONTEXT, demoClient } from '../../../scripts/term/build/demo-client';
import { currentTermSession } from '../env/session';
import { mountDemoHub } from '../entry.demo';
import type { HoodyClient } from '../host-types';
import { UNSTYLED_FOR_TESTS } from './styles';

setDefaultTimeout(300_000);
afterEach(() => { currentTermSession()?.end(); });

/** The screen as it stands after every write (the renderer sends only the cells that changed): cursor moves place the
 *  text, a full clear empties the grid, other control sequences draw nothing. */
const screen = (s: string): string => {
  const rows: string[][] = [];
  let r = 0;
  let c = 0;
  const re = /\x1b\[([0-9;?]*)([A-Za-z])|\x1b[^[]|([^\x1b])/gu;
  for (const m of s.matchAll(re)) {
    if (m[3] !== undefined) {
      if (m[3] === '\n') { r++; c = 0; continue; }
      if (m[3] === '\r') { c = 0; continue; }
      (rows[r] ??= [])[c++] = m[3];
    } else if (m[2] === 'H' || m[2] === 'f') {
      const [row, col] = (m[1] ?? '').split(';');
      r = Math.max(0, Number(row || 1) - 1);
      c = Math.max(0, Number(col || 1) - 1);
    } else if (m[2] === 'J' && m[1] === '2') rows.length = 0;
  }
  return Array.from(rows, (row) => Array.from(row ?? [], (ch) => ch ?? ' ').join('')).join('\n');
};
const until = async (ok: () => boolean, ms: number): Promise<boolean> => {
  for (const end = Date.now() + ms; Date.now() < end;) { if (ok()) return true; await new Promise((r) => setTimeout(r, 100)); }
  return ok();
};

/** Mounts the demo on `page` at `path` and gives the screen once `shown` or `failed` text is on it (or the wait ends). */
async function drawn(page: string, path: string, shown: string, failed: string): Promise<string> {
  // The reads are kept per process (core's query client): each mount starts with none of an earlier mount's.
  await queryClient.cancelQueries();
  queryClient.clear();
  let all = '';
  const ac = new AbortController();
  const done = mountDemoHub({
    styles: UNSTYLED_FOR_TESTS, client: demoClient() as unknown as HoodyClient, route: { page, path }, onSetDefault: async () => {}, context: { ...DEMO_CONTEXT },
    io: { cells: { write: (s: string) => { all += s; } }, input: { onData: () => () => {} }, size: () => ({ cols: 140, rows: 50 }), colourTier: 'mono' },
    signal: ac.signal,
  } as never);
  done.catch(() => {});
  let s = '';
  try {
    await until(() => all.includes('HOODY'), 60_000);
    await until(() => { const now = screen(all); return now.includes(shown) || now.includes(failed); }, 45_000);
    // A read that fails after the first draw still has time to show it.
    await new Promise((r) => setTimeout(r, 1500));
    s = screen(all);
  } finally {
    // Ended as a host ends it: the mount gives the terminal back, cancels the reads still out, forgets them all and ends
    // its session (app/lifecycle.ts dispose). Ending only the session leaves it drawing its signed-out screen.
    ac.abort();
  }
  // The next mount starts only once this one has ended.
  const ended = await Promise.race([done.then(() => true, () => true), new Promise<boolean>((r) => setTimeout(() => r(false), 30_000))]);
  // A mount still ending would share core's module-wide state with the next one: say so here, not as a later test's red.
  expect(ended, `the ${page} mount ended within 30 s`).toBe(true);
  return s;
}

test('Bots: the first Bot opens', async () => {
  const b = DEMO_BOTS[0]!;
  const s = await drawn('bots', `/bots?sel=${encodeURIComponent(`${b.computer}~${b.realm}~${b.id}`)}`, 'Understood.', "Couldn't read this Bot");
  expect(s).not.toContain("Couldn't read this Bot");
  expect(s).toContain('Understood.');
});

test('Support: the first ticket opens', async () => {
  const list = (await demoClient().request('GET', '/support/tickets?limit=20')) as { data: { tickets: Array<{ id: string }> } };
  const s = await drawn('support', `/support?sel=${list.data.tickets[0]!.id}`, 'Thanks for the details.', "isn't yours or no longer exists");
  expect(s).not.toContain("isn't yours or no longer exists");
  expect(s).toContain('Thanks for the details.');
});

test('Files: the first folder opens', async () => {
  const s = await drawn('files', '/files?a=atlas.00a1&ap=%2Fbin', 'bash', "isn't there any more");
  expect(s).not.toContain("isn't there any more");
  expect(s).toContain('bash');
});

test('Programs: the first program\'s sandbox reads', async () => {
  // nightly-sync (daemon id 4), the row the list shows first: it ended with an error.
  const s = await drawn('programs', `/programs?sel=${encodeURIComponent('prog:4')}`, 'Inbound firewall now', "Could not read this program's sandbox");
  expect(s).not.toContain("Could not read this program's sandbox");
  expect(s).toContain('Inbound firewall now');
});

/** The kit's error state (kit strings.en.json state.errorTitle): what a tab whose read failed draws. */
const DIDNT_LOAD = "This didn't load";

test('Keys: the SSH tab opens', async () => {
  const s = await drawn('keys', '/keys/ssh', 'atlas.ssh.hoody.example', 'This computer is no longer available.');
  expect(s).not.toContain('This computer is no longer available.');
  expect(s).toContain('atlas.ssh.hoody.example');
});

const SCRIPT = encodeURIComponent('atlas.00a1~deploy-site.ts');
/** What the Scripts page draws when the computer's script list did not answer. */
const NO_SCRIPTS = 'The scripts could not be read';

test('Scripts: the first script\'s Code tab opens', async () => {
  const code = await drawn('scripts', `/scripts?sel=${SCRIPT}&tab=code`, 'npm run build', DIDNT_LOAD);
  for (const failed of [DIDNT_LOAD, NO_SCRIPTS]) expect(code).not.toContain(failed);
  expect(code).toContain('npm run build');
});

test('Scripts: the first script\'s Settings tab opens', async () => {
  const settings = await drawn('scripts', `/scripts?sel=${SCRIPT}&tab=settings`, 'Magic comments', DIDNT_LOAD);
  for (const failed of [DIDNT_LOAD, NO_SCRIPTS, "This computer didn't list its settings"]) expect(settings).not.toContain(failed);
  expect(settings).toContain('Magic comments');
});

test('Logs: the Programs source opens', async () => {
  // The source opens on the computer's first program (web) and shows its output.
  const s = await drawn('logs', '/logs?src=programs', 'web listening on port 3000', DIDNT_LOAD);
  expect(s).not.toContain(DIDNT_LOAD);
  expect(s).toContain('web listening on port 3000');
});

test('Notifications: the Notices tab opens', async () => {
  const s = await drawn('notifications', '/notifications/notices', 'No notices about your servers', DIDNT_LOAD);
  expect(s).not.toContain(DIDNT_LOAD);
  expect(s).toContain('No notices about your servers');
});

test('AI: the chat waiting on a decision opens', async () => {
  const s = await drawn('ai', `/ai/c/s-wait?computer=atlas.00a1&realm=${DEMO_CONTEXT.realmId}`, 'The build passed', "can't take requests from the Hub yet");
  for (const failed of ["can't take requests from the Hub yet", "Can't reach the agent", 'This chat is gone or not reachable', 'Connection lost', DIDNT_LOAD]) expect(s).not.toContain(failed);
  expect(s).toContain('The build passed');
});

test('Computers: one realm lists its own computers', async () => {
  const list = (await demoClient().request('GET', '/computers?limit=100')) as { data: { computers: Array<{ name: string; realm_ids: string[] }> } };
  const [own, others] = [list.data.computers.filter((c) => c.realm_ids.includes(DEMO_CONTEXT.realmId)), list.data.computers.filter((c) => !c.realm_ids.includes(DEMO_CONTEXT.realmId))].map((l) => l.map((c) => c.name));
  expect(own!.length).toBeGreaterThan(1);
  expect(others!.length).toBeGreaterThan(0);
  // The realm's last computer shows once the list is drawn; another realm's first would show if the list leaked.
  const s = await drawn('computers', '/computers', own![own!.length - 1]!, others![0]!);
  // As whole words: 'ember' sits inside "November" and "member".
  const word = (name: string): RegExp => new RegExp(`(?<![A-Za-z])${name}(?![A-Za-z])`);
  for (const name of own!) expect(s).toMatch(word(name));
  for (const name of others!) expect(s).not.toMatch(word(name));
});

test('AI: another listed chat opens', async () => {
  const s = await drawn('ai', `/ai/c/s-today?computer=atlas.00a1&realm=${DEMO_CONTEXT.realmId}`, 'All 14 checkout tests pass', 'This chat is gone or not reachable');
  for (const failed of ['This chat is gone or not reachable', "Can't reach the agent", 'Connection lost', DIDNT_LOAD]) expect(s).not.toContain(failed);
  expect(s).toContain('All 14 checkout tests pass');
});

test('Logs: the default view shows the last hour\'s visits', async () => {
  const s = await drawn('logs', '/logs', '/index.html', 'Nothing happened');
  for (const failed of ['Nothing happened', 'These logs could not be read.', 'needs an update', DIDNT_LOAD]) expect(s).not.toContain(failed);
  // The newest visit and the one that went wrong.
  expect(s).toContain('/index.html');
  expect(s).toContain('/wp-login.php');
});

test('Logs: a script\'s runs open', async () => {
  const s = await drawn('logs', '/logs?src=scripts&win=24h&script=deploy-site.ts', 'deploy-site: ran', 'Per-script logs need the next Scripts update');
  for (const failed of ['Per-script logs need the next Scripts update', 'Pick a script in Scripts', 'Nothing happened', DIDNT_LOAD]) expect(s).not.toContain(failed);
  expect(s).toContain('deploy-site: ran');
});

test('Scripts: the first script\'s Overview shows its calls', async () => {
  const s = await drawn('scripts', `/scripts?sel=${SCRIPT}&tab=overview`, 'Typical time', 'Nobody has called it');
  for (const failed of ['Nobody has called it', 'No numbers on this computer', NO_SCRIPTS, DIDNT_LOAD]) expect(s).not.toContain(failed);
  expect(s).toContain('Typical time');
});

test('Tunnels: the connected laptop shows', async () => {
  // One laptop on atlas (demo-answers.ts tunnelAnswer): its dev server as a web address (5173), its database reached
  // from inside atlas (5432).
  const s = await drawn('tunnels', '/tunnels', 'Web address', 'No tunnel program');
  for (const failed of ['No tunnel program', 'Nothing is connected', "Could not read this computer's tunnels", 'Could not tell whether the tunnel program runs', DIDNT_LOAD]) expect(s).not.toContain(failed);
  expect(s).toContain('Web address');
  expect(s).toContain('5173');
  expect(s).toContain('5432');
});

test('Account: the profile shows a verified address and a display name', async () => {
  // demo-answers.ts GET /users/auth/me: the recorded account with its profile complete (pages/account ProfileSection).
  const s = await drawn('account', '/account?section=profile', 'Verified', 'Not verified');
  for (const failed of ['Not verified', 'Your email status could not be read.', DIDNT_LOAD]) expect(s).not.toContain(failed);
  expect(s).toContain('Verified');
  expect(s).toContain('Ada');
});

test('Billing: the servers for rent show their prices', async () => {
  // demo-answers.ts GET /servers/available: each listing's terms in the API's tier shape (servers strings price.none).
  const s = await drawn('billing', '/billing?view=servers', 'Singapore M', 'Not for sale');
  expect(s).not.toContain('Not for sale');
  expect(s).toContain('Singapore M');
  expect(s).toContain('$79');
});

/** The live terminal's hand-off of a payment (pages/billing/parts/moneyTerm.strings.en.json term.money.reason). */
const MONEY_HANDOFF = 'Payments and plan changes are made in the web Hub. The terminal sends none: nothing was sent and nothing was charged.';
/** A payment step's failure and "may have gone through" words (pages/billing strings.en.json mkt.failedTitle, notSent,
 *  band.unknownTitle, co.unknownBody, mkt.notFoundTitle, mkt.posting). No press is made in these mounts, so they could
 *  only come from a step drawn at open. */
const MONEY_TROUBLE = ['Purchase not completed', "didn't go through", 'may have gone through', 'may already have gone through', "couldn't confirm", 'Charging your wallet'];

/** The hand-off box's rows (`┃ │ … │`: the drawer's edge, then the box), trimmed and joined, as
 *  pages/billing/money-handoff.term.test.tsx reads them: the words wrap at a space the frame drops, and nothing drawn
 *  beside the box gets in between. */
const handoffBox = (s: string): string => s.split('\n').map((r) => /┃ │ (.*?) │/.exec(r)?.[1]?.trim() ?? '').filter((r) => r !== '').join(' ');

test('Billing: Add funds hands the payment to the web Hub', async () => {
  const s = await drawn('billing', '/billing?sheet=funds', 'Payments and plan', 'Continue to payment');
  expect(handoffBox(s)).toContain(MONEY_HANDOFF);
  expect(s).toContain('[c Copy link]');
  for (const failed of ['Continue to payment', ...MONEY_TROUBLE]) expect(s.replace(/\s+/g, ' ')).not.toContain(failed);
});

test('Notifications: the inbox is caught up', async () => {
  const s = await drawn('notifications', '/notifications', 'You’re all caught up', DIDNT_LOAD);
  for (const failed of ['Could not load your notifications.', DIDNT_LOAD]) expect(s).not.toContain(failed);
  expect(s).toContain('You’re all caught up');
});

test('Notifications: the newest notice opens', async () => {
  const read = (await demoClient().request('GET', '/notifications?read_only=true&limit=100&page=1')) as { data: Array<{ id: string }> };
  const s = await drawn('notifications', `/notifications?box=archive&sel=${read.data[0]!.id}`, 'before-upgrade', 'as read.');
  for (const failed of ['Couldn’t mark', 'Could not load your notifications.', DIDNT_LOAD]) expect(s).not.toContain(failed);
  expect(s).toContain('before-upgrade');
});
