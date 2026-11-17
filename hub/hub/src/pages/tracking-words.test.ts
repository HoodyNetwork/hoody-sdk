import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// A change that may have gone through is let go with one word, "Stop tracking". Every control, dialog and
// body about letting such a change go says so; none says forget, dismiss, abandon, stop watching or stop waiting.
// Two checks, no key-shape rules. (1) The old words: every strings file of the Hub is read (a
// pages-root test may not import other pages: hub/page-boundaries), so a new text with them fails here unlisted; KEEP
// names, with its reason, each text that keeps such a word because it is not about tracking. (2) TRACKING_CONTROLS is
// the explicit list of every tracking control, confirm and dialog title: each must exist, start with "Stop tracking"
// and never be KEEP. A NEW TRACKING CONTROL OR TITLE IS ADDED TO TRACKING_CONTROLS WHEN IT IS WRITTEN. (3) Every text
// that starts with "Stop tracking" is in TRACKING_CONTROLS or STOP_TRACKING_BODIES, so a control written by copying an
// existing one cannot stay off the list (and so cannot later be reworded away unnoticed).
const SRC = join(__dirname, '..');
// No strings file is skipped: every one is read.
const SKIP_FILES = new Set<string>();

const KEEP: Record<string, string> = {
  'ask/strings.en.json ask.dismiss': 'closes a composer note',
  'kit/agent/Conversation.strings.en.json agent.shot.dismiss': 'closes a composer note (a screenshot that was not attached)',
  'kit/forms/forms.strings.en.json outcome.dismiss': 'closes a form note',
  'kit/strings.en.json toast.dismiss': 'closes a toast',
  'kit/gallery/kit2.strings.en.json text.forget': 'gallery sample word',
  'kit/gallery/kit2.strings.en.json toast.okTitle': 'gallery sample toast',
  'kit/gallery/toasts.strings.en.json ok.title': 'gallery sample toast',
  'pages/account/strings.en.json faq.lockScope.a': 'names the lock screen action Forget this browser',
  'pages/account/strings.en.json faq.removeLocal.a': 'clearing this browser forgets its data',
  'pages/account/strings.en.json lock.err.noVerifier': 'names the lock screen action Forget this browser',
  'pages/account/strings.en.json err.noPassword': 'names the sign-in page link Forgot password?',
  'pages/account/strings.en.json w.bodyShort': 'clearing this browser forgets its data',
  'pages/ai/auto/workflows/Source.strings.en.json danger.dismiss': 'closes a refusal note',
  'pages/ai/knowledge/memory/Memory.strings.en.json f.forget': 'memory retention setting',
  'pages/ai/knowledge/memory/Memory.strings.en.json edit.forget': 'memory retention setting (the edit form Forget field)',
  'pages/ai/knowledge/memory/Memory.strings.en.json edit.forget.keep': 'memory retention setting (the date a memory is forgotten)',
  'pages/ai/knowledge/memory/Memory.strings.en.json edit.heldExpiry': 'memory retention setting (a held edit forget date)',
  'pages/ai/knowledge/memory/Memory.strings.en.json edit.heldExpiryNew': 'memory retention setting (names the Forgotten after field)',
  'pages/ai/knowledge/memory/Memory.strings.en.json create.heldExpiry': 'memory retention setting (a held new memory set to be forgotten)',
  'pages/ai/parts/Conversation.strings.en.json conv.att.dismiss': 'closes a composer note',
  'pages/billing/strings.en.json dismiss': 'closes a resolved or payment-return note',
  'pages/board/strings.en.json notice.dismiss': 'closes a Board notice',
  'pages/bots/strings.en.json conv.forget.what': 'clears a Bot conversation',
  'pages/bots/strings.en.json archive.desc': 'names the Forget action (clears a Bot conversation)',
  'pages/bots/strings.en.json archive.emptyBody': 'names the Forget action (clears a Bot conversation)',
  'pages/bots/strings.en.json chan.removeBody': 'a Bot forgets a channel',
  'pages/bots/strings.en.json chan.chat.forget': 'a Bot forgets a chat',
  'pages/bots/strings.en.json chan.chat.forgetTitle': 'a Bot forgets a chat',
  'pages/bots/strings.en.json chan.chat.forgetBody': 'a Bot forgets a chat',
  'pages/bots/strings.en.json chan.chat.forgetGo': 'a Bot forgets a chat',
  'pages/files/storage/strings.en.json remove.body': 'a computer forgets storage keys',
  'pages/files/Upload.strings.en.json dismiss': 'closes an upload note',
  'pages/programs/strings.en.json op.dismiss': 'closes a failed-row note',
  'pages/programs/strings.en.json op.dismissName': 'closes a failed-row note',
  'pages/schedules/strings.en.json op.dismiss': 'closes a note',
  'pages/scripts/strings.en.json outcome.dismiss': 'closes a note',
  'shell/strings.en.json hint.dismiss': 'closes a tip',
  'shell/strings.en.json lock.forgot.title': 'names the lock screen action Forget this browser',
  'shell/strings.en.json lock.noWebLocks': 'names the lock screen action Forget this browser',
  'shell/strings.en.json lock.screen.forget': 'the lock screen action Forget this browser',
  'shell/strings.en.json lock.screen.forgotAsk': 'asks whether the passcode is forgotten (the lock screen link)',
  'shell/strings.en.json lock.screen.noVerifier': 'names the lock screen action Forget this browser',
  'standalone/strings.en.json forgot.open': 'asks whether the password is forgotten (the sign-in link to Reset your password)',
  'term/shell/strings.en.json lock.store.repair': "names the terminal lock action Forget this terminal's Hub data",
};

