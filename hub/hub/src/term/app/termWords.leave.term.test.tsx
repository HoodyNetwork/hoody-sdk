// Account and Notifications words a terminal cannot keep from the web.
// - After a password change every session is ended. On the web the way on is "Sign in again" (the page reloads to the
//   sign-in page). A terminal Hub has no sign-in page to reload to: the same action leaves the Hub, and the next start
//   signs in. It carries the name the terminal already uses for that action (token.signOut).
// - The web shows the unread count on a bell. A terminal has no bell: the count is beside Notifications in the
//   sidebar.
// - The local-data check names this device, as the rest of that dialog does.
// - Remove all local data. On the web it signs the person out (the session is ended on the server and the sign-in is
//   cleared), then forgets what the browser keeps. A terminal Hub never signs the person out: the sign-in is the
//   command line's, and only `hoody logout` ends it (term/env/client-shared.ts: a purge never signs the CLI out, and
//   the sign-out's revocation step revokes nothing). There the Hub forgets what it keeps and the person leaves the
//   Hub, still signed in. Saying "signs you out" told a person on a shared machine that they were signed out.
// - "Sign in again" where no button does it. A terminal Hub cannot sign in: the person leaves it, runs hoody login
//   and starts it again (what the next `hoody hub` itself prints when the sign-in is gone). And what the web loses
//   "if you sign out" a terminal loses when the person leaves the Hub: there is no sign-out in it.
import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import kitStates from '../../kit/states/strings.en.json';
import { TERM_WORDS, TERM_WORD_TABLES } from './termWords';

const ACCOUNT = 'pages/account/strings.en.json';
const NOTICES = 'pages/notifications/strings.en.json';
const webOf = (name: string) => JSON.parse(readFileSync(path.resolve(import.meta.dir, '../..', name), 'utf8')) as Record<string, string>;

test('after a password change the way on is the terminal\'s own leave action, by one name', () => {
  const web = webOf(ACCOUNT), term = TERM_WORDS[ACCOUNT]!;
  const leave = term['token.signOut'];
  expect(leave).toBe('Leave the Hub');
  for (const key of ['pw.signIn', 'pw.signInAgain']) {
    expect({ key, web: web[key] }).toEqual({ key, web: 'Sign in again' });
    expect({ key, term: term[key] }).toEqual({ key, term: leave });
  }
  // The two sentences name the button the dialog shows, and keep the web's advice about which password to try.
  expect(term['pw.done']).toBe('Your password is changed and every session was signed out, this one too. Leave the Hub, then sign in again with the new password.');
  expect(term['pw.unsure']).toBe("We can't tell whether the password changed. Leave the Hub, then sign in with the new password first. If that fails, use the old one.");
  expect(web['pw.done']).toContain('Sign in again with the new password.');
  // The dialog's title when the outcome is unknown, and the same advice on the password sheet's banner (its button is
  // pw.signInAgain): both name the action the button has.
  expect(web['pw.unsureTitle']).toBe('Sign in again');
  expect(term['pw.unsureTitle']).toBe('Leave the Hub and sign in again');
  expect(web['check.unknownPw']!.split('Sign in again with the new password;').length).toBe(2);
  expect(term['check.unknownPw']).toBe(web['check.unknownPw']!.replace('Sign in again with the new password;', 'Leave the Hub, then sign in again with the new password;'));
  // No account string a terminal draws beside that button still tells the person to sign in again without leaving.
  for (const key of ['pw.unsureTitle', 'check.unknownPw', 'pw.done', 'pw.unsure']) {
    expect({ key, namesLeave: term[key]!.includes('Leave the Hub') }).toEqual({ key, namesLeave: true });
  }
  expect(web['pw.unsure']).toContain('Sign in with the new password first. If that fails, use the old one.');
});

