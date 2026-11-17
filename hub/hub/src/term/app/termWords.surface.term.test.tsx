// No page, the ask dock, the shell or the kit names a browser or a tab as the place the Hub keeps things (the Board
// has its own test at the end: a terminal draws a hand-off in its place). Shared components draw web strings such as "Being built in this browser" or "This
// browser could not keep a record of this send"; in the terminal those records live in this device's Hub store
// (term/env/persist.ts), so the terminal app gives each such key its own wording (termWords.json, applied by
// createTermApp). This reads every string table under those pages as the terminal app has it (the file, with its
// termWords variants over it) and fails on any text that still says "this browser", "the browser", "another browser",
// "this tab" or "the tab that". It reads TERM_WORDS only and never applies it (termWords.term.test.tsx pins that only
// the app applies it).
// The Keys page is swept too (a refused request there said "This browser can't keep a record of the request").
// Left out on purpose: pages/bots/voice (voice never starts in a terminal: kit/voice/MicButton.term.tsx hands Talk off
// to the web, so its "the browser paused the sound" texts are never drawn here).
import { expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { TERM_WORDS, TERM_WORD_TABLES } from './termWords';

const SRC = path.resolve(import.meta.dir, '../..');
const ROOTS = ['ask', 'kit', 'pages', 'shell'];
// kit/gallery: the kit's specimen page, fixtures mode on the web only.
// pages/board: a terminal draws a hand-off in the Board's place; the last test holds what it can still draw of it.
const LEFT_OUT = ['pages/bots/voice/', 'kit/gallery/', 'pages/board/'];
// Also "another tab", "another window", "reload the page", "a reload": where another sender is, or how to start over.
// And "page or tab" / "page and tab" (either order): every place the Hub is open, which in a terminal is its pages.
// And "browser tab": where something opens. A terminal has no tab; the variant says what it is, a web page.
const PLACE = /\bthis browser\b|\bthe browser\b|\banother browser\b|\bthis tab\b|\bthe tab that\b|\b(another|other) tabs?\b|\b(another|this) window\b|\breload (the|this) page\b|\b(a|the) reload\b|\b(page|tab) (or|and) (tab|page)\b|\bbrowser tabs?\b|\bto your browser\b/i;
// A bare "reload" is a page reload unless the sentence stands beside a button named Reload ("Reload reads its latest
// version" names that button, which the terminal draws too). The rule is per sentence, never per table: a table with
// such a button also held two sentences drawn where no Reload button is (a refused Helpers save in Bots, a blocked
// import in AI settings), and they told a terminal user to reload. Left as they are, with the reason:
const RELOAD_LEFT = new Set([
  // each stands beside its own Reload button, in the same band or dialog (FileSettings.tsx `reload`, workflows
  // Source.tsx `stale.reload`, memory Detail.tsx `edit.reload`, Mcp.tsx Compare dialog `conflict.reload`)
  'pages/ai/agents/FileSettings.strings.en.json conflict.unread',
  'pages/ai/auto/workflows/Source.strings.en.json stale',
  'pages/ai/knowledge/memory/Memory.strings.en.json edit.conflict',
  'pages/ai/settings/connections/Mcp.strings.en.json conflict.unreadable',
  'pages/ai/settings/connections/Mcp.strings.en.json conflict.otherLayer',
  // drawn only by CoreNotices (shell/notices.tsx), which only the web shell mounts (shell/AppShell.tsx); the
  // terminal's shell has its own pending notice (term/shell/pendingNotice.tsx)
  'shell/strings.en.json notice.hubUpdated',
  'shell/strings.en.json notice.chunkFailed',
  // "reload" is the word typed after /hooks, not a page reload
  'pages/ai/parts/Conversation.strings.en.json slash.hint.hooks',
  'pages/ai/parts/Conversation.strings.en.json slash.desc.hooks',
  // the name of a button that reads one thing again (the desktop, the usage numbers, one web widget), not the page
  'pages/computers/strings.en.json desktop.reload',
  'pages/computers/strings.en.json usage.reload',
  'pages/home/widgets/strings.en.json menu.reload',
]);

// Strings of a swept table that a terminal never draws, each with the reason. They keep the web's words. A key that
// stops naming the browser must leave this list (the last test fails on it).
const NOT_DRAWN = new Set([
  // the "add a browser alert" hints (shell/notify/NotifyHint.tsx): shown only where browser alerts can be set up; a
  // host that is not a page reads as a browser without alerts (core/alerts.ts readEnv), so no hint is ever wanted
  'shell/strings.en.json hint.bot',
  'shell/strings.en.json hint.script',
  'shell/strings.en.json hint.schedule',
  // no source reads these three any more (the page an app opened in while it started is gone); nothing draws them
  'pages/apps/strings.en.json tab.back',
  'pages/apps/strings.en.json tab.line',
  'pages/apps/strings.en.json unavailable',
  // Talk hands off to the web in a terminal (kit/voice/MicButton.term.tsx, TalkBar.term.tsx): the bar's phase, device
  // and ended lines are drawn by the web bar only
  'kit/voice/Voice.strings.en.json devices.outputWhy',
  'kit/voice/Voice.strings.en.json phase.denied',
  'kit/voice/Voice.strings.en.json phase.playbackBlockedWhy',
  'kit/voice/Voice.strings.en.json phase.busyElsewhere',
  'kit/voice/Voice.strings.en.json phase.budget',
  'kit/voice/Voice.strings.en.json ended.takenOver',
  // making a key in the page is handed off to the web (kit/forms/SshKeyHelp.term.tsx draws a Handoff in its place)
  'kit/forms/SshKeyHelp.strings.en.json sshhelp.make.unsupported',
  // the line under a key the page made and saved ("went to your browser's downloads"): only the web makes a key in
  // the page (SshKeyHelp.tsx `made.state === 'saved'`); the terminal twin never reads it
  'kit/forms/SshKeyHelp.strings.en.json sshhelp.saved.body',
  // Account's passcode section and its sheet: a terminal draws parts/LockSection.term.tsx in their place (no passcode
  // here, a hand-off to the web Hub), and nothing else opens the sheet
  'pages/account/strings.en.json lock.offBody',
  'pages/account/strings.en.json lock.removeBody',
  'pages/account/strings.en.json lock.err.unsupported',
  'pages/account/strings.en.json lock.err.noWebLocksSet',
  'pages/account/strings.en.json lock.err.notSaved',
  'pages/account/strings.en.json lock.err.wrongLeft_one',
  'pages/account/strings.en.json lock.err.wrongLeft_other',
  'pages/account/strings.en.json lock.err.removedElsewhere',
  'pages/account/strings.en.json lock.err.noVerifier',
  'pages/account/strings.en.json lock.done.set',
  'pages/account/strings.en.json lock.limit',
  'pages/account/strings.en.json lock.why.a',
  // no source reads these three (the sessions list marks the current one with s.this)
  'pages/account/strings.en.json s.endedHere',
  'pages/account/strings.en.json s.thisSession',
  'pages/account/strings.en.json ag.lead',
  // the browser-alert card (pages/notifications/parts/BrowserCard.tsx reads them, nothing else does): a terminal draws
  // parts/BrowserCard.term.tsx in its place, a hand-off to the web Hub
  'pages/notifications/strings.en.json h.status.on',
  'pages/notifications/strings.en.json h.status.off',
  'pages/notifications/strings.en.json h.status.ask',
  'pages/notifications/strings.en.json h.status.blocked',
  'pages/notifications/strings.en.json h.status.broken',
  'pages/notifications/strings.en.json h.result.denied',
  'pages/notifications/strings.en.json h.result.disabled',
  'pages/notifications/strings.en.json h.test.body',
  'pages/notifications/strings.en.json h.test.ctor',
  'pages/notifications/strings.en.json h.test.denied',
  'pages/notifications/strings.en.json h.test.unsupported',
  'pages/notifications/strings.en.json h.why.no_api',
  'pages/notifications/strings.en.json h.broken.text',
  'pages/notifications/strings.en.json h.blocked.text',
  'pages/notifications/strings.en.json h.reenable.chrome',
  'pages/notifications/strings.en.json h.reenable.firefox',
  'pages/notifications/strings.en.json h.reenable.safari',
  'pages/notifications/strings.en.json h.reenable.android',
  // no source reads these two (Logs has no paused-in-the-background state and lists computers through its own states)
  'pages/logs/strings.en.json live.hidden',
  'pages/logs/strings.en.json st.noList',
  // Customize.tsx reads it only where the layout is saved; a terminal keeps the layout until the Hub closes and draws
  // customize.body.term (parts/customizeWords.term.ts)
  'pages/home/strings.en.json customize.body',
  // shown only when an added web widget is lost; a terminal has no Add form (widgets/AddWidget.term.tsx)
  'pages/home/widgets/strings.en.json add.lost',
  // read only by the Vault's export dialog (parts/ExportDialog.tsx), which a terminal never opens: its menu has no
  // "Export vault…" (pages/vault/export-menu.term.test.tsx). They had terminal wordings nothing drew; one named a
  // choice ("Choose Readable") that is not on a terminal's screen.
  'pages/vault/strings.en.json export.noCrypto',
  'pages/vault/strings.en.json export.serialize',
  // the welcome cards: drawn by pages/onboarding/view.tsx only; a terminal draws view.term.tsx, which has no cards
  'pages/onboarding/strings.en.json card.computers.body',
  'pages/onboarding/strings.en.json card.programs.body',
  // the web's browser-alerts card (parts/BrowserCard.tsx `h.why.*`); a terminal draws BrowserCard.term.tsx
  'pages/notifications/strings.en.json h.why.ios_tab',
]);
// Drawn in a terminal, and rightly about a browser: each says in its own words that it describes the Hub on the web.
// (A test below checks that each still says "on the web" or "web Hub".)
const ABOUT_THE_WEB = new Set([
  // the terminal's own hand-off line for the passcode: "... in the browser where you set it, in the web Hub."
  'pages/account/parts/lockTerm.strings.en.json term.lock.reason',
]);
// Drawn in a terminal and true there as written: the browser named is not the Hub's place.
const TRUE_HERE = new Set([
  // "the Browser" is the name of an app on the computer
  'pages/guide/strings.en.json recipe.1.body',
  // the browser of the person who opens a referral link remembers it; that is never this Hub
  'pages/referrals/strings.en.json link.intro',
  // a phone's browser: "A browser tab cannot show alerts on iPhone or iPad" is about that phone, wherever it is read
  'pages/notifications/strings.en.json faq.iphone.a',
  // the terminal's own line for why it has no alerts: they need the Hub open in a browser tab, which is the reason
  'pages/notifications/parts/BrowserCard.term.strings.en.json term.alerts.reason',
]);
const left = (id: string): boolean => NOT_DRAWN.has(id) || ABOUT_THE_WEB.has(id) || TRUE_HERE.has(id);

const tables = (): string[] =>
  ROOTS.flatMap((root) => (readdirSync(path.join(SRC, root), { recursive: true, encoding: 'utf8' }) as string[])
    .filter((f) => f.endsWith('strings.en.json'))
    .map((f) => `${root}/${f.split(path.sep).join('/')}`))
    .filter((name) => !LEFT_OUT.some((p) => name.startsWith(p)))
    .sort();

test('the tables those pages draw are found (the sweep reads something)', () => {
  const names = tables();
  expect(names.length).toBeGreaterThan(100);
  for (const name of ['ask/strings.en.json', 'pages/ai/strings.en.json', 'pages/scripts/strings.en.json', 'pages/bots/strings.en.json', 'pages/schedules/strings.en.json', 'pages/ai/folders/strings.en.json', 'pages/ai/parts/Conversation.strings.en.json', 'pages/files/transfers/transfers.strings.en.json', 'pages/billing/strings.en.json', 'shell/strings.en.json', 'kit/strings.en.json']) {
    expect({ name, found: names.includes(name) }).toEqual({ name, found: true });
  }
});

test('as the terminal draws them, no string of a swept table names a browser or a tab as where the Hub keeps things', () => {
  const offenders: string[] = [];
  for (const name of tables()) {
    const table = { ...(JSON.parse(readFileSync(path.join(SRC, name), 'utf8')) as Record<string, unknown>), ...(TERM_WORDS[name] ?? {}) };
    for (const [key, text] of Object.entries(table)) if (typeof text === 'string' && PLACE.test(text) && !left(`${name} ${key}`)) offenders.push(`${name} ${key}`);
  }
  expect(offenders).toEqual([]);
});

test('as the terminal draws them, no sentence tells the person to reload, unless it stands beside a Reload button', () => {
  const offenders: string[] = [];
  for (const name of tables()) {
    const table = { ...(JSON.parse(readFileSync(path.join(SRC, name), 'utf8')) as Record<string, unknown>), ...(TERM_WORDS[name] ?? {}) };
    // "Reload" alone is a button's name (it reads one thing again), never a sentence about the page.
    for (const [key, text] of Object.entries(table)) if (typeof text === 'string' && text !== 'Reload' && /\breload\b/i.test(text) && !RELOAD_LEFT.has(`${name} ${key}`) && !left(`${name} ${key}`)) offenders.push(`${name} ${key}`);
  }
  expect(offenders).toEqual([]);
});

test('approvals held elsewhere and a script that changed read as the rest of the terminal does', () => {
  expect(TERM_WORDS['kit/agent/Approver.strings.en.json']?.['approver.invalid']).toBe('Another Hub now holds the approvals for this chat.');
  expect(TERM_WORDS['kit/agent/SessionView.strings.en.json']?.['sv.why.approver_elsewhere']).toBe('Approvals for this chat are held by another Hub.');
  expect(TERM_WORDS['pages/scripts/strings.en.json']?.['err.REVISION_MISMATCH']).toBe('The script changed while you were editing. Open it again and try again.');
});

test('the builds list, a refused send and a lost record say "this device", as the rest of the terminal does', () => {
  expect(TERM_WORDS['pages/scripts/strings.en.json']?.['build.title_other']).toBe('Being built on this device · {{count}}');
  expect(TERM_WORDS['ask/strings.en.json']?.['ask.notRemembered']).toContain('This device could not keep a record of this send, so nothing was sent.');
  expect(TERM_WORDS['pages/ai/strings.en.json']?.['def.notHeld']).toBe('Nothing was sent: this device could not keep track of the change. Try again in a moment.');
});

// The terminal Vault draws no web-only step: its file button hands off to the web Hub (kit/controls/FileButton.term.tsx),
// its value is shown with Show value (no eye), and its no-access button leaves the Hub (no sign-out runs here).
test('the Vault, as the terminal draws it, asks for no .env file, no eye and no sign-out', () => {
  const name = 'pages/vault/strings.en.json';
  const table = { ...(JSON.parse(readFileSync(path.join(SRC, name), 'utf8')) as Record<string, unknown>), ...(TERM_WORDS[name] ?? {}) };
  const WEB_ONLY = /\.env file|\bthe eye\b|\bsign out and sign in\b/i;
  const offenders = ['import.body', 'value.why.a', 'forbidden.body'].filter((k) => WEB_ONLY.test(String(table[k])));
  expect(offenders).toEqual([]);
});

// The ask dock and the Keys page also name no page reload, no other tab or window and no site storage: a terminal has
// none of them. What a reload loses is lost when the Hub is quit; what another tab does, another Hub does; a refused
// request is tried again by opening the page again. ("Reload" as the name of a button that reads a list again is a
// different thing and stays: neither of these two tables has one.)
test('as the terminal draws them, the ask dock and the Keys page name no reload, no other tab or window and no site storage', () => {
  const RELOAD = /\breload(s|ed|ing)?\b|\b(another|other|this|the|a new) (tab|window)\b|\btabs? or windows?\b|\bthis site\b/i;
  const offenders: string[] = [];
  for (const name of ['ask/strings.en.json', 'pages/keys/strings.en.json']) {
    const table = { ...(JSON.parse(readFileSync(path.join(SRC, name), 'utf8')) as Record<string, unknown>), ...(TERM_WORDS[name] ?? {}) };
    for (const [key, text] of Object.entries(table)) if (typeof text === 'string' && RELOAD.test(text)) offenders.push(`${name} ${key}`);
  }
  expect(offenders).toEqual([]);
});

test('a refused Keys request and an Ask send from elsewhere read as the rest of the terminal does', () => {
  expect(TERM_WORDS['pages/keys/strings.en.json']?.['out.refused.NO_STORAGE']).toContain("This device can't keep a record of the request");
  expect(TERM_WORDS['pages/keys/strings.en.json']?.['share.notSent']).toBe('Nothing was sent. Open the page again and try again.');
  expect(TERM_WORDS['ask/strings.en.json']?.['ask.sendingElsewhere']).toBe('Another Hub may still be sending this. Check again in a moment.');
  expect(TERM_WORDS['ask/strings.en.json']?.['ask.checkOnly']).toContain("aren't kept after you quit the Hub");
});

// The shell: the lock screen and the notice after a failed clean-up name this device and the Hub, never a browser, a
// tab or a reload (term/shell/Prompts.tsx draws them). "Forget this device" is the terminal's name for the web's
// "Forget this browser", on the action, in its question and in the sentences that send the person to it.
test('the lock screen names this device and the Hub', () => {
  const name = 'shell/strings.en.json';
  const web = JSON.parse(readFileSync(path.join(SRC, name), 'utf8')) as Record<string, string>;
  const term = TERM_WORDS[name]!;
  expect(web['lock.screen.forget']).toBe('Forget this browser');
  expect(term['lock.screen.forget']).toBe('Forget this device');
  expect(term['lock.forgot.title']).toBe('Forget this device?');
  for (const key of ['lock.screen.noVerifier', 'lock.noWebLocks']) expect({ key, namesTheAction: term[key]!.includes('Forget this device') }).toEqual({ key, namesTheAction: true });
  for (const key of ['lock.screen.wrongLeft_one', 'lock.screen.wrongLeft_other']) {
    expect({ key, term: term[key] }).toEqual({ key, term: web[key]!.replace('this browser signs out', 'the Hub signs out') });
  }
  expect(term['lock.forgot.body']).toBe(web['lock.forgot.body']!.replace('on this browser', 'on this device'));
  expect(term['lock.removedElsewhere']).toBe('The passcode was turned off in another Hub. Quit the Hub and start it again to continue.');
  expect(term['notice.purgeBody']).toBe("The Hub couldn't clear your data from this device. Try again.");
});

// Apps and Open with: a choice the Hub keeps is kept on this device, and the actions that need no program on the
// computer (Preview, Download, View, Edit) are the ones "On this device". An app that opens as a web page is said so:
// which program shows that page is not the Hub's to name.
test('Open with keeps its choices on this device, and a web app opens as a web page', () => {
  const name = 'pages/apps/launch/openWith/strings.en.json';
  const web = JSON.parse(readFileSync(path.join(SRC, name), 'utf8')) as Record<string, string>;
  const term = TERM_WORDS[name]!;
  for (const key of ['ow.chooser.unsaved', 'ow.chooser.oversized', 'ow.chooser.locked']) {
    expect({ key, term: term[key] }).toEqual({ key, term: web[key]!.replace('on this browser', 'on this device') });
  }
  expect(term['w.notDurable']).toBe(web['w.notDurable']!.replace('This browser', 'This device'));
  expect(web['ow.chooser.browserSection']).toBe('In this browser');
  expect(term['ow.chooser.browserSection']).toBe('On this device');
  expect(TERM_WORDS['pages/apps/strings.en.json']?.['opt.opensWeb']).toBe('As a web page');
});

// Account's two passcode questions are drawn in a terminal (the page's FAQ), where there is no passcode: each answer
// opens by saying the lock is the web Hub's, then keeps the web's answer about that browser.
test('the passcode answers say the lock is the web Hub\'s', () => {
  const name = 'pages/account/strings.en.json';
  const web = JSON.parse(readFileSync(path.join(SRC, name), 'utf8')) as Record<string, string>;
  const term = TERM_WORDS[name]!;
  const protects = web['faq.lockProtects.a']!;
  expect(protects.startsWith('Once locked, ')).toBe(true);
  expect(term['faq.lockProtects.a']).toBe('The passcode lock is part of the Hub on the web; the Hub in a terminal has none. On the web, once locked, '
    + protects.slice('Once locked, '.length).replace("this browser's storage", 'what the web Hub stores on the device'));
  expect(term['faq.lockScope.q']).toBe('Where does the passcode apply, and what removes it?');
  expect(term['faq.lockScope.a']!.startsWith('The lock belongs to the Hub on the web, in the one place you set it; the Hub in a terminal has none. ')).toBe(true);
  // every clause of the web answer is still answered: tabs, sign-out, removal, signing in again, site data, notices
  for (const part of ['ach tab and window locks on its own', 'Signing out keeps the passcode', 'use Remove passcode', 'the Hub still asks for it', 'removes the lock and signs you out', 'Notices already shown']) {
    expect({ part, web: web['faq.lockScope.a']!.includes(part), term: term['faq.lockScope.a']!.includes(part) }).toEqual({ part, web: true, term: true });
  }
});

// Get notified: a terminal has no background tab, so the answer about timing ends where the web's first clause ends.
test('the timing answer names no background tab', () => {
  const name = 'pages/notifications/strings.en.json';
  const web = JSON.parse(readFileSync(path.join(SRC, name), 'utf8')) as Record<string, string>;
  const tail = ', and a tab in the background pauses those checks until you come back to it.';
  expect(web['faq.timing.a']!.endsWith(tail)).toBe(true);
  expect(TERM_WORDS[name]?.['faq.timing.a']).toBe(web['faq.timing.a']!.slice(0, -tail.length) + '.');
});

// The rest of the pages. Each terminal sentence is the sentence the terminal drew before with one part replaced: what
// the web says "this browser" could not keep, the Hub could not keep; what "another tab" did was done by another page
// of this Hub or another Hub; and a page reload is the Hub starting again.
test('files, realms, logs, home, notes, computers and programs: one part of each sentence is replaced, the rest is kept', () => {
  const pairs: Array<[string, string, string, string]> = [
    ['pages/files/Transfer.strings.en.json', 'verdict.elsewhere', "This was checked in another tab or window.", "This was checked on another page of this Hub or in another Hub."],
    ['pages/files/link/link.strings.en.json', 'check.notFound', "Only the tab that sent it can send it again.", "Only the Hub that sent it can send it again."],
    ['pages/files/storage/strings.en.json', 'token.step.run', "sign in in the browser it opens", "sign in on the page it opens"],
    ['pages/files/storage/strings.en.json', 'held.elsewhere', "another tab or page", "another page of this Hub or another Hub"],
    ['pages/files/transfers/transfers.strings.en.json', 'sending.unknown', "from another tab", "from another page of this Hub or another Hub"],
    ['pages/files/transfers/transfers.strings.en.json', 'state.elsewhere', "Sent from another tab", "Sent from another page or Hub"],
    ['pages/realms/strings.en.json', 'noSecure', "This browser can't make a safe id for the realm. Use an up-to-date browser.", "The Hub can't make a safe id for the realm on this device."],
    ['pages/realms/strings.en.json', 'items.elsewhereLabel', "Held in another tab", "Held on another page"],
    ['pages/realms/strings.en.json', 'items.heldElsewhereHelp', "Another tab's Computers page holds", "A Computers page, in this Hub or another, holds"],
    ['pages/realms/strings.en.json', 'faq.switchRemove.a', "after a reload", "after the Hub starts again"],
    ['pages/logs/strings.en.json', 'v.notKept', "This browser would not keep", "The Hub could not keep"],
    ['pages/logs/strings.en.json', 'v.clearFail', "This browser would not remove", "The Hub could not remove"],
    ['pages/logs/strings.en.json', 'v.clearAskBody', "They are saved in this browser only.", "They are saved in this Hub only."],
    ['pages/home/strings.en.json', 'needs.scope.account', "sent from this browser", "(sent from this Hub)"],
    ['pages/home/widgets/strings.en.json', 'toast.notKept', "couldn't be saved in this browser.", "couldn't be saved."],
    ['pages/notes/strings.en.json', 'toast.holdNotKept', "This browser could not remember", "The Hub could not remember"],
    ['pages/notes/strings.en.json', 'new.sendingOut', "in another tab or on the Board", "in another Hub or on the Board"],
    ['pages/notes/strings.en.json', 'new.notClaimed', "or another tab or the Board", "or another Hub or the Board"],
    ['pages/computers/strings.en.json', 'desktop.unknown.onWay', "maybe from another tab", "maybe from another Hub"],
    ['pages/computers/strings.en.json', 'desktop.reopened.body', "maybe from another tab", "maybe from another Hub"],
    ['pages/programs/sandbox/strings.en.json', 'sb.out.elsewhere', "in another tab or page", "on another page of this Hub or in another Hub"],
    ['pages/programs/sandbox/strings.en.json', 'np.out.storage', "This browser can't keep track", "The Hub can't keep track"],
  ];
  for (const [name, key, from, to] of pairs) {
    const web = (JSON.parse(readFileSync(path.join(SRC, name), 'utf8')) as Record<string, string>)[key]!;
    const term = TERM_WORDS[name]?.[key];
    expect({ name, key, has: term !== undefined && term.includes(to) && !term.includes(from) }).toEqual({ name, key, has: true });
    // realms faq.switchRemove.a already had a terminal wording (no "tap the realm square"); every other one is the web's
    if (key !== 'faq.switchRemove.a') expect({ name, key, term }).toEqual({ name, key, term: web.replace(from, to) });
  }
});

// Get notified's answer to "What are browser alerts?" is drawn in a terminal (the page's FAQ). The web's answer says
// "they stay in this browser: turning them on here ..."; in a terminal there is no "here" to turn them on. The
// terminal's answer says first that the alerts are the web Hub's and that a terminal shows none, then keeps what the
// web's answer says about them.
test('the browser-alert answer says the alerts are the web Hub\'s and names no "here"', () => {
  const name = 'pages/notifications/strings.en.json';
  const web = (JSON.parse(readFileSync(path.join(SRC, name), 'utf8')) as Record<string, string>)['faq.browser.a']!;
  const term = TERM_WORDS[name]!['faq.browser.a']!;
  expect(web).toContain('turning them on here');
  expect(term.startsWith('These alerts are part of the Hub on the web; the Hub in a terminal shows none.')).toBe(true);
  expect(/\bhere\b|\bthis (tab|page|device)\b/i.test(term)).toBe(false);
  expect(PLACE.test(term)).toBe(false);
  // what the web's answer says of an alert is still said
  for (const kept of ['a pop-up about a new notice', "An alert shows a short title and a fixed line to open the Hub, never the notice's message.", 'Alerts are optional',
    'asked for permission when you turn them on', 'Other Hub activity, such as a Bot waiting for you, can use the same alerts.']) {
    expect({ kept, has: term.includes(kept) }).toEqual({ kept, has: true });
  }
  for (const said of ["An alert shows a short title and a fixed line to open the Hub, never the notice's message.", 'Alerts are optional',
    'Other Hub activity, such as a Bot waiting for you, can use the same alerts.']) {
    expect({ said, web: web.includes(said) }).toEqual({ said, web: true });
  }
});

test('every string left as never drawn is still there and still names the browser, a tab or a reload', () => {
  for (const id of NOT_DRAWN) {
    const [name, key] = id.split(' ') as [string, string];
    const text = (JSON.parse(readFileSync(path.join(SRC, name), 'utf8')) as Record<string, unknown>)[key];
    expect({ id, stillNamesIt: typeof text === 'string' && PLACE.test(text) }).toEqual({ id, stillNamesIt: true });
    expect({ id, hasVariant: TERM_WORDS[name]?.[key] !== undefined }).toEqual({ id, hasVariant: false });
  }
});

test('every string left because it is about the web still says so', () => {
  for (const id of ABOUT_THE_WEB) {
    const [name, key] = id.split(' ') as [string, string];
    const text = TERM_WORDS[name]?.[key] ?? (JSON.parse(readFileSync(path.join(SRC, name), 'utf8')) as Record<string, unknown>)[key];
    expect({ id, saysWeb: typeof text === 'string' && /\bon the web\b|\bweb Hub\b/i.test(text) }).toEqual({ id, saysWeb: true });
    expect({ id, stillNamesIt: typeof text === 'string' && PLACE.test(text) }).toEqual({ id, stillNamesIt: true });
  }
});

test('every string left as true in a terminal is still there and has no terminal wording', () => {
  for (const id of TRUE_HERE) {
    const [name, key] = id.split(' ') as [string, string];
    const text = (JSON.parse(readFileSync(path.join(SRC, name), 'utf8')) as Record<string, unknown>)[key];
    expect({ id, stillNamesIt: typeof text === 'string' && PLACE.test(text) }).toEqual({ id, stillNamesIt: true });
    expect({ id, hasVariant: TERM_WORDS[name]?.[key] !== undefined }).toEqual({ id, hasVariant: false });
  }
});

// The Board. Its tiles are live browser frames, so a terminal draws a hand-off in the Board's place
// (pages/board/parts/BoardView.term.tsx) and in a single program's (parts/ProgramView.term.tsx), and the Board's
// tables (its own, its options, its broadcast) are otherwise read by web views only: they are not swept. Other pages
// reach the Board through pages/board/links.ts alone. What a terminal can still draw of the Board is the hand-off's
// own table (it says "browser frames" and "web browser" of the web Board, rightly), the Put on Board button's table,
// and these keys of the Board's table (read by parts/programViewTitle.ts, parts/tileInfo.pure.ts, parts/addLinks.ts
// and view.tsx). A module newly reached from links.ts or from the two hand-off views adds its keys here.
const BOARD = 'pages/board/strings.en.json';
const BOARD_DRAWN = ['title', 'tile.name', 'tile.port', 'tile.script', 'tile.inRealm', 'realm.global', 'add.bad', 'add.left_one', 'add.left_other'];
test('the Board is a hand-off in a terminal, and what a terminal still draws of it names no browser or tab', () => {
  for (const view of ['pages/board/parts/BoardView.term.tsx', 'pages/board/parts/ProgramView.term.tsx']) {
    const source = readFileSync(path.join(SRC, view), 'utf8');
    expect({ view, handsOff: source.includes('<Handoff ') }).toEqual({ view, handsOff: true });
  }
  const board = JSON.parse(readFileSync(path.join(SRC, BOARD), 'utf8')) as Record<string, unknown>;
  for (const key of BOARD_DRAWN) {
    const text = TERM_WORDS[BOARD]?.[key] ?? board[key];
    expect({ key, clean: typeof text === 'string' && !PLACE.test(text) }).toEqual({ key, clean: true });
  }
  const put = 'pages/board/boardAdd.strings.en.json';
  for (const [key, text] of Object.entries(JSON.parse(readFileSync(path.join(SRC, put), 'utf8')) as Record<string, unknown>)) {
    const drawn = TERM_WORDS[put]?.[key] ?? text;
    expect({ key, clean: typeof drawn === 'string' && !PLACE.test(drawn) }).toEqual({ key, clean: true });
  }
});

// Three sentences said "page or tab" / "page and tab" and the sweep did not look for it: stopping a tracked model
// change (AI default, an agent's model or effort) and a held exit-address change sent from elsewhere. A terminal Hub
// has pages and no tabs. Two more told the person to reload where no Reload button is drawn.
test('"page and tab" is this Hub\'s pages, and a reload with no Reload button is opening the page again', () => {
  const web = (name: string, key: string) => (JSON.parse(readFileSync(path.join(SRC, name), 'utf8')) as Record<string, string>)[key]!;
  for (const [name, key] of [['pages/ai/strings.en.json', 'def.stop.body'], ['pages/ai/agents/strings.en.json', 'model.stop.body']] as const) {
    expect({ key, web: web(name, key).startsWith('Every page and tab stops waiting for this change.') }).toEqual({ key, web: true });
    expect({ key, term: TERM_WORDS[name]?.[key] }).toEqual({ key, term: web(name, key).replace('Every page and tab stops', 'Every page of this Hub stops') });
  }
  const EXIT = 'pages/computers/parts/ExitIp.strings.en.json';
  expect(web(EXIT, 'exit.held.elsewhere')).toBe('It was sent from another page or tab; it is settled there.');
  // the same words as the firewall's sentence for the same case
  expect(TERM_WORDS[EXIT]?.['exit.held.elsewhere']).toBe(TERM_WORDS['pages/computers/parts/Firewall.strings.en.json']?.['fw.held.elsewhere']);
  expect(TERM_WORDS[EXIT]?.['exit.held.elsewhere']).toBe('It was sent from another page of this Hub; it is settled there.');
  expect(Object.keys(TERM_WORD_TABLES)).toContain(EXIT);
  const BOTS = 'pages/bots/strings.en.json', MCP = 'pages/ai/settings/connections/Mcp.strings.en.json';
  expect(TERM_WORDS[BOTS]?.['workers.refused.worker_delegated_agent']).toBe(web(BOTS, 'workers.refused.worker_delegated_agent').replace('Reload and try again.', 'Open the page again and try again.'));
  expect(TERM_WORDS[MCP]?.['imp.block.incomplete']).toBe(web(MCP, 'imp.block.incomplete').replace('Reload, then preview again.', 'Open the page again, then preview again.'));
  for (const [name, key] of [[BOTS, 'workers.refused.worker_delegated_agent'], [MCP, 'imp.block.incomplete']] as const) {
    expect({ key, webSaysReload: /\bReload\b/.test(web(name, key)), termSaysReload: /\breload\b/i.test(TERM_WORDS[name]![key]!) }).toEqual({ key, webSaysReload: true, termSaysReload: false });
  }
});

// A zip backup's download never lands in a browser when it is started from a terminal: it runs outside the Hub (the
// page's own line, snapshots zip.lede, says so). The Computers FAQ still said "straight from the computer to your
// browser", and the sweep did not look for a download's destination.
test('a download goes to no browser: the zip backup answer says where it runs', () => {
  const NAME = 'pages/computers/strings.en.json', KEY = 'faq.snapshotsAndBackups.a';
  const web = (JSON.parse(readFileSync(path.join(SRC, NAME), 'utf8')) as Record<string, string>)[KEY]!;
  expect(web).toContain('the download goes straight from the computer to your browser.');
  expect(TERM_WORDS[NAME]?.[KEY]).toBe(web.replace('the download goes straight from the computer to your browser.', 'the download goes straight from the computer and runs outside the Hub.'));
  // the page's own line for the same thing
  expect(TERM_WORDS['pages/computers/snapshots/strings.en.json']?.['zip.lede']).toContain('outside the Hub');
  for (const said of ['The file goes straight to your browser.', 'It is sent to your browser, which shows the progress.']) expect({ said, caught: PLACE.test(said) }).toEqual({ said, caught: true });
  // a browser a person is told to use is not a place the Hub keeps or sends things
  for (const said of ['Open this address in your browser', 'The terminal in your browser needs no key.']) expect({ said, caught: PLACE.test(said) }).toEqual({ said, caught: false });
});

// A terminal wording that nothing draws is not kept: it reads as if the terminal had that screen.
test('no terminal wording is kept for the Vault export dialog or the web screen\'s slow line', () => {
  expect(TERM_WORDS['pages/vault/strings.en.json']?.['export.noCrypto']).toBeUndefined();
  expect(TERM_WORDS['pages/vault/strings.en.json']?.['export.serialize']).toBeUndefined();
  // read only by pages/vms/parts/Screen.tsx; a terminal draws Screen.term.tsx, which reads screen.none.* only
  expect(TERM_WORDS['pages/vms/strings.en.json']?.['screen.slow']).toBeUndefined();
  expect(TERM_WORDS['pages/vms/strings.en.json']?.['screen.none.framed']).toBe('The screen is not shown inside another page. Open its address outside the Hub.');
});

// "browser tab" was not in the sweep: two Apps sentences a terminal draws (the launcher's subtitle and the data
// category's line, both in launch/FindPane.tsx, which has no terminal twin) said a program opens "in a browser tab".
test('"a browser tab" is a web page, and the sweep now catches the phrase', () => {
  const APPS = 'pages/apps/strings.en.json';
  const web = JSON.parse(readFileSync(path.join(SRC, APPS), 'utf8')) as Record<string, string>;
  expect(TERM_WORDS[APPS]?.['launch.subtitle']).toBe(web['launch.subtitle']!.replace('a browser tab', 'a web page'));
  expect(TERM_WORDS[APPS]?.['cat.data.desc']).toBe(web['cat.data.desc']!.replace('a browser tab', 'a web page'));
  for (const k of ['launch.subtitle', 'cat.data.desc']) {
    expect({ k, web: PLACE.test(web[k]!), term: PLACE.test(TERM_WORDS[APPS]![k]!) }).toEqual({ k, web: true, term: false });
  }
  // what a new string of this kind would say
  for (const s of ['It opens in a browser tab.', 'Keep the browser tabs open.', 'Sent from another page or tab.', 'Every page and tab stops.']) expect({ s, caught: PLACE.test(s) }).toEqual({ s, caught: true });
  // and what it must not catch: a tab character
  expect(PLACE.test('Remove the line breaks and tabs.')).toBe(false);
});