const TRACKING_CONTROLS: Record<string, string[]> = {
  'kit/widgets/AskAgent.strings.en.json': ['aa.release', 'aa.releaseTitle', 'aa.releaseGo'],
  'ask/strings.en.json': ['ask.stopTracking'],
  'kit/agent/Conversation.strings.en.json': ['agent.dismissDecision'],
  'kit/agent/states/AgentStates.strings.en.json': ['st.dismiss'],
  'kit/states/strings.en.json': ['outcome.pending.dismissTitle', 'outcome.pending.dismissConfirm', 'err.stopTracking'],
  'kit/strings.en.json': ['held.dismiss', 'held.dismissTitle', 'held.dismissGo'],
  'pages/account/strings.en.json': ['check.startOver', 'mail.stopTitle'],
  'pages/ai/agents/Source.strings.en.json': ['forget.title', 'forget.confirm', 'danger.forget', 'unsure.abandon', 'abandon.title', 'abandon.confirm'],
  'pages/ai/agents/Tools.strings.en.json': ['stop', 'stop.title', 'stop.confirm'],
  'pages/ai/agents/FileSettings.strings.en.json': ['stop', 'stop.title', 'stop.confirm'],
  'pages/ai/auto/loops/Edit.strings.en.json': ['o.forget'],
  'pages/ai/auto/todos/Actions.strings.en.json': ['o.forget'],
  'pages/ai/auto/todos/New.strings.en.json': ['o.forget'],
  'pages/ai/auto/workflows/Source.strings.en.json': ['unsure.abandon', 'abandon.title', 'abandon.confirm', 'danger.forget', 'forget.title', 'forget.confirm'],
  'pages/ai/auto/workflows/New.strings.en.json': ['new.stop', 'new.stop.title', 'new.stop.confirm'],
  // RunForm's text button that lets an unconfirmed run start go (store.forget()).
  'pages/ai/auto/workflows/Run.strings.en.json': ['run.forget'],
  // The run detail's text button that lets an unconfirmed Cancel or Resume go (store.forget()).
  // The same button's confirm dialog: its title and its confirm.
  'pages/ai/auto/workflows/Runs.strings.en.json': ['forget', 'forgetTitle', 'forgetGo'],
  'pages/ai/knowledge/memory/Admin.strings.en.json': ['stop.title', 'stop.confirm'],
  'pages/ai/knowledge/memory/Memory.strings.en.json': ['held.dismiss', 'held.dismissTitle'],
  'pages/ai/parts/ConvMenu.strings.en.json': ['rename.dismiss'],
  'pages/ai/parts/Conversation.strings.en.json': ['conv.send.dismiss'],
  'pages/ai/knowledge/skills/strings.en.json': ['use.dismiss', 'use.dismissTitle'],
  'pages/ai/knowledge/skills/trust.strings.en.json': ['dismiss', 'dismissTitle'],
  'pages/ai/settings/connections/strings.en.json': ['dismiss', 'dismiss.title'],
  'pages/ai/settings/rules/Rules.strings.en.json': ['stop.title', 'stop.confirm'],
  'pages/apps/strings.en.json': ['act.dismiss', 'menu.dismiss', 'dismiss.title', 'dismiss.confirm'],
  'pages/billing/strings.en.json': ['hold.dismiss', 'hold.dismissTitle', 'hold.dismissConfirm', 'top.forget', 'top.forgetTitle', 'top.forgetConfirm'],
  'pages/board/parts/ConvTile.strings.en.json': ['conv.send.dismiss'],
  'shell/strings.en.json': ['rename.stopWaiting'],
  'pages/board/strings.en.json': ['shell.dismiss', 'shell.dismissTitle', 'shell.dismissGo', 'tile.heldDismiss', 'tile.heldDismissTitle', 'picker.notesNew.dismiss', 'picker.notesNew.dismissTitle', 'picker.notesNew.dismissConfirm'],
  'pages/bots/strings.en.json': ['start.dismissTitleNamed', 'start.dismissTitle', 'start.dismissGo'],
  'pages/computers/strings.en.json': ['zero.unknown.dismiss', 'pp.held.dismiss', 'pp.held.dismissTitle', 'pp.held.dismissGo', 'held.dismiss', 'held.dismissTitle', 'held.dismissGo'],
  'pages/computers/parts/AccessDrawer.strings.en.json': ['acc.held.dismiss', 'acc.held.dismissTitle', 'acc.held.dismissGo'],
  'pages/computers/parts/ExitIp.strings.en.json': ['exit.held.dismiss', 'exit.held.dismissTitle', 'exit.held.dismissGo'],
  'pages/computers/parts/Firewall.strings.en.json': ['fw.held.dismiss', 'fw.held.dismissTitle', 'fw.held.dismissGo'],
  'pages/computers/parts/ServerDetail.strings.en.json': ['sd.cmd.stop', 'sd.cmd.stopGo', 'sd.cmd.dismiss.title'],
  'pages/computers/snapshots/strings.en.json': ['held.dismiss', 'held.dismissTitle', 'held.dismissGo'],
  'pages/files/storage/strings.en.json': ['held.dismiss', 'held.dismissTitle', 'held.dismissGo'],
  'pages/files/Upload.strings.en.json': ['stop', 'stopTitle'],
  'pages/files/link/link.strings.en.json': ['stop', 'stopTitle'],
  'pages/home/strings.en.json': ['setup.dismiss.title', 'setup.dismiss.confirm'],
  'pages/notes/strings.en.json': ['new.allowAgain', 'new.allowAgainShort', 'new.allowAgainConfirm'],
  'pages/scripts/strings.en.json': ['force.label', 'force.title', 'force.confirm', 'run.check', 'test.stopTrack', 'test.stopTrackTitle', 'test.stopTrackConfirm'],
  'pages/schedules/strings.en.json': ['ed.stuck.go'],
  'pages/apps/launch/openWith/strings.en.json': ['r.removeHold', 'ow.chooser.removeHoldYes'],
  'kit/pickers/ProviderSetup.strings.en.json': ['key.typeAgain', 'key.typeAgainTitle', 'key.typeAgainGo'],
  'pages/ai/strings.en.json': ['key.typeAgain', 'key.typeAgainTitle', 'key.typeAgainGo', 'ep.allowAgain', 'ep.allowAgainShort', 'ep.allowAgainConfirm', 'def.stop.title', 'def.stop.confirm', 'dis.stop'],
  'pages/ai/agents/strings.en.json': ['model.stop', 'model.stop.title', 'model.stop.confirm'],
  'pages/keys/strings.en.json': ['dismiss.act', 'dismiss.title', 'dismiss.go'],
  'pages/notifications/strings.en.json': ['forgetAll.button', 'forgetAll.title', 'forgetAll.confirm', 'forgetOne.button', 'forgetOne.title', 'forgetOne.confirm'],
  'pages/programs/strings.en.json': ['op.dismissTitle', 'op.dismissGo'],
  'pages/programs/sandbox/strings.en.json': ['sb.out.dismissT', 'sb.out.dismissOk', 'np.dismiss', 'np.dismissT', 'np.dismissGo'],
  'pages/realms/strings.en.json': ['items.dismissHeld', 'dismiss.title', 'dismiss.go'],
  'pages/vault/strings.en.json': ['hold.dismissTitle', 'hold.dismissConfirm'],
  'pages/ai/folders/pulls.strings.en.json': ['dismiss', 'dismiss.title'],
  'pages/ai/folders/strings.en.json': ['write.pushAgain.title'],
  'pages/ai/knowledge/instructions/strings.en.json': ['unsure.abandon', 'abandon.title', 'abandon.confirm'],
  'pages/ai/settings/connections/Mcp.strings.en.json': ['held.stopTitle', 'held.stopConfirm'],
  'pages/ai/settings/rules/Hooks.strings.en.json': ['stop.title', 'stop.confirm'],
  'pages/files/Archive.strings.en.json': ['held.stop', 'held.stopTitle'],
  'pages/files/Transfer.strings.en.json': ['held.stop', 'held.stopTitle'],
  'pages/ai/new/NewChat.strings.en.json': ['start.untrack'],
};