test('the unread count is not on a bell in a terminal', () => {
  const web = webOf(NOTICES), term = TERM_WORDS[NOTICES]!;
  for (const key of ['h.where.bell.h', 'h.where.bell.more', 'faq.bellInbox.q', 'faq.bellInbox.a']) {
    expect({ key, webNamesTheBell: /\bbell\b/.test(web[key]!) }).toEqual({ key, webNamesTheBell: true });
    expect({ key, termNamesTheBell: /\bbell\b/i.test(term[key] ?? web[key]!) }).toEqual({ key, termNamesTheBell: false });
  }
  expect(term['faq.bellInbox.a']).toBe(web['faq.bellInbox.a']!.replace('The number on the bell counts', 'The number beside Notifications in the sidebar counts'));
});

test('the local-data check names this device', () => {
  const web = webOf(ACCOUNT), term = TERM_WORDS[ACCOUNT]!;
  for (const key of ['w.check.databases', 'w.check.caches']) {
    const w = web[key]!;
    expect({ key, webNamesTheBrowser: w.split("this browser's").length === 2 }).toEqual({ key, webNamesTheBrowser: true });
    expect({ key, term: term[key] }).toEqual({ key, term: w.replace("this browser's", "this device's") });
  }
  expect(term['w.check.storage']).toBe("this device's storage");
});

test('Remove all local data never says it signs the person out: it leaves the Hub, and hoody logout signs out', () => {
  const web = webOf(ACCOUNT), term = TERM_WORDS[ACCOUNT]!;
  const SIGNS_OUT = /\bsigns? you out\b|\bsign(s|ed|ing)?[ -]out\b/i;
  // Every sentence of the removal that a terminal draws: the row's help, the confirm's body, button and running-work
  // lines, the refusal when a leave is already under way, and the FAQ answer.
  const KEYS = ['w.help', 'w.bodyShort', 'w.confirm', 'w.failed', 'w.running_one', 'w.running_other', 'faq.removeLocal.a'];
  for (const key of KEYS) {
    // The web sentence does say it (so a web rewording is looked at again) ...
    expect({ key, webSaysSignOut: SIGNS_OUT.test(web[key]!) }).toEqual({ key, webSaysSignOut: true });
    // ... and the terminal's names leaving the Hub, and signing out only as what `hoody logout` does.
    const t = term[key]!;
    expect({ key, has: typeof t }).toEqual({ key, has: 'string' });
    expect({ key, namesLeaving: /\b[Ll]eav(e|es|ing) the Hub\b/.test(t) }).toEqual({ key, namesLeaving: true });
    const claims = t.split(/(?<=[.:])\s+/).filter((part) => SIGNS_OUT.test(part) && !/hoody logout|does not sign you out/.test(part));
    expect({ key, claims }).toEqual({ key, claims: [] });
  }
  // The three that describe the removal say outright that the person stays signed in, and how to sign out.
  for (const key of ['w.help', 'w.bodyShort', 'faq.removeLocal.a']) {
    expect({ key, saysHow: term[key]!.includes('run hoody logout') }).toEqual({ key, saysHow: true });
    expect({ key, saysStays: /You stay signed in|does not sign you out/.test(term[key]!) }).toEqual({ key, saysStays: true });
  }
  expect(term['w.confirm']).toBe('Remove and leave the Hub');
  expect(web['w.confirm']).toBe('Remove and sign out');
  expect(term['w.failed']).toBe('Leaving the Hub may already be under way. Try again.');
  // What stops and what may have gone through is the web's; only the action that stops it has the terminal's name.
  for (const key of ['w.running_one', 'w.running_other']) {
    expect(web[key]!.split('Signing out stops').length).toBe(2);
    expect(term[key]).toBe(web[key]!.replace('from this tab', 'from this Hub').replace('Signing out stops', 'Leaving the Hub stops'));
  }
  // What stays is still said, as on the web.
  expect(term['w.bodyShort']).toContain('Your account, your computers and your data on the server stay as they are.');
  expect(term['faq.removeLocal.a']).toContain('so do your account, your computers and your data on the server');
});

