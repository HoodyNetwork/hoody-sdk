// Named screenshot states of the account page (`bun run hub:shots --page account`).
import type { Shots } from '@app/shots.types';

const chars = (text: string) => [...text];
const NEW = 'Newpass1234!x';
/** current, new, again, then Enter. */
const PASSWORD_FORM = [...chars('a'), 'Tab', ...chars(NEW), 'Tab', ...chars(NEW), 'Enter'];
const PW_AND_CODE = [...chars('pw'), 'Tab', ...chars('123456'), 'Enter'];
/** Passcode lock: a passcode typed twice, then Enter. waitForText is checked before the keys, so these wait for
 *  the open set sheet and their acts wait for the state they are named after. */
const LOCK = '482913';
const LOCK_SET = [...chars(LOCK), 'Tab', ...chars(LOCK), 'Enter'];
const LOCK_ON = [{ waitFor: 'Passcode set. The Hub now locks on this browser.' }] as const;

export default [
  { name: 'overview', waitForText: 'goes through support' },
  // A ?section= deep link opens at its section on purpose (web scrolls there too): `scrolled` tells the terminal page gate.
  { name: 'sessions-active', path: '?section=sessions', waitForText: 'Firefox on Linux', scrolled: true },
  // This browser's address at the head of the sessions block, and its failed read.
  { name: 'sessions-ip-error', path: '?section=sessions', state: 'ip-error', waitForText: "Couldn't read this browser's address", scrolled: true },
  { name: 'sessions-search', path: '?section=sessions&q=firefox', waitForText: 'Firefox on Linux', scrolled: true },
  { name: 'agent-signin', path: '?section=agent-sign-in', waitForText: 'Agent sign-in', scrolled: true },
  // Performance mode in This browser, off and then turned on (switch, toast). The account menu's item is
  // in kit/perf.spec.ts: phones have no account menu, so it has no shot here.
  { name: 'perf-row', path: '?section=browser', waitForText: 'Performance mode', scrolled: true },
  { name: 'perf-on', path: '?section=browser', act: [{ click: 'role=switch[name="Performance mode"] >> xpath=ancestor::label[1]' }, { waitFor: 'text=Performance mode on' }], waitForText: 'Performance mode', scrolled: true },
  { name: 'twofa-off', path: '?section=two-step', state: 'twofa-off', waitForText: 'A password alone signs in', scrolled: true },
  // The security checklist's Turn on (SecuritySummary onOpen('setup'), the first Turn on on the page; the two-step
  // section's own comes later) opens the setup sheet on its first step: the checklist's page proof (scenarios.md).
  { name: 'twofa-turn-on', state: 'twofa-off', waitForText: 'A password alone signs in', act: [{ click: 'role=button[name="Turn on"] >> nth=0' }, { waitFor: 'text=Step 1 of 2' }] },
  { name: 'twofa-unfinished', path: '?section=two-step', state: 'twofa-unfinished', waitForText: 'Setup not finished', scrolled: true },
  { name: 'twofa-low-codes', path: '?section=two-step', state: 'twofa-low', waitForText: 'Backup codes left: 2', scrolled: true },
  { name: 'twofa-unreadable', path: '?section=two-step', state: 'twofa-unreadable', waitForText: 'Couldn', scrolled: true },
  { name: 'twofa-off-pending', state: 'twofa-pending', path: '?sheet=off', keys: PW_AND_CODE, waitForText: 'Turn off two-step sign-in?' },
  {
    name: 'twofa-pending-section',
    state: 'twofa-pending',
    path: '?sheet=off&section=two-step',
    scrolled: true,
    keys: PW_AND_CODE,
    act: [{ waitFor: 'Check again' }, { click: 'role=button[name="Close"] >> nth=-1' }],
    waitForText: 'Turn off two-step sign-in?',
  },
  { name: 'unverified-email', state: 'unverified', waitForText: 'Not verified' },
  { name: 'sessions-ended', path: '?state=ended&section=sessions', waitForText: 'Safari on iPhone', scrolled: true },
  { name: 'sessions-empty', path: '?state=ended&section=sessions', state: 'sessions-empty', waitForText: 'No ended sessions', scrolled: true },
  { name: 'end-session-confirm', path: '?end=5e55c0ffee00000000000001', waitForText: 'End this session?' },
  { name: 'end-others-confirm', path: '?end=others', waitForText: 'End all other sessions?' },
  { name: 'password-drawer', path: '?sheet=password', waitForText: 'New password again' },
  { name: 'password-wrong', state: 'pw-wrong', path: '?sheet=password', keys: PASSWORD_FORM, waitForText: 'New password again' },
  { name: 'password-rate', state: 'pw-rate', path: '?sheet=password', keys: PASSWORD_FORM, waitForText: 'New password again' },
  { name: 'password-pending', state: 'pw-pending', path: '?sheet=password', keys: PASSWORD_FORM, waitForText: 'New password again' },
  { name: 'password-changed', path: '?sheet=password', keys: PASSWORD_FORM, waitForText: 'New password again' },
  // Set up opens only while two-step sign-in is off (logic.ts openableSheet).
  { name: 'setup-step1', path: '?sheet=setup', state: 'twofa-off', waitForText: 'Step 1 of 2' },
  { name: 'setup-step2', path: '?sheet=setup', state: 'twofa-off', keys: [...chars('pw'), 'Enter'], waitForText: 'Step 1 of 2' },
  { name: 'new-codes-drawer', path: '?sheet=codes', waitForText: 'Make new codes' },
  { name: 'new-codes-result', path: '?sheet=codes', keys: PW_AND_CODE, waitForText: 'Make new codes' },
  { name: 'turn-off-drawer', path: '?sheet=off', waitForText: 'Turn off two-step sign-in?' },
  { name: 'name-drawer', path: '?sheet=name', waitForText: 'Save name' },
  { name: 'name-empty', path: '?sheet=name', keys: ['Control+a', 'Backspace', 'Enter'], waitForText: 'Save name' },
  { name: 'name-pending', state: 'rename-pending', path: '?sheet=name', keys: [...chars(' L.'), 'Enter'], waitForText: 'Save name' },
  { name: 'name-saved', path: '?sheet=name', keys: [...chars(' L.'), 'Enter'], waitForText: 'Save name' },
  { name: 'history-signins', path: '?section=history', waitForText: 'Security history', scrolled: true },
  { name: 'history-everything', path: '?section=history&history=all', waitForText: 'Sign-in refused', scrolled: true },
  { name: 'history-empty', path: '?section=history', state: 'history-empty', waitForText: 'Nothing recorded yet', scrolled: true },
  { name: 'history-error', path: '?section=history', state: 'history-error', waitForText: 'Security history', scrolled: true },
  { name: 'ssh-keys', path: '?section=ssh', waitForText: 'ada@laptop', scrolled: true },
  { name: 'ssh-keys-partial', path: '?section=ssh', state: 'keys-partial', waitForText: 'Only the first 100 computers', scrolled: true },
  { name: 'ssh-keys-error', path: '?section=ssh', state: 'keys-error', waitForText: 'SSH keys', scrolled: true },
  { name: 'wipe-row', path: '?section=browser', waitForText: 'Remove all local data', scrolled: true },
  // The confirm is named by what both the web and a terminal draw: its "What this removes" link, and a button whose
  // name starts "Remove and" (the web's ends "sign out"; a terminal's ends "leave the Hub", since it signs nobody out).
  { name: 'wipe-confirm', path: '?sheet=wipe', waitForText: 'What this removes' },
  { name: 'wipe-items-ticked', path: '?sheet=wipe', state: 'wipe-items', waitForText: '2 changes from Computers', click: 'text=I understand that the Hub stops tracking' },
  { name: 'wipe-tabs', path: '?sheet=wipe', state: 'wipe-tabs', waitForText: 'What this removes', act: [{ click: 'role=button[name=/^Remove and /]' }, { waitFor: 'Nothing was removed' }] },
  { name: 'wipe-unchecked', path: '?sheet=wipe', state: 'wipe-unchecked', waitForText: 'What this removes', act: [{ click: 'role=button[name=/^Remove and /]' }, { waitFor: 'The Hub could not check' }] },
  { name: 'wipe-payments', path: '?sheet=wipe', state: 'wipe-payments', waitForText: 'Check it in Billing first' },
  { name: 'suspended', state: 'suspended', waitForText: 'Your account is suspended' },
  { name: 'passcode-off', path: '?section=passcode', waitForText: 'Lock the Hub on this browser with a passcode.', scrolled: true },
  { name: 'passcode-set-sheet', path: '?sheet=lock-set', waitForText: 'Type it again', extra: ['390-dark'] },
  { name: 'passcode-set-mismatch', path: '?sheet=lock-set', keys: [...chars(LOCK), 'Tab', ...chars('730215'), 'Enter'], act: [{ waitFor: "The two passcodes don't match." }], waitForText: 'Type it again' },
  { name: 'passcode-on', path: '?sheet=lock-set&section=passcode', keys: LOCK_SET, act: [...LOCK_ON, { click: 'css=[data-nav="passcode"]' }, { waitFor: 'What this protects' }], waitForText: 'Type it again', extra: ['390-dark'], scrolled: true },
  {
    name: 'passcode-change-wrong',
    path: '?sheet=lock-set&section=passcode',
    scrolled: true,
    keys: LOCK_SET,
    act: [...LOCK_ON, { click: 'css=[data-section="passcode"] >> role=button[name="Change"]' }, { fill: 'Enter your current passcode', text: '999999x' }, { click: 'role=dialog >> role=button[name="Save"]' }, { waitFor: 'Wrong passcode.' }],
    waitForText: 'Type it again',
  },
  {
    name: 'passcode-change-retry',
    path: '?sheet=lock-set&section=passcode',
    scrolled: true,
    keys: LOCK_SET,
    act: [
      ...LOCK_ON,
      { click: 'css=[data-section="passcode"] >> role=button[name="Change"]' },
      { fill: 'Enter your current passcode', text: '999999x' },
      { fill: 'New passcode (optional)', text: '730215' },
      { fill: 'Type it again', text: '730215' },
      { click: 'role=dialog >> role=button[name="Save"]' },
      { waitFor: "Your new passcode wasn't saved. Type it again, or keep your current passcode." },
    ],
    waitForText: 'Type it again',
  },
  {
    name: 'passcode-remove-sheet',
    path: '?sheet=lock-set&section=passcode',
    scrolled: true,
    keys: LOCK_SET,
    act: [...LOCK_ON, { click: 'css=[data-section="passcode"] >> role=button[name="Remove"]' }, { waitFor: 'The Hub stops locking on this browser.' }],
    waitForText: 'Type it again',
  },
  // An account with no password (a GitHub or Google sign-up, for one): the row offers the mail whose link sets one, then says where
  // to look (no second mail), or the wait when there were too many asks. The email drawer says the same up front.
  { name: 'no-password', path: '?section=password', state: 'no-password', waitForText: 'No password is set', scrolled: true, extra: ['390-dark'] },
  {
    name: 'no-password-sent',
    path: '?section=password',
    state: 'no-password',
    scrolled: true,
    act: [{ click: 'css=[data-section="password"] >> role=button[name="Set a password"]' }, { waitFor: 'text=Check your inbox' }],
    waitForText: 'No password is set',
    extra: ['390-dark'],
  },
  {
    name: 'no-password-rate',
    path: '?section=password',
    state: 'no-password-rate',
    scrolled: true,
    act: [{ click: 'css=[data-section="password"] >> role=button[name="Set a password"]' }, { waitFor: 'text=Too many tries' }],
    waitForText: 'No password is set',
    extra: ['390-dark'],
  },
  { name: 'email-no-password', path: '?sheet=email', state: 'no-password', waitForText: 'Set a password first', extra: ['390-dark'] },
  // An address that is not verified: the email row and the checklist offer the verification mail again, and Change
  // email waits for it.
  { name: 'email-unverified', state: 'email-unverified', waitForText: 'Open the link in the verification email', extra: ['390-dark'] },
  {
    name: 'email-unverified-sent',
    state: 'email-unverified',
    act: [{ click: 'css=[data-section="profile"] >> role=button[name="Resend email"]' }, { waitFor: 'text=for the verification link' }],
    waitForText: 'Open the link in the verification email',
    extra: ['390-dark'],
  },
  {
    name: 'email-unverified-rate',
    state: 'email-unverified-rate',
    act: [{ click: 'css=[data-section="profile"] >> role=button[name="Resend email"]' }, { waitFor: 'text=Too many tries' }],
    waitForText: 'Open the link in the verification email',
    extra: ['390-dark'],
  },
  // Emails: the support reply mail, on, off, and held after an unknown outcome (Check again only).
  { name: 'emails', path: '?section=emails', waitForText: 'Support replies', scrolled: true, extra: ['390-dark'] },
  { name: 'emails-off', path: '?section=emails', state: 'support-mail-off', waitForText: 'Support replies', scrolled: true, extra: ['390-dark'] },
  {
    name: 'emails-pending',
    path: '?section=emails',
    state: 'support-mail-pending',
    scrolled: true,
    act: [{ click: 'role=switch[name="Support replies"] >> xpath=ancestor::label[1]' }, { waitFor: 'text=Check again' }],
    waitForText: 'Support replies',
    extra: ['390-dark'],
  },
  { name: 'loading', state: 'loading' },
  { name: 'load-error', state: 'error', waitForText: "didn't load" },
] satisfies Shots;