/** Texts that start with "Stop tracking" but are a body or a line explaining it, not a control or title. */
const STOP_TRACKING_BODIES = new Set([
  'kit/states/strings.en.json outcome.pending.dismissBody',
  'kit/strings.en.json held.dismissBody',
  'kit/gallery/strings.en.json outcome.linesStop',
  'pages/account/strings.en.json check.stopLine',
  'pages/account/strings.en.json check.dismissWarn',
  'pages/ai/auto/workflows/Runs.strings.en.json forgetBody',
  'kit/pickers/ProviderSetup.strings.en.json key.stopWarn',
  'pages/ai/strings.en.json dis.stopWarn',
  'pages/ai/folders/pulls.strings.en.json unknown.stop',
  'pages/ai/folders/strings.en.json write.stopLine',
  'pages/board/strings.en.json shell.dismissBody',
  'pages/board/strings.en.json tile.heldDismissBody',
  'pages/bots/strings.en.json say.maybeStop',
  'pages/computers/strings.en.json pp.held.dismissBody',
  'pages/computers/strings.en.json held.dismissBody',
  'pages/computers/parts/AccessDrawer.strings.en.json acc.held.dismissBody',
  'pages/computers/snapshots/strings.en.json held.dismissBody',
  'pages/files/storage/strings.en.json held.dismissBody',
  'pages/keys/strings.en.json dismiss.body',
  'pages/keys/strings.en.json dismiss.bodyMint',
  'pages/keys/strings.en.json dismiss.bodyShare',
  'pages/scripts/strings.en.json heldWrite.stop',
  'pages/support/strings.en.json send.stopLine',
]);