test('no sentence a terminal draws says to sign in again without leaving the Hub first', () => {
  const account = webOf(ACCOUNT), term = TERM_WORDS[ACCOUNT]!;
  // The password sheet's check line and the FAQ's last sentence, beside the "Leave the Hub" button.
  expect(account['check.checkLinePw']!.split('Signing in again shows').length).toBe(2);
  expect(term['check.checkLinePw']).toBe(account['check.checkLinePw']!.replace('Signing in again shows', 'Signing in after you leave the Hub shows'));
  expect(account['faq.checkAgain.a']!.split('signing in again shows').length).toBe(2);
  expect(term['faq.checkAgain.a']).toBe(account['faq.checkAgain.a']!.replace('signing in again shows', 'signing in after you leave the Hub shows'));
  // A 401 on a page (a shared-access session; an account session's ends the Hub instead): no button stands beside
  // these, so they say the whole way on.
  const KEYS = 'pages/keys/strings.en.json', STATES = 'kit/states/strings.en.json';
  expect(webOf(KEYS)['ssh.read.signin.body']).toBe("Sign in again to see this computer's SSH key.");
  expect(TERM_WORDS[KEYS]!['ssh.read.signin.body']).toBe("Leave the Hub, run hoody login, then run hoody hub again to see this computer's SSH key.");
  const states = webOf(STATES);
  expect(states['err.signedOut']).toBe('Your sign-in ended. Sign in again.');
  expect(states['err.tokenSession']).toBe("Signed in with an access token, the Hub can't do this. Sign in with your account.");
  expect(TERM_WORDS[STATES]!['err.signedOut']).toBe('Your sign-in ended. Leave the Hub, run hoody login, then run hoody hub again.');
  expect(TERM_WORDS[STATES]!['err.tokenSession']).toBe("Signed in with an access token, the Hub can't do this. Leave the Hub, run hoody login with your account, then run hoody hub again.");
  // The kit's state words are a table the terminal app rewrites (they were not): the registered table is the very
  // object the kit's components read, so the app's one apply puts the terminal's sentences where they are drawn.
  expect(Object.keys(TERM_WORD_TABLES)).toContain(STATES);
  expect(TERM_WORD_TABLES[STATES]).toBe(kitStates as Record<string, string>);
  for (const [name, key] of [[ACCOUNT, 'check.checkLinePw'], [ACCOUNT, 'faq.checkAgain.a'], [KEYS, 'ssh.read.signin.body'], [STATES, 'err.signedOut'], [STATES, 'err.tokenSession']] as const) {
    expect({ key, namesLeave: /\b[Ll]eave the Hub\b/.test(TERM_WORDS[name]![key]!) }).toEqual({ key, namesLeave: true });
  }
});

test('unsaved work is lost by leaving the Hub: a terminal has no sign-out to lose it by', () => {
  const AGENTS = 'pages/ai/agents/strings.en.json', INSTRUCTIONS = 'pages/ai/knowledge/instructions/strings.en.json';
  const agents = webOf(AGENTS), instructions = webOf(INSTRUCTIONS);
  expect(agents['held.loss']!.endsWith('or sign out.')).toBe(true);
  expect(TERM_WORDS[AGENTS]!['held.loss']).toBe(agents['held.loss']!.replace('or sign out.', 'or leave the Hub.'));
  for (const key of ['held.loss_one', 'held.loss_other']) {
    expect({ key, web: instructions[key]!.endsWith('if you sign out.') }).toEqual({ key, web: true });
    expect({ key, term: TERM_WORDS[INSTRUCTIONS]![key] }).toEqual({ key, term: instructions[key]!.replace('if you sign out.', 'if you leave the Hub.') });
  }
  expect(instructions['leave.body']!.endsWith('A reload or sign-out loses them.')).toBe(true);
  expect(TERM_WORDS[INSTRUCTIONS]!['leave.body']).toBe(instructions['leave.body']!.replace('A reload or sign-out loses them.', 'Leaving the Hub loses them.'));
});