const OLD = /\bforg[eo]t\w*|\bdismiss\w*|\babandon\w*|\bstop watching\b|\bstop waiting\b/i;
type Strings = Record<string, unknown>;
const read = (file: string) => JSON.parse(readFileSync(join(SRC, file), 'utf8')) as Strings;

/** Each text with an old word that KEEP does not name. */
function oldWords(file: string, strings: Strings): string[] {
  return Object.entries(strings)
    .filter(([key, value]) => typeof value === 'string' && !KEEP[`${file} ${key}`] && OLD.test(value))
    .map(([key, value]) => `${file} ${key}: ${String(value)}`);
}

/** Each listed tracking control that is KEEP, missing, or does not start with "Stop tracking". */
function controlsWrong(file: string, strings: Strings): string[] {
  return (TRACKING_CONTROLS[file] ?? []).flatMap((key) => {
    if (KEEP[`${file} ${key}`]) return [`${file} ${key}: a tracking control is never KEEP`];
    const value = strings[key];
    return typeof value === 'string' && value.startsWith('Stop tracking') ? [] : [`${file} ${key}: control says ${JSON.stringify(value)}`];
  });
}

/** Each text starting with "Stop tracking" that neither TRACKING_CONTROLS nor STOP_TRACKING_BODIES names. */
function unlisted(file: string, strings: Strings): string[] {
  return Object.entries(strings)
    .filter(([, value]) => typeof value === 'string' && value.startsWith('Stop tracking'))
    .filter(([key]) => !TRACKING_CONTROLS[file]?.includes(key) && !STOP_TRACKING_BODIES.has(`${file} ${key}`))
    .map(([key, value]) => `${file} ${key}: ${String(value)}`);
}

const files = (readdirSync(SRC, { recursive: true }) as string[])
  .map((f) => f.split('\\').join('/'))
  .filter((f) => f.endsWith('strings.en.json') && !SKIP_FILES.has(f))
  .sort();

describe('letting an unconfirmed change go says Stop tracking', () => {
  it('reads the Hub strings files', () => {
    expect(files).toContain('kit/states/strings.en.json');
    expect(files).toContain('pages/vault/strings.en.json');
    expect(files.length).toBeGreaterThan(40);
  });

  it('no text outside KEEP says forget, dismiss, abandon, stop watching or stop waiting', () => {
    expect(files.flatMap((f) => oldWords(f, read(f)))).toEqual([]);
  });

  it('every listed tracking control exists, is not KEEP, and says Stop tracking', () => {
    expect(Object.keys(TRACKING_CONTROLS).filter((f) => !files.includes(f))).toEqual([]);
    expect(Object.keys(TRACKING_CONTROLS).flatMap((f) => controlsWrong(f, read(f)))).toEqual([]);
  });

  it('every text that starts with Stop tracking is a listed control or a listed body', () => {
    expect(files.flatMap((f) => unlisted(f, read(f)))).toEqual([]);
  });

  it('every STOP_TRACKING_BODIES entry still starts with Stop tracking and is not also a control', () => {
    const wrong = [...STOP_TRACKING_BODIES].filter((id) => {
      const [file, key] = id.split(' ') as [string, string];
      const value = read(file)[key];
      return typeof value !== 'string' || !value.startsWith('Stop tracking') || TRACKING_CONTROLS[file]?.includes(key);
    });
    expect(wrong).toEqual([]);
  });

  it('catches a Stop tracking text that nobody listed', () => {
    expect(unlisted('pages/x/strings.en.json', { 'held.stop': 'Stop tracking' })).toHaveLength(1);
    expect(unlisted('pages/keys/strings.en.json', { 'dismiss.body': 'Stop tracking only if…', 'dismiss.go': 'Stop tracking' })).toEqual([]);
    expect(unlisted('pages/x/strings.en.json', { 'held.body': 'If you stop tracking it, it may still go through.' })).toEqual([]);
  });

  it('every KEEP entry still names a text with such a word (a stale entry would hide a later one)', () => {
    const stale = Object.keys(KEEP).filter((id) => {
      const [file, key] = id.split(' ') as [string, string];
      const value = read(file)[key];
      return typeof value !== 'string' || !OLD.test(value);
    });
    expect(stale).toEqual([]);
  });

  it('catches a body with the old words even when nobody listed it', () => {
    expect(oldWords('pages/x/strings.en.json', { 'held.body': 'It may have gone through. If you stop tracking it, the Hub forgets it.' })).toHaveLength(1);
    expect(oldWords('pages/x/strings.en.json', { 'held.body': 'Stop waiting to edit it.' })).toHaveLength(1);
    expect(oldWords('pages/x/strings.en.json', { 'held.body': 'The Hub stops following it.' })).toEqual([]);
  });

  it('a listed control set to other words fails: every control in the listed tables', () => {
    for (const [file, key] of [
      ['pages/files/Upload.strings.en.json', 'stop'], ['pages/files/Upload.strings.en.json', 'stopTitle'],
      ['pages/files/link/link.strings.en.json', 'stop'], ['pages/files/link/link.strings.en.json', 'stopTitle'],
      ['pages/keys/strings.en.json', 'dismiss.act'], ['pages/programs/sandbox/strings.en.json', 'sb.out.dismissT'],
      ['pages/programs/sandbox/strings.en.json', 'sb.out.dismissOk'], ['pages/programs/sandbox/strings.en.json', 'np.dismissT'],
      ['pages/realms/strings.en.json', 'items.dismissHeld'], ['pages/board/strings.en.json', 'tile.heldDismiss'],
      ['pages/board/strings.en.json', 'tile.heldDismissTitle'], ['pages/bots/strings.en.json', 'start.dismissTitleNamed'],
      ['pages/ai/agents/Tools.strings.en.json', 'stop'], ['pages/computers/parts/ServerDetail.strings.en.json', 'sd.cmd.stopGo'],
      ['kit/agent/Conversation.strings.en.json', 'agent.dismissDecision'], ['pages/vault/strings.en.json', 'hold.dismissConfirm'],
      // The listed controls one and two.
      ['pages/scripts/strings.en.json', 'force.label'], ['pages/scripts/strings.en.json', 'force.title'],
      ['pages/scripts/strings.en.json', 'force.confirm'], ['pages/scripts/strings.en.json', 'run.check'],
      ['pages/schedules/strings.en.json', 'ed.stuck.go'], ['pages/ai/strings.en.json', 'key.typeAgain'],
      ['pages/ai/strings.en.json', 'ep.allowAgain'], ['pages/ai/strings.en.json', 'ep.allowAgainConfirm'],
      ['pages/notes/strings.en.json', 'new.allowAgain'], ['pages/notes/strings.en.json', 'new.allowAgainConfirm'],
      ['kit/widgets/AskAgent.strings.en.json', 'aa.release'], ['kit/widgets/AskAgent.strings.en.json', 'aa.releaseTitle'],
      ['kit/widgets/AskAgent.strings.en.json', 'aa.releaseGo'], ['pages/apps/launch/openWith/strings.en.json', 'r.removeHold'],
      ['pages/apps/launch/openWith/strings.en.json', 'ow.chooser.removeHoldYes'], ['kit/pickers/ProviderSetup.strings.en.json', 'key.typeAgain'],
      ['pages/scripts/strings.en.json', 'test.stopTrack'], ['pages/scripts/strings.en.json', 'test.stopTrackTitle'],
      ['pages/scripts/strings.en.json', 'test.stopTrackConfirm'],
    ] as const) {
      expect([file, key, TRACKING_CONTROLS[file]?.includes(key)]).toEqual([file, key, true]);
      expect(controlsWrong(file, { ...read(file), [key]: 'Close this warning and try again' })).toHaveLength(1);
    }
  });
});
