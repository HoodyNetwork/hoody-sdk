// Every showToast / showErrorToast call in pages, ask, shell and the kit keeps the
// toast rules of Toast.tsx's header. Read from the TypeScript AST:
//   - a tone is one of ToastTone's values (read from Toast.tsx, so a new tone needs no edit here);
//   - a tone the guard cannot read (a conditional, a variable, content built elsewhere, a spread that may carry a tone or
//     an action) needs a TONE_REVIEW entry saying why it is right; each readable branch of a conditional is still judged;
//   - an error carries its fix (an action; showErrorToast: `retry`);
//   - an unknown outcome carries a read (an action; showErrorToast: `check` unless `change: false`) and no timeout, since
//     it stays until closed;
//   - an ok, info or warn toast without an Undo needs a QUIET entry saying why its result has no place on screen (inline
//     first: a change the person can see where they made it does not toast unless it can be undone).
// KNOWN lists the known breaks, each with its owner; it only shrinks. Every list entry must still match a call, so a
// fixed or moved call takes its entry with it. Keys are `<file>|<title>`: the title's strings key(s), else its text.
// One entry covers every call with its key; SHARED pins how many calls share one, so a new call with the same title
// is read against the entry it would silently share.
// The kit gallery is left out: it shows samples on purpose (see kit/gallery/toasts.tsx).
import { readdirSync, readFileSync } from 'node:fs';
import { join, sep } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const SRC = join(import.meta.dirname, '../..');

// ── The analyser ──────────────────────────────────────────────────────────────────────────────────────────────

export interface ToastCall {
  /** `<file>|<title>`, the key every list uses. */
  key: string;
  at: string;
  /** Rules this call breaks: `tone:<value>`, `review`, `fix`, `read`, `timeout`, `quiet`. */
  breaks: string[];
}

const unwrap = (e: ts.Expression): ts.Expression => {
  while (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isNonNullExpression(e) || ts.isSatisfiesExpression(e)) e = e.expression;
  return e;
};

/** The strings key(s) or text a title shows: t('k', …) → k; t(c ? 'a' : 'b') → a|b; 'text' → text; else the source. */
function titleOf(e: ts.Expression | undefined, sf: ts.SourceFile): string {
  if (!e) return '(none)';
  const x = unwrap(e);
  if (ts.isStringLiteral(x) || ts.isNoSubstitutionTemplateLiteral(x)) return x.text;
  if (ts.isConditionalExpression(x)) return `${titleOf(x.whenTrue, sf)}|${titleOf(x.whenFalse, sf)}`;
  if (ts.isCallExpression(x) && x.arguments[0]) {
    const a = unwrap(x.arguments[0]);
    if (ts.isStringLiteral(a)) return a.text;
    if (ts.isConditionalExpression(a) && ts.isStringLiteral(unwrap(a.whenTrue)) && ts.isStringLiteral(unwrap(a.whenFalse))) {
      return `${(unwrap(a.whenTrue) as ts.StringLiteral).text}|${(unwrap(a.whenFalse) as ts.StringLiteral).text}`;
    }
  }
  return x.getText(sf).replace(/\s+/g, ' ').slice(0, 100);
}

/** The name a property key spells: `tone`, `'tone'` and `['tone']` alike; null for a computed key it cannot read. */
function keyOf(name: ts.PropertyName): string | null {
  if (ts.isIdentifier(name) || ts.isPrivateIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text;
  if (ts.isNoSubstitutionTemplateLiteral(name)) return name.text;
  if (ts.isComputedPropertyName(name)) {
    const x = unwrap(name.expression);
    if (ts.isStringLiteral(x) || ts.isNoSubstitutionTemplateLiteral(x) || ts.isNumericLiteral(x)) return x.text;
  }
  return null;
}

/** Whether an object has a member the guard cannot read: a key it cannot spell (it may be any name, tone or action
 *  included), or a getter, setter or method (its value is code the guard does not run). */
const unreadKey = (o: ts.ObjectLiteralExpression) => o.properties.some((p) => p.name !== undefined
  && (keyOf(p.name) === null || !(ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p))));

/** A property's value, the last one when a name repeats (as in JavaScript). */
const propOf = (o: ts.ObjectLiteralExpression, name: string): ts.Expression | undefined => {
  let found: ts.Expression | undefined;
  for (const p of o.properties) {
    if (!p.name || keyOf(p.name) !== name) continue;
    if (ts.isPropertyAssignment(p)) found = p.initializer;
    else if (ts.isShorthandPropertyAssignment(p)) found = p.name;
  }
  return found;
};

/** The tones an expression can take: literal strings (both branches of a literal conditional), or null if unreadable. */
function tonesOf(e: ts.Expression | undefined): {
  tones: string[];
  read: boolean;
} {
  if (!e) return { tones: ['ok'], read: true };
  const x = unwrap(e);
  if (ts.isStringLiteral(x) || ts.isNoSubstitutionTemplateLiteral(x)) return { tones: [x.text], read: true };
  if (ts.isConditionalExpression(x)) {
    const a = tonesOf(x.whenTrue);
    const b = tonesOf(x.whenFalse);
    // A conditional is never "read": its branches are judged, and a person says why the condition picks right.
    return { tones: [...a.tones, ...b.tones], read: false };
  }
  return { tones: [], read: false };
}

/** Whether an expression surely gives a value: not `undefined`/`null`/`void`, and every branch of a conditional or
 *  `??` does; `c && x` may give nothing. */
function present(e: ts.Expression | undefined): boolean {
  if (!e) return false;
  const x = unwrap(e);
  if (x.kind === ts.SyntaxKind.NullKeyword || ts.isVoidExpression(x) || (ts.isIdentifier(x) && x.text === 'undefined')) return false;
  if (ts.isConditionalExpression(x)) return present(x.whenTrue) && present(x.whenFalse);
  if (ts.isBinaryExpression(x)) {
    const op = x.operatorToken.kind;
    if (op === ts.SyntaxKind.QuestionQuestionToken || op === ts.SyntaxKind.BarBarToken) return present(x.right);
    if (op === ts.SyntaxKind.AmpersandAmpersandToken) return false;
  }
  return true;
}

/** A spread the guard can read: `...(c ? { … } : {})` or `...(c && { … })` whose objects name no tone or action. Any
 *  other spread (a variable, a member, a call) may carry anything. */
function plainSpread(p: ts.SpreadAssignment): boolean {
  const x = unwrap(p.expression);
  const sides = ts.isConditionalExpression(x)
    ? [x.whenTrue, x.whenFalse]
    : ts.isBinaryExpression(x) && x.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken
      ? [x.right]
      : null;
  if (!sides) return false;
  return sides.every((side) => {
    const o = unwrap(side);
    if (!ts.isObjectLiteralExpression(o)) return false;
    // A getter or method (unreadKey) is code the guard does not run: not plain.
    return !unreadKey(o) && o.properties.every((q) => {
      const key = !ts.isSpreadAssignment(q) && q.name !== undefined ? keyOf(q.name) : null;
      return key !== null && key !== 'tone' && key !== 'action';
    });
  });
}

/** The name `x['showToast']` spells (a string literal index), else null. */
function indexName(e: ts.Expression): string | null {
  if (!ts.isElementAccessExpression(e)) return null;
  const a = unwrap(e.argumentExpression);
  return ts.isStringLiteral(a) || ts.isNoSubstitutionTemplateLiteral(a) ? a.text : null;
}

/** A file's syntax tree, parsed once for the three scans of the same text (none of them changes the tree); a fixture text of the
 *  same name parses anew. */
const parsed = new Map<string, ts.SourceFile>();
function parseOnce(file: string, text: string): ts.SourceFile {
  const had = parsed.get(file);
  if (had && had.text === text) return had;
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  parsed.set(file, sf);
  return sf;
}

/** The names a file calls the toast functions by: their own names, import aliases, `const x = showToast` (also from a
 *  member or a string index), and destructured names (`const { showToast: say } = kit`). */
function toastNames(sf: ts.SourceFile): Map<string, 'showToast' | 'showErrorToast'> {
  const names = new Map<string, 'showToast' | 'showErrorToast'>([
    ['showToast', 'showToast'],
    ['showErrorToast', 'showErrorToast'],
  ]);
  const real = (n: string) => (n === 'showToast' || n === 'showErrorToast' ? n : undefined);
  const visit = (node: ts.Node) => {
    if (ts.isImportSpecifier(node)) {
      const fn = real((node.propertyName ?? node.name).text);
      if (fn) names.set(node.name.text, fn);
    }
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const init = unwrap(node.initializer);
      const idx = indexName(init);
      const fn = ts.isIdentifier(init) ? names.get(init.text) : ts.isPropertyAccessExpression(init) ? real(init.name.text) : idx !== null ? real(idx) : undefined;
      if (fn) names.set(node.name.text, fn);
    }
    if (ts.isBindingElement(node) && ts.isObjectBindingPattern(node.parent) && ts.isIdentifier(node.name)) {
      const prop = node.propertyName;
      const spelled = prop ? keyOf(prop) : node.name.text;
      const fn = spelled !== null ? real(spelled) : undefined;
      if (fn) names.set(node.name.text, fn);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return names;
}

/** Every toast call in one file, judged against the rules above. */
export function toastCalls(file: string, text: string, toneSet: ReadonlySet<string>): ToastCall[] {
  if (!/\bshow(Error)?Toast\b/.test(text)) return [];
  const sf = parseOnce(file, text);
  const out: ToastCall[] = [];
  const lineOf = (n: ts.Node) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
  const names = toastNames(sf);

  const judgeContent = (node: ts.CallExpression, content: ts.Expression | undefined, side: string) => {
    const at = `${file}:${lineOf(node)}${side}`;
    const c = content && unwrap(content);
    // Content chosen by a conditional: each side on its own (a side that is not an object needs review).
    if (c && ts.isConditionalExpression(c)) {
      judgeContent(node, c.whenTrue, `${side}a`);
      judgeContent(node, c.whenFalse, `${side}b`);
      return;
    }
    if (!c || !ts.isObjectLiteralExpression(c)) {
      out.push({ key: `${file}|${titleOf(c, sf)}`, at, breaks: ['review'] });
      return;
    }
    const breaks: string[] = [];
    const { tones, read } = tonesOf(propOf(c, 'tone'));
    const spreads = c.properties.filter(ts.isSpreadAssignment);
    if (!read || unreadKey(c) || !spreads.every((p) => plainSpread(p))) breaks.push('review');
    for (const tone of tones) if (!toneSet.has(tone)) breaks.push(`tone:${tone}`);
    const actionE = propOf(c, 'action');
    const action = present(actionE);
    const timeout = node.arguments.length > 1;
    if (tones.includes('error') && !action) breaks.push('fix');
    if (tones.includes('unknown') && !action) breaks.push('read');
    if ((tones.includes('unknown') || tones.includes('error')) && timeout) breaks.push('timeout');
    const undo = action && actionE !== undefined && /undo/i.test(actionE.getText(sf));
    if (read && tones.every((x) => x === 'ok' || x === 'info' || x === 'warn') && !undo) breaks.push('quiet');
    out.push({ key: `${file}|${titleOf(propOf(c, 'title'), sf)}`, at, breaks });
  };

  const judgeError = (node: ts.CallExpression) => {
    const at = `${file}:${lineOf(node)}`;
    const key = `${file}|${titleOf(node.arguments[0], sf)}`;
    const opts = node.arguments[2] && unwrap(node.arguments[2]);
    if (opts && !ts.isObjectLiteralExpression(opts)) return out.push({ key, at, breaks: ['review'] });
    const breaks: string[] = [];
    const has = (n: string) => !!opts && present(propOf(opts, n));
    const change = opts ? propOf(opts, 'change') : undefined;
    if (!has('retry')) breaks.push('fix');
    if (!(change && change.kind === ts.SyntaxKind.FalseKeyword) && !has('check')) breaks.push('read');
    if (opts && (opts.properties.some(ts.isSpreadAssignment) || unreadKey(opts))) breaks.push('review');
    out.push({ key, at, breaks });
  };

  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node)) {
      const callee = unwrap(node.expression);
      // A bare name (an alias included), or a member call by the toast function's own name, kit.showToast(...) or
      // kit['showToast'](...) (a file's aliases never name another object's members); optional calls (?.) alike.
      const idx = indexName(callee);
      const own = (n: string) => (n === 'showToast' || n === 'showErrorToast' ? n : undefined);
      const fn = ts.isIdentifier(callee) ? names.get(callee.text) : ts.isPropertyAccessExpression(callee) ? own(callee.name.text) : idx !== null ? own(idx) : undefined;
      if (fn === 'showToast') judgeContent(node, node.arguments[0], '');
      else if (fn === 'showErrorToast') judgeError(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

/** ToastTone's values, read from Toast.tsx. */
export function tonesIn(toastSource: string): Set<string> {
  const m = toastSource.match(/export type ToastTone\s*=\s*([^;]+);/);
  return new Set([...(m?.[1] ?? '').matchAll(/'([^']+)'/g)].map((x) => x[1]!));
}

// ── The lists ─────────────────────────────────────────────────────────────────────────────────────────────────

/** Calls whose tone the guard cannot read, each read by hand: why the condition picks the right tone. */
const TONE_REVIEW: Record<string, string> = {
  'pages/ai/models/claude/copyStore.ts|c.toast.title':
    "A copy that may have gone through (pending or unconfirmed): tone literal unknown; the Check again action is spread in only once the copy is 'unknown', and the spread carries nothing else.",
  'pages/board/parts/BoardView.tsx|add.listFailed':
    'A failed read of the computer list (errorInfo outcome failed) is error; one that sent nothing (offline) is info. Both carry Try again.',
  'pages/board/parts/BoardView.tsx|closeText(t, name, r)':
    "closeText's own tone: unknown for NOT_KNOWN (the close may have gone through), with no read: no read possible; the text promises nothing the store can't show (as board.unknown): it says the close may not have finished and to reload to see where the Board is (an empty Board has no Closed Boards entry, and no notice names this Close); info for every other answer, each telling what happened to the live Board and what to do (changed, close again; not done now, try again; no longer on the Boards; not confirmed, reload; too big).",
  'pages/board/parts/BoardView.tsx|said':
    "restoreText's own tone: unknown for NOT_KNOWN (the restore may have gone through), with no read: no read possible; the text promises nothing the store can't show (as board.unknown): the entry stays in Closed Boards (Restore returns before removing it) and the person checks the Boards (no notice names this Restore); info for the rest, each telling what happened and what to do (open with the entry maybe kept, reload; not confirmed; nine Boards; no longer kept; not opened, try again).",
  'kit/agent/ForkPending.tsx|fp.result':
    'A Check that ended a pending fork (nothing made, gone, unconfirmed, not tracked): gone and unconfirmed are warn (the fork cannot be told apart from lost), every other ending is info. None is an error or an unknown outcome: the record is already dropped, so there is nothing to retry or read. A toast because the result has no place on screen: its row leaves with the record, and the band or list that held the row may be gone too.',
  'kit/forms/Outcome.pure.ts|outcome.toastTitleOf|outcome.toastTitle':
    "A form's pending outcome that outlived its place: tone literal unknown; a spread adds Check again when the form has a read and Details when it has facts.",
};

/** The known breaks, each with its owner and where it is tracked. `<rule>:<file>|<title>`. Only shrinks. */
const KNOWN: Record<string, string> = {
  'read:pages/ai/models/claude/copyStore.ts|c.toast.title':
    "The read is Check again, spread in once the copy is 'unknown'. While it is 'out' a read cannot safely settle it, since the apply may still write afterward (eligibleOf / settleCopies in transfer.ts; copyStore.check refuses an 'out' copy), so no action is offered.",
  'fix:pages/board/broadcast/Broadcast.tsx|link.removalFailed':
    'The fix is in the body; a button needs a navigation a press may make from a hidden page (kit/shell).',
  'read:pages/board/broadcast/Broadcast.tsx|link.removalUnknown':
    'Accepted, no read possible: the page is being left.',
  'read:pages/board/parts/BoardView.tsx|board.unknown':
    'Accepted, no read possible: core has no re-read of a stored value. The outcome may arrive with no notice naming this Board (another tab\'s changed copy is kept silently; the unsaved notice names no Board), and it may land after the toast or in a scope this tab no longer shows (data.ts:575, :580), so the toast promises no notice, no place for the Board and nothing a reload shows: it says only to check the Boards before adding it again.',
  'read:pages/board/parts/ProgramView.tsx|board.unknown':
    'Accepted, no read possible: core has no re-read of a stored value, and no notice need name this Board (as the Board view\'s row). The program view\'s New Board is the Board view\'s New under the same lock, so it says the same: check the Boards before adding it again.',
  'fix:pages/scripts/parts/opcheck.ts|check.failed':
    'The fix is in the body ("send it again here"). The Check ends the place\'s banner and its own send control is live again; a toast cannot resend, since the op keeps lock variables only, never the values. The one place with no send left, the saved-tests step of a script delete (its page closes), says instead that the saved tests were kept and where to remove them: the Test tab of a script made at the same place, since saved tests belong to the script\'s place (check.failedTests).',
  'read:pages/scripts/parts/SettingsTab.tsx|delete.testsHeldOlder':
    'Not this view\'s outcome to read: the saved-tests removal was already held by another view when the script delete ran, so nothing was sent here and there is no operation to check; that view keeps its Check again. Still open: this held-elsewhere toast has no read action.',
  'read:pages/scripts/parts/Building.tsx|build.discardedLostOn|build.discardedLost':
    'Accepted, no read possible: a build discarded with no turn or computer ever recorded has nothing to address; its confirm warned before Discard, and the body says why there is no Check again.',
  'read:pages/scripts/parts/Building.tsx|build.deployUnknownOn|build.deployUnknown':
    'The read is the held row\'s own Check again: this toast answers that row\'s Check, and the row stays held in the list with Check again until a read settles it (the list frees nothing).',
  'read:pages/scripts/parts/Building.tsx|build.deployUnprovenOn|build.deployUnproven':
    'The read is the draft\'s own Check: the list\'s Check found no script yet for an idea\'s request, which no journal fences, so the outcome stays pending (the request may still arrive) and the title sends the person to the draft, whose Check reads it again.',
  'read:pages/scripts/parts/Building.tsx|build.deployFoundOn|build.deployFound':
    'The read is the draft\'s own Check: the list\'s Check found a script at the path but cannot tell it is this deploy\'s, so the outcome stays pending and the title sends the person to the draft, whose Check reads it.',
  'read:shell/notices.tsx|notice.pending': 'Accepted, no read possible: a notice carried across pages.',
  'fix:kit/pickers/ProviderSetup.tsx|key.leftRefused|key.leftFailed':
    'The fix is in the body ("open the setup again and enter a working key"). This toast shows only after the key step went (its chooser closed) and a definite refusal arrived, so no field is left and the kit has no route back to where the key was set up.',
  'read:kit/forms/Outcome.pure.ts|outcome.toastTitleOf|outcome.toastTitle':
    "The read is the form's own onCheck, added by a spread when the form has one; a form without one has nothing to read.",
};

/** ok/info/warn toasts with no Undo: why the result has no place on screen. */
const NO_PLACE = 'No place on screen: the place is gone (drawer or dialog closed, page left, row gone) or the result never had one.';
const HELD_ROW = 'Also a Check again result of a held keys row, which shows it too.';
const inPlace = (owner: string) => `Shows in place too, no Undo: ${owner} decides inline or keep (inline first).`;
const QUIET: Record<string, string> = {
  'kit/states/openOutside.ts|outside.refused': 'The address opened outside the Hub has no place in it: where the host cannot open a browser, this toast IS the result (the address, copied or shown whole, so the person can open it themselves; openOutside.ts, terminal Hub).',
  'kit/states/openOutside.ts|outside.copied|outside.copyIt': 'The address opened outside the Hub has no place in it: where the host cannot open a browser, this toast IS the result (the address, copied or shown whole, so the person can open it themselves; openOutside.ts, terminal Hub).',
  'kit/states/openOutside.ts|outside.secretStuck': 'The private address opened outside the Hub has no place in it: where the host can neither open a browser nor copy, this toast IS the result (it says to open it from the Hub in a browser, and never shows the address; openOutside.ts).',
  'kit/states/openOutside.ts|outside.webOnly': 'A page of the Hub\'s own site that is not a Hub route (sign-in, the token page) has no place in a host that is not a web page: with no web origin known, this toast IS the result (it says the page opens on the web; openOnWeb in openOutside.ts).',
  'shell/notices.tsx|notice.realmNotRestored': NO_PLACE,
  'shell/notices.tsx|notice.realmGone': NO_PLACE,
  'shell/notices.tsx|notice.tokenEnding': NO_PLACE,
  'shell/notices.tsx|notice.tokenChanged': NO_PLACE,
  'shell/notices.tsx|notice.tokenLacks': NO_PLACE,
  'shell/notices.tsx|notice.offline': NO_PLACE,
  'shell/realmParam.shared.tsx|realmParam.unknown': NO_PLACE,
  'pages/computers/firstPick.ts|said.current': `${NO_PLACE} The Get a computer drawer has closed; the top bar shows the new current computer.`,
  'pages/computers/firstPick.ts|first.ready': `${NO_PLACE} The Get a computer drawer has closed; its Make current is a choice, not an Undo.`,
  'pages/computers/parts/CreateDrawer.tsx|create.sshNotInstalled': `${NO_PLACE} The create drawer closes on done; the computer was made without its SSH key and the toast says where to add one.`,
  'pages/logs/view.tsx|v.cleared': NO_PLACE,
  'pages/files/ReadActions.tsx|ask.whichComputer': `${NO_PLACE} A chat link's ask was dropped unacted: nothing opened, so there is nothing on screen to show it.`,
  'pages/files/ReadActions.tsx|ask.hidden': `${NO_PLACE} A chat link's ask for a pane that is not drawn was dropped unacted: nothing opened.`,
  'pages/logs/view.tsx|v.clearFail': NO_PLACE,
  'pages/logs/view.tsx|v.done': NO_PLACE,
  'pages/notes/holds.ts|toast.holdNotKept': NO_PLACE,
  'pages/ai/parts/exportMd.term.ts|export.copied': 'A terminal saves no files: Export transcript copies the chat to the clipboard, and this toast IS the result (where to paste it).',
  'pages/ai/parts/exportMd.term.ts|export.notCopied': 'A terminal saves no files: when the clipboard did not take the copy, this toast IS the result (it says to export from the web Hub).',
  'pages/notes/view.tsx|toast.downloadedNamed|toast.downloaded': NO_PLACE,
  'pages/notes/view.tsx|toast.deleted': `${NO_PLACE} The Delete note dialog has closed and the note's row is gone; a delete in Notes cannot be undone, so there is no Undo.`,
  'pages/notes/view.tsx|toast.deleteGone': `${NO_PLACE} The Delete note dialog has closed and the note's row is gone: a read after an unknown delete found the note no longer in this notebook.`,
  'pages/notes/view.tsx|toast.deleteNoNotebook': `${NO_PLACE} The Delete note dialog has closed: Notes could not find the notebook, and the row shows nothing of that.`,
  'pages/notes/view.tsx|toast.deleteThere': `${NO_PLACE} The Delete note dialog has closed: a read after an unknown delete found the note still there, and its unchanged row cannot say that the delete was checked.`,
  'pages/ai/parts/EndpointStep.tsx|ep.holdNotKept': NO_PLACE,
  'pages/ai/parts/trimItems.tsx|trim.done': `${NO_PLACE} A trim cannot be undone, so the toast has no Undo; the cut history is the result and the chat reloads onto it.`,
  'kit/agent/ForkMenu.tsx|tm.forkNone': `${NO_PLACE} The reply has no fork and nothing is pending: the toast says so and offers Fork again.`,
  'kit/agent/ForkMenu.tsx|tm.forkRefused': `${NO_PLACE} A fork that ended with nothing made, or one that is busy or not tracked in this build, has no inline place: the toast says why and a person looks in the chat list.`,
  'kit/agent/ForkMenu.tsx|tm.forkMade': `${NO_PLACE} The fork is made but this view has nowhere to open it: the toast says so and the chat list shows it.`,
  'kit/agent/ForkMenu.tsx|tm.wholeNone': `${NO_PLACE} The chat has no fork of the whole chat and nothing is pending: the toast says so and offers Fork this chat again.`,
  'kit/agent/ForkMenu.tsx|tm.wholeRefused': `${NO_PLACE} A fork of the whole chat that ended with nothing made, or one that is busy or not tracked in this build, has no inline place: the toast says why and a person looks in the chat list.`,
  'kit/agent/ForkMenu.tsx|tm.wholeMade': `${NO_PLACE} The fork of the whole chat is made but this view has nowhere to open it: the toast says so and the chat list shows it.`,
  'pages/ai/parts/ConvMenu.tsx|compact.parked|compact.refused': `Duplicates the sent row's inline note (refused, not sent, superseded) when the engine made a row, on purpose: not_sent is shared with a row in the notSent state (the outcome cannot tell the two apart), duplicate_held is another refusal that names no new row, and the menu that sent it has closed. Without the toast a refused Compact could vanish unseen. The exception belongs to ConvMenu; revisit if SendOutcome ever says whether a row exists.`,
  'pages/ai/parts/ConvMenu.tsx|compact.unknown': `Duplicates the sent row's inline note (may have been sent) when the engine made a row, on purpose: the outcome does not guarantee an identifiable inline result (the adapter also answers unknown when it cannot name exactly one row, and for a vanished row, an ended engine or a timeout), and the menu that sent it has closed. No Check again is attached because the row's own note and the chat journal own that read. The exception belongs to ConvMenu.`,
  'pages/apps/launch/useApps.ts|forgot': `${NO_PLACE} The row goes once its Open-with hold is freed, and a freed hold cannot come back, so no Undo.`,
  'pages/board/parts/addLinks.ts|add.bad': NO_PLACE,
  'pages/board/parts/addLinks.ts|add.left': NO_PLACE,
  'pages/board/parts/BoardView.tsx|text': NO_PLACE,
  'pages/board/parts/BoardView.tsx|add.noNumber': NO_PLACE,
  'pages/board/parts/BoardView.tsx|add.full': NO_PLACE,
  'pages/board/parts/BoardView.tsx|notice.updating': `${NO_PLACE} Nothing was added: an add is refused while another tab's value of the Boards opens, so there is nothing to show (keepshown).`,
  'pages/board/parts/BoardView.tsx|add.listPartial': NO_PLACE,
  'pages/board/parts/BoardView.tsx|add.notFound': NO_PLACE,
  'pages/board/parts/BoardView.tsx|add.listSlow': NO_PLACE,
  'pages/board/parts/BoardView.tsx|tile.tokenNotSaved': NO_PLACE,
  'pages/board/parts/BoardView.tsx|title': `${NO_PLACE} A keyed Add link that cannot land adds nothing; its Show it opens the program view.`,
  'pages/board/parts/BoardView.tsx|board.notAdded|full|refusalText(r)': `${NO_PLACE} A New, Duplicate or Import Board refused under the lock adds nothing to show.`,
  'pages/board/parts/ProgramView.tsx|board.notAdded': `${NO_PLACE} A New Board refused under the lock adds nothing to show.`,
  'pages/board/parts/ProgramView.tsx|board.fullAll|board.fullRealm': `${NO_PLACE} A New Board past the realm's 9 Boards adds nothing to show.`,
  'pages/board/parts/BoardView.tsx|board.keepLoadedOn|board.keepLoadedOff': NO_PLACE,
  'pages/board/parts/BoardView.tsx|layout.undoStaleSaid': NO_PLACE,
  'pages/board/parts/BoardView.tsx|recent.notRestored': `${NO_PLACE} Nothing was restored: the Undo was pressed in a toast after the realm or the account changed, and the recent list it would have filled belongs to the other one.`,
  'pages/board/parts/BoardView.tsx|undo.notLast': `${NO_PLACE} Nothing was undone: the Undo was pressed in a toast whose change is no longer its Board's last one, so the Board stays as shown.`,
  'pages/board/parts/BoardView.tsx|move.stale': `${NO_PLACE} Nothing moved: meanwhile the tile was closed or moved, or its own Board or the chosen Board was deleted, so there is nothing to show.`,
  'pages/board/parts/BoardView.tsx|move.moved': `Shown, but not where it was made: the move is chosen on one Board and the view switches to the destination Board with the tile on it, so the toast names where it went. Its Move back action is the way back; an Undo cannot span two Boards.`,
  'pages/board/parts/BoardView.tsx|move.movedBack': `Shown, but not where it was made: Move back is pressed in a toast, not on the tile, and the view switches to the Board the tile came from (whichever Board was shown), so the toast names where it went. A Move back is itself the way back, so it has none.`,
  'pages/board/parts/ProgramView.tsx|view.fullPhone|view.full|board.full': NO_PLACE,
  'pages/board/parts/ProgramView.tsx|view.added': NO_PLACE,
  'pages/board/parts/ProgramView.tsx|notice.updating': `${NO_PLACE} Nothing changed: a change is refused while another tab's value of the Boards opens, and the program view has no notice band (keepshown).`,
  'pages/board/parts/ProgramView.tsx|tile.tokenNotSaved': NO_PLACE,
  'pages/board/parts/ProgramView.tsx|recent.notRestored': `${NO_PLACE} Nothing was restored: the Undo of Recent > Clear was pressed after the realm or the account changed, and the list it cleared is not the one shown; there is nothing to undo.`,
  'pages/board/parts/RestartDialog.tsx|restart.newShell|restart.done': NO_PLACE,
  'pages/board/parts/RestartDialog.tsx|restart.gone|restart.stopped': NO_PLACE,
  'pages/board/parts/ShellDialog.tsx|shell.done': NO_PLACE,
  'pages/board/parts/BoardView.tsx|closed.closedEmpty': `${NO_PLACE} The empty Board is gone and no Closed Boards entry is kept for it, so there is no Undo.`,
  'pages/board/parts/BoardView.tsx|closed.busy': `${NO_PLACE} Nothing started: an Undo pressed while another change of Closed Boards is on its way does nothing.`,
  'pages/board/parts/ClosedBoardsDialog.tsx|closed.busy': `${NO_PLACE} Nothing started: Remove's Undo pressed while another change of Closed Boards is on its way does nothing.`,
  'pages/board/parts/BoardView.tsx|rename.lost': `${NO_PLACE} The Rename dialog and its draft went with the value that stopped opening; nothing was renamed, so there is nothing to undo.`,
  'pages/board/parts/SshForm.tsx|ssh.startedNotAdded': `${NO_PLACE} The form that would add the tile is gone; the session runs on its computer and the text says how to add it.`,
  'pages/board/parts/ClosedBoardsDialog.tsx|closedRefusalText(t, r)': `${NO_PLACE} A refused Remove: the row stays shown, and a row has no place for the reason; a NOT_STORED one may still land (its text says not confirmed, reload and check the list).`,
  'pages/board/parts/ClosedBoardsDialog.tsx|closedRefusalText(t, b)': `${NO_PLACE} A refused Undo of Remove: the dialog may be closed by then, so nothing shows it; a NOT_STORED one may still land (its text says not confirmed, reload and check the list).`,
  'pages/board/parts/ClosedBoardsDialog.tsx|closedRefusalText(t, r.r)': `${NO_PLACE} A refused Clear all: the rows stay shown, and the list has no place for the reason; a NOT_STORED one may still land (its text says not confirmed, reload and check the list).`,
  'pages/home/widgets/store.ts|toast.notKept': NO_PLACE,
  'pages/home/widgets/store.ts|add.lost': NO_PLACE,
  'pages/keys/parts/KeysTab.tsx|outcomeText(t, { outcome: "not_sent", code }, nameOf(k), false)': NO_PLACE,
  'pages/keys/parts/KeysTab.tsx|outcomeText(t, r, nameOf(k), false)':
    'A pause or resume not sent, or answered against an older view: nothing changed, so the row keeps its state and has no place to say why.',
  'pages/keys/parts/KeysTab.tsx|done.edited': NO_PLACE,
  'pages/keys/parts/KeysTab.tsx|op.heldElsewhereOf': NO_PLACE,
  'pages/keys/parts/KeysTab.tsx|op.notSettledOf': NO_PLACE,
  'pages/keys/parts/KeysTab.tsx|full':
    "A Check again's finding whose row moved on to another send of the key meanwhile: that row is not this send's place.",
  'pages/keys/parts/KeysTab.tsx|done.deleted': NO_PLACE,
  'pages/keys/parts/KeysTab.tsx|op.cutList':
    "A Check's cut read is the list shown, without the key: its row has left the view.",
  'pages/keys/parts/KeysTab.tsx|op.gone': NO_PLACE,
  'pages/keys/parts/KeysTab.tsx|op.lateResumed|op.latePaused': `${NO_PLACE} A pause or resume that went through after the Keys tab was left: no row shows it now, and the row shows the new state when Keys is next open.`,
  'pages/keys/parts/ShareDrawer.tsx|share.lateMade': NO_PLACE,
  'pages/keys/parts/ShareDrawer.tsx|share.stopped': NO_PLACE,
  'pages/keys/parts/SharedTab.tsx|share.dismissNotSettled': NO_PLACE,
  'pages/keys/parts/SharedTab.tsx|share.notSettled': NO_PLACE,
  'pages/keys/parts/SharedTab.tsx|share.heldElsewhere': NO_PLACE,
  'pages/keys/parts/SharedTab.tsx|share.stopped': NO_PLACE,
  // The Shared tab's pause, resume and details edit, as the Keys tab's.
  'pages/keys/parts/SharedTab.tsx|outcomeText(t, { outcome: "not_sent", code }, nameOf(r), false)': NO_PLACE,
  'pages/keys/parts/SharedTab.tsx|outcomeText(t, c, nameOf(r), false)':
    'A pause or resume not sent, or answered against an older view: nothing changed, so the row keeps its state and has no place to say why.',
  'pages/keys/parts/SharedTab.tsx|share.editSaved': NO_PLACE,
  'pages/keys/parts/SharedTab.tsx|op.heldElsewhereOf': NO_PLACE,
  'pages/keys/parts/SharedTab.tsx|op.notSettledOf': NO_PLACE,
  'pages/keys/parts/SharedTab.tsx|full':
    "A Check again's finding whose row moved on to another send of the share meanwhile: that row is not this send's place.",
  'pages/keys/parts/SshTab.tsx|op.notSettledOf': NO_PLACE,
  'pages/keys/parts/SshTab.tsx|ssh.saved|ssh.removed': 'The change went through for a computer no longer on screen: nothing shown changes.',
  'pages/keys/parts/SshTab.tsx|ssh.otherRealm': NO_PLACE,
  'pages/keys/parts/SshTab.tsx|ssh.checkedHeld': HELD_ROW,
  'pages/keys/parts/SshTab.tsx|ssh.gone': HELD_ROW,
  'pages/keys/parts/SshTab.tsx|ssh.checkedHolds|ssh.removed': HELD_ROW,
  'pages/keys/parts/SshTab.tsx|ssh.otherRealmDismiss': `${NO_PLACE} ${HELD_ROW}`,
  'pages/keys/parts/mint-flow.ts|op.heldElsewhereOf': NO_PLACE,
  'pages/keys/parts/mint-flow.ts|op.notSettledOf': NO_PLACE,
  'pages/keys/parts/mint-flow.ts|mint.notSettled': NO_PLACE,
  'pages/keys/parts/mint-flow.ts|strings["mint.lateMade"]': NO_PLACE,
  'pages/programs/sandbox/NewProgram.tsx|np.done.once|np.done.keep': NO_PLACE,
  'pages/programs/sandbox/NewProgram.tsx|np.problem.once|np.problem.keep': NO_PLACE,
  'pages/programs/sandbox/NewProgram.tsx|np.found.once': NO_PLACE,
  'pages/programs/sandbox/NewProgram.tsx|np.problem.once': NO_PLACE,
  'pages/programs/sandbox/NewProgram.tsx|np.found.onceUnknown': NO_PLACE,
  'pages/programs/sandbox/NewProgram.tsx|np.found.keep': NO_PLACE,
  'pages/programs/parts/RemoveProgram.tsx|rm.done': `${NO_PLACE} The removed program's row leaves the list with the removal, so the list has nowhere to say it went through; a removal is for good, so there is no Undo.`,
  'pages/programs/parts/RemoveProgram.tsx|rm.already': `${NO_PLACE} The program was gone before this removal reached the computer: its attempt is cleared and its row leaves the list on the next read, and nothing changed that an Undo could take back.`,
  'pages/programs/parts/RemoveProgram.tsx|rm.leftoverT': `${NO_PLACE} The program is removed, its attempt cleared and its row gone; only the cleanup after it did not finish, and no row is left to carry that warning.`,
  'pages/programs/parts/EditProgram.tsx|ed.done': `${NO_PLACE} The Edit drawer closes as the save lands (or the held note leaves after Check again), and the list shows only the name, never the command, so a saved command has nowhere to show; an edit has no Undo.`,
  'pages/programs/parts/EditProgram.tsx|ed.notAppliedT': `${NO_PLACE} The computer answered that the edit is stored and it could not apply it (a definite refusal by its own sentence, edit.ts refusalOf, never an unknown outcome): the drawer has closed and the attempt is cleared, and the row has no place for "saved, not applied".`,
  'pages/scripts/parts/DeletedDrawer.tsx|code.restored': inPlace('the Scripts page'),
  'pages/scripts/parts/MagicPanel.tsx|magic.saved': inPlace('the Scripts page'),
  'pages/scripts/parts/SettingsTab.tsx|delete.testsUnread': NO_PLACE,
  'pages/scripts/parts/SettingsTab.tsx|delete.testsLeft': NO_PLACE,
  'pages/scripts/parts/SettingsTab.tsx|secrets.saved': inPlace('the Scripts page'),
  'pages/scripts/parts/SettingsTab.tsx|delete.linksStopped': NO_PLACE,
  'pages/scripts/parts/SettingsTab.tsx|delete.linksOff': NO_PLACE,
  // The delete's confirm closes as it stops (a link not checked, or one that changed meanwhile): nothing on screen is its place.
  'pages/scripts/parts/SettingsTab.tsx|delete.linksUnchecked': NO_PLACE,
  'pages/scripts/parts/TestTab.tsx|doneText': inPlace('the Scripts page'),
  'pages/scripts/parts/HeldWrites.tsx|heldWrite.saved': `${NO_PLACE} Check frees the hold, so its banner on the Scripts page is gone as the toast shows; the toast says the computer's op journal records this save as committed.`,
  'pages/scripts/parts/HeldWrites.tsx|heldWrite.notSent': `${NO_PLACE} Check frees the hold, so its banner on the Scripts page is gone as the toast shows; the toast says the computer fenced the save (never received, now never can be): nothing changed.`,
  'pages/scripts/parts/HeldWrites.tsx|heldWrite.refused': `${NO_PLACE} Check frees the hold, so its banner on the Scripts page is gone as the toast shows; the toast says the computer refused the save, its code in the body: nothing changed.`,
  'pages/scripts/parts/opcheck.ts|check.notSent': `${NO_PLACE} The Check proves the change never ran and ends the place's pending banner, so the result has nowhere left to show.`,
  'pages/scripts/parts/useEditor.ts|code.saved': inPlace('the Scripts page'),
  'pages/scripts/parts/useEditor.ts|code.restored': inPlace('the Scripts page'),
  'pages/scripts/new/records.ts|draft.droppedOldest': `${NO_PLACE} The dropped draft has no row anywhere any more; the new draft opens as the toast shows.`,
  'pages/scripts/parts/Building.tsx|build.discardRefused': 'The row stays listed and shows where the build is now; the toast says why the press did not end it.',
  'pages/scripts/parts/Building.tsx|build.discardedKept': 'What is still listed stays in the section with its own Discard; the toast says why it is still there.',
  'pages/scripts/parts/Building.tsx|build.discardChangeFailed': 'The change request stays listed with its own Discard; the toast says why it is still there.',
  'pages/scripts/parts/Building.tsx|build.deployAbsentOn|build.deployAbsent':
    'The held row stays as it was: the list frees nothing, so it has no place for what this Check found (no script at the path); the toast says it and that the draft\'s own page deploys again.',
  'pages/scripts/parts/runScript.ts|run.failed':
    'Not sent: the run started nothing, so the list has nothing to show; Try again sends one new run. The shared run (parts/runScript.ts, the list and the Overview\'s Schedule card) also refuses, unsent, a script whose computer is not the one shown: nothing started either.',
  'pages/scripts/parts/runScript.ts|run.started':
    'A started run runs on the computer, not on the list; it shows in its runs (Logs for folder 1, the script\'s Overview for another folder).',
  'pages/vault/parts/EditDrawer.tsx|done.saved': NO_PLACE,
  'pages/vault/parts/Entry.tsx|done.deleted': NO_PLACE,
  'pages/ai/parts/ConvMenu.tsx|no': `${NO_PLACE} A typed /rename or /exit asked for a chat menu item that cannot run now; the menu is closed, so the item's own disabled reason has no place on screen, and nothing changed that an Undo could take back.`,
};

/** List keys more than one call shares, `<rule>:<file>|<title>` → how many: the entry's reason was read for each. A
 *  new call with the same key changes the count and is read again. */
const SHARED: Record<string, number> = {
  'quiet:kit/agent/ForkMenu.tsx|tm.forkRefused': 2,
  'quiet:kit/agent/ForkMenu.tsx|tm.wholeRefused': 2,
  'quiet:pages/board/parts/BoardView.tsx|add.full': 2,
  'quiet:pages/board/parts/BoardView.tsx|notice.updating': 2,
  'quiet:pages/keys/parts/KeysTab.tsx|outcomeText(t, r, nameOf(k), false)': 2,
  'quiet:pages/keys/parts/KeysTab.tsx|done.deleted': 3,
  'quiet:pages/keys/parts/ShareDrawer.tsx|share.stopped': 2,
  'quiet:pages/keys/parts/SharedTab.tsx|share.heldElsewhere': 3,
  'quiet:pages/keys/parts/SharedTab.tsx|share.stopped': 2,
  'quiet:pages/keys/parts/SharedTab.tsx|op.heldElsewhereOf': 2,
  'quiet:pages/scripts/parts/DeletedDrawer.tsx|code.restored': 2,
  'quiet:pages/scripts/parts/runScript.ts|run.failed': 2,
};

// ── The scan ──────────────────────────────────────────────────────────────────────────────────────────────────

const ALL = readdirSync(SRC, { recursive: true, encoding: 'utf8' }).map((f) => f.split(sep).join('/'));
const scanned = ALL.filter(
  (f) =>
    /^(pages|ask|shell|kit)\//.test(f) &&
    /\.tsx?$/.test(f) &&
    !/\.(test|spec)\.tsx?$/.test(f) &&
    !f.endsWith('.d.ts') &&
    !f.startsWith('kit/gallery/') &&
    f !== 'kit/states/Toast.tsx' &&
    f !== 'kit/states/Toast.store.ts',
);
// ToastTone and showToast live in the store shared with the terminal build (Toast.tsx re-exports them).
const toastSource = readFileSync(join(SRC, 'kit/states/Toast.store.ts'), 'utf8');
const TONES = tonesIn(toastSource);
/** The scanned files that name showToast or showErrorToast, read once for the three scans below: each returns nothing for any other file
 *  before it parses (toastCalls and copyCalls test this same pattern, infoArgs a narrower one). */
const toastFiles = scanned.map((f) => [f, readFileSync(join(SRC, f), 'utf8')] as const).filter(([, text]) => /\bshow(Error)?Toast\b/.test(text));
const calls = toastFiles.flatMap(([f, text]) => toastCalls(f, text, TONES));

describe('showToast calls keep the toast rules', () => {
  it('reads the tone list from Toast.tsx and finds the calls', () => {
    expect([...TONES].sort()).toEqual(['error', 'info', 'ok', 'unknown', 'warn']);
    expect(calls.length).toBeGreaterThan(50);
  });

  it('error and unknown toasts stay until closed in showToast itself', () => {
    expect(toastSource).toMatch(/const STICKY[^=]*=\s*new Set\(\['error', 'unknown'\]\)/);
  });

  it('every tone is one of ToastTone', () => {
    expect(calls.flatMap((c) => c.breaks.filter((b) => b.startsWith('tone:')).map((b) => `${c.at} ${b}`))).toEqual([]);
  });

  it('an unknown or error toast passes no timeout (it stays until closed)', () => {
    expect(calls.filter((c) => c.breaks.includes('timeout')).map((c) => c.at)).toEqual([]);
  });

  it('a tone the guard cannot read has a TONE_REVIEW entry', () => {
    expect(calls.filter((c) => c.breaks.includes('review') && !TONE_REVIEW[c.key]).map((c) => `${c.at} ${c.key}`)).toEqual([]);
  });

  it('an error carries its fix and an unknown outcome its read, or is a KNOWN break with an owner', () => {
    const bad = calls.flatMap((c) => c.breaks.filter((b) => b === 'fix' || b === 'read').map((b) => `${b}:${c.key}`));
    expect(bad.filter((k) => !KNOWN[k])).toEqual([]);
  });

  it('an ok, info or warn toast without an Undo says in QUIET why its result has no place on screen', () => {
    expect(calls.filter((c) => c.breaks.includes('quiet') && !QUIET[c.key]).map((c) => `${c.at} ${c.key}`)).toEqual([]);
  });

  it('every list entry still matches a call that needs it (fixed or moved calls take their entry along)', () => {
    const need = (rule: string) => new Set(calls.flatMap((c) => (c.breaks.includes(rule) ? [c.key] : [])));
    const review = need('review');
    const quiet = need('quiet');
    const known = new Set(calls.flatMap((c) => c.breaks.filter((b) => b === 'fix' || b === 'read').map((b) => `${b}:${c.key}`)));
    expect({
      review: Object.keys(TONE_REVIEW).filter((k) => !review.has(k)),
      quiet: Object.keys(QUIET).filter((k) => !quiet.has(k)),
      known: Object.keys(KNOWN).filter((k) => !known.has(k)),
    }).toEqual({ review: [], quiet: [], known: [] });
  });

  it('a list entry more than one call shares is pinned in SHARED with its count', () => {
    const listed = (rule: string, key: string) => (rule === 'review' ? TONE_REVIEW : rule === 'quiet' ? QUIET : KNOWN)[rule === 'review' || rule === 'quiet' ? key : `${rule}:${key}`] !== undefined;
    const count = new Map<string, number>();
    for (const c of calls) for (const b of new Set(c.breaks)) if (['review', 'quiet', 'fix', 'read'].includes(b) && listed(b, c.key)) count.set(`${b}:${c.key}`, (count.get(`${b}:${c.key}`) ?? 0) + 1);
    const shared = Object.fromEntries([...count].filter(([, n]) => n > 1));
    expect(shared).toEqual(SHARED);
  });

  it('every entry gives a reason', () => {
    const empty = [...Object.entries(TONE_REVIEW), ...Object.entries(KNOWN), ...Object.entries(QUIET)].filter(([, v]) => v.trim().length < 12);
    expect(empty.map(([k]) => k)).toEqual([]);
  });
});

describe('the analyser (fixtures)', () => {
  const T = new Set(['ok', 'info', 'warn', 'error', 'unknown']);
  const judge = (body: string) => toastCalls('f.tsx', `const x = () => { ${body} };`, T).map((c) => `${c.key.slice(6)} ${c.breaks.join(',')}`.trim());

  it('a tone outside ToastTone is named', () => {
    expect(judge(`showToast({ title: t('a'), tone: 'success', action: { label: t('undo'), onAction } })`)).toEqual(['a tone:success']);
  });

  it('an error without an action breaks fix; with one it passes', () => {
    expect(judge(`showToast({ title: t('a'), tone: 'error' })`)).toEqual(['a fix']);
    expect(judge(`showToast({ title: t('a'), tone: 'error', action: retry })`)).toEqual(['a']);
  });

  it('an unknown without an action breaks read, and a timeout on it breaks timeout', () => {
    expect(judge(`showToast({ title: t('a'), tone: 'unknown' })`)).toEqual(['a read']);
    expect(judge(`showToast({ title: t('a'), tone: 'unknown', action: check }, 8000)`)).toEqual(['a timeout']);
  });

  it('ok (also by default), info and warn without an Undo are quiet; an Undo exempts, another action does not', () => {
    expect(judge(`showToast({ title: t('a') })`)).toEqual(['a quiet']);
    expect(judge(`showToast({ title: t('a'), tone: 'warn' })`)).toEqual(['a quiet']);
    expect(judge(`showToast({ title: t('a'), action: { label: t('toast.undo'), onAction } })`)).toEqual(['a']);
    expect(judge(`showToast({ title: t('a'), tone: 'info', action: { label: t('open'), onAction } })`)).toEqual(['a quiet']);
  });

  it('a conditional tone needs review and each branch is still judged', () => {
    expect(judge(`showToast({ title: t('a'), tone: ok ? 'info' : 'error' })`)).toEqual(['a review,fix']);
    expect(judge(`showToast({ title: t('a'), tone: ok ? 'info' : 'bad', action: retry })`)).toEqual(['a review,tone:bad']);
  });

  it('a tone from a variable, content built elsewhere, or a spread that may carry tone or action needs review', () => {
    expect(judge(`showToast({ title: t('a'), tone: k.tone, action: a })`)).toEqual(['a review']);
    expect(judge(`showToast(content)`)).toEqual(['content review']);
    expect(judge(`showToast({ title: t('a'), tone: 'ok', ...extra })`)).toEqual(['a review,quiet']);
    expect(judge(`showToast({ title: t('a'), tone: 'unknown', ...(c ? { action } : {}) })`)).toEqual(['a review,read']);
    expect(judge(`showToast({ title: t('a'), tone: 'info', ...(b ? { body } : {}) })`)).toEqual(['a quiet']);
  });

  it('content chosen by a conditional is judged per side, titles and plain text as keys', () => {
    expect(judge(`showToast(c ? { title: t('a'), tone: 'error' } : { title: 'Plain text', tone: 'unknown', action: check })`)).toEqual(['a fix', 'Plain text']);
    expect(judge(`showToast({ title: t(c ? 'a' : 'b'), tone: 'info' })`)).toEqual(['a|b quiet']);
  });

  it('showErrorToast needs retry, and check unless change is false', () => {
    expect(judge(`showErrorToast(t('a'), e)`)).toEqual(['a fix,read']);
    expect(judge(`showErrorToast(t('a'), e, { retry, check })`)).toEqual(['a']);
    expect(judge(`showErrorToast(t('a'), e, { retry, change: false })`)).toEqual(['a']);
    expect(judge(`showErrorToast(t('a'), e, opts)`)).toEqual(['a review']);
  });

  it('aliases, assigned names, member and optional calls are judged too', () => {
    const file = (body: string) => toastCalls('f.tsx', body, T).map((c) => `${c.key.slice(6)} ${c.breaks.join(',')}`.trim());
    expect(file(`import { showToast as toast } from '@kit';\nconst f = () => toast({ title: t('a'), tone: 'error' });`)).toEqual(['a fix']);
    expect(file(`import { showToast } from '@kit';\nconst say = showToast;\nsay({ title: t('a'), tone: 'error' });`)).toEqual(['a fix']);
    expect(file(`import * as kit from '@kit';\nkit.showToast({ title: t('a'), tone: 'error' });`)).toEqual(['a fix']);
    expect(judge(`showToast?.({ title: t('a'), tone: 'unknown' })`)).toEqual(['a read']);
  });

  it('destructured names and string-index calls are judged too', () => {
    const file = (body: string) => toastCalls('f.tsx', body, T).map((c) => `${c.key.slice(6)} ${c.breaks.join(',')}`.trim());
    expect(file(`import * as kit from '@kit';\nconst { showToast: say } = kit;\nsay({ title: t('a'), tone: 'error' });`)).toEqual(['a fix']);
    expect(file(`import * as kit from '@kit';\nconst { showToast } = kit;\nshowToast({ title: t('a'), tone: 'unknown' });`)).toEqual(['a read']);
    expect(file(`import * as kit from '@kit';\nconst { 'showErrorToast': oops } = kit;\noops(t('a'), e);`)).toEqual(['a fix,read']);
    expect(file(`import * as kit from '@kit';\nkit['showToast']({ title: t('a'), tone: 'error' });`)).toEqual(['a fix']);
    expect(file(`import * as kit from '@kit';\nkit?.['showErrorToast'](t('a'), e, { retry });`)).toEqual(['a read']);
    expect(file(`import * as kit from '@kit';\nconst say = kit['showToast'];\nsay({ title: t('a'), tone: 'error' });`)).toEqual(['a fix']);
    // Other names stay out: a destructured or indexed function that is not a toast is not judged.
    expect(file(`const { showDialog: say } = kit;\nsay({ title: t('a'), tone: 'error' });\nkit['other']({ tone: 'error' });`)).toEqual([]);
  });

  it("a file's alias never names another object's member; a template-literal key is read", () => {
    const file = (body: string) => toastCalls('f.tsx', body, T).map((c) => `${c.key.slice(6)} ${c.breaks.join(',')}`.trim());
    expect(file(`import * as kit from '@kit';\nconst { showToast: toast } = kit;\nlogger['toast']('unrelated');\nlogger.toast('unrelated');`)).toEqual([]);
    expect(file(`import { showToast as toast } from '@kit';\nlogger.toast({ tone: 'error' });\ntoast({ title: t('a'), tone: 'error' });`)).toEqual(['a fix']);
    expect(file('import * as kit from \'@kit\';\nconst { [`showToast`]: say } = kit;\nsay({ title: t(\'a\'), tone: \'error\' });')).toEqual(['a fix']);
  });

  it('an action that may be missing does not count: undefined, null, void, a conditional with one, c && x', () => {
    expect(judge(`showToast({ title: t('a'), tone: 'error', action: undefined })`)).toEqual(['a fix']);
    expect(judge(`showToast({ title: t('a'), tone: 'unknown', action: c ? check : null })`)).toEqual(['a read']);
    expect(judge(`showToast({ title: t('a'), tone: 'error', action: c && retry })`)).toEqual(['a fix']);
    expect(judge(`showToast({ title: t('a'), tone: 'error', action: own ?? retry })`)).toEqual(['a']);
    expect(judge(`showErrorToast(t('a'), e, { retry: undefined, check: undefined })`)).toEqual(['a fix,read']);
  });

  it('a spread of a member or a call, or one whose objects name tone or action, needs review', () => {
    expect(judge(`showToast({ title: t('a'), tone: 'error', action: retry, ...opts.extra })`)).toEqual(['a review']);
    expect(judge(`showToast({ title: t('a'), tone: 'error', action: retry, ...makeExtra() })`)).toEqual(['a review']);
    expect(judge(`showToast({ title: t('a'), tone: 'info', ...(c && { tone: 'error' }) })`)).toEqual(['a review,quiet']);
    expect(judge(`showToast({ title: t('a'), tone: 'info', ...(c && { body }) })`)).toEqual(['a quiet']);
    // A getter may return any tone (:1075).
    expect(judge(`showToast({ title: t('a'), get tone() { return 'error'; } })`)).toEqual(['a review,quiet']);
    expect(judge(`showToast({ title: t('a'), tone: 'info', ...(c && { get body() { return x; } }) })`)).toEqual(['a review,quiet']);
  });

  it('quoted and computed names count as the names they spell; a computed name the guard cannot read needs review', () => {
    expect(judge(`showToast({ title: t('a'), tone: 'error', action: retry, ...(c && { 'action': undefined }) })`)).toEqual(['a review']);
    expect(judge(`showToast({ title: t('a'), tone: 'error', action: retry, ...(c && { ['action']: undefined }) })`)).toEqual(['a review']);
    expect(judge(`showToast({ title: t('a'), tone: 'error', action: retry, ...(c && { [key]: undefined }) })`)).toEqual(['a review']);
    expect(judge(`showToast({ title: t('a'), 'tone': 'error' })`)).toEqual(['a fix']);
    expect(judge(`showToast({ title: t('a'), ['tone']: 'unknown', action: check, 'action': undefined })`)).toEqual(['a read']);
    expect(judge(`showToast({ title: t('a'), tone: 'error', action: retry, [key]: undefined })`)).toEqual(['a review']);
    expect(judge(`showErrorToast(t('a'), e, { 'retry': retry, ['check']: check })`)).toEqual(['a']);
    expect(judge(`showErrorToast(t('a'), e, { retry, check, [key]: undefined })`)).toEqual(['a review']);
  });

  it('a conditional with one readable side judges that side and sends the other to review', () => {
    expect(judge(`showToast(c ? { title: t('a'), tone: 'error' } : content)`)).toEqual(['a fix', 'content review']);
  });

  it('reads the tones from a ToastTone declaration', () => {
    expect([...tonesIn(`export type ToastTone = 'ok' | 'bad';`)]).toEqual(['ok', 'bad']);
  });
});

// ── The copy guard ────────────────────────────────────────────────────────────────────────────────────────────
// Toast.tsx's header holds the copy policy: the title names its subject and what happened; a failure says what to do;
// banned bare titles never show. Every title (and showErrorToast's pendingTitle) is read to its English text in the
// strings.en.json the file imports (a file that takes `t` from elsewhere: its page's or the kit's strings, when the key
// has one text there), and judged:
//   - ban:     a banned bare title ("Done.", "Failed", "Something went wrong", "This may have gone through", …);
//   - subject: no {{…}} interpolation and no SUBJECT_OK entry naming the subject it spells out;
//   - copyfix: an error or unknown toast with neither a body nor an action (showErrorToast always has a body). A warn
//     is information, not a failure (the header above), so it needs no fix;
//   - pending: a showErrorToast for a change (change not false) without pendingTitle: its unknown toast would show the
//     kit's subjectless "This may have gone through";
//   - copyreview: a title the guard cannot read to text (a variable, a helper): COPY_REVIEW says what it shows;
//   - vars:    a translator call t('k', …) whose text has a {{x}} its call does not pass: no second argument, or an
//     object literal without x (a spread, a variable or a key it cannot read there is not judged). Only the entries
//     the kit's lookup can read for that call are judged: no count, the key; a numeric literal count, the form it
//     picks; any other count, every form. The kit leaves an unknown placeholder visible, so the toast would show
//     "{{x}}".
// KNOWN_COPY lists the known copy breaks with their owners; it only shrinks, as KNOWN does.

export interface CopyCall {
  key: string;
  at: string;
  breaks: string[];
  /** The English titles read, for the messages. */
  texts: string[];
}

/** Bare titles that say nothing of their subject, compared whole (case-insensitive, without a final . ! or …). */
export const BANNED_TITLES: readonly string[] = [
  'done', 'saved', 'deleted', 'restored', 'stopped', 'removed', 'copied', 'failed', 'error', 'not allowed',
  'something went wrong', "it's live", 'it started', 'settings saved', 'value saved', 'run started',
  'this may have gone through', 'this didn\'t go through', 'nothing was sent',
];
/** Openings with no subject, unless the title interpolates one: "This change …" (not "This change to your …"), "… may
 *  have gone through" said of this, that, it or a change, and "… doesn't allow that". */
const SUBJECTLESS = [/doesn['’]t allow that/i, /^(this|that|a) change\b(?! to\b)/i, /^(this|that|it|a change) may have gone through/i];

const norm = (s: string) => s.trim().replace(/[.!…]+$/u, '').trim().replace(/’/g, "'").toLowerCase();
const interpolated = (s: string) => /\{\{[^}]+\}\}/.test(s);

/** The copy rules one English title breaks (subject is judged with SUBJECT_OK by the caller). */
export function copyBreaks(text: string): string[] {
  const out: string[] = [];
  const n = norm(text);
  if (BANNED_TITLES.includes(n) || (!interpolated(text) && SUBJECTLESS.some((re) => re.test(text.trim())))) out.push('ban');
  if (!interpolated(text)) out.push('subject');
  return out;
}

type Json = Readonly<Record<string, unknown>>;
type LoadJson = (path: string) => Json | null;

/** The plural suffixes a translation can pick by `count`. */
const PLURALS = ['zero', 'one', 'two', 'few', 'many', 'other'];

/** Every text a key can show through a translator: the key itself and each plural form it has (the count picks one at
 *  run time, so all are judged). Empty when the key has none. */
export const textsIn = (j: Json, k: string): string[] => textsOf(j, formsOf(k));
/** The key and every plural form of it, as `lookup` (kit/strings.ts) may read them. */
const formsOf = (k: string): string[] => [k, ...PLURALS.map((p) => `${k}_${p}`)];
/** The texts of the listed keys a table has. */
const textsOf = (j: Json, keys: readonly string[]): string[] =>
  keys.filter((c) => typeof j[c] === 'string').map((c) => j[c] as string);

const posix = (p: string) => p.split('/').reduce<string[]>((a, s) => (s === '..' ? a.slice(0, -1) : s === '.' || !s ? a : [...a, s]), []).join('/');

/** A parameter type that is a translator: the page's `T` (or `TT`, `BT`), `Translate<…>`, or
 *  `ReturnType<typeof useStrings…>` / `ReturnType<typeof makeT…>`. A plain function type may be anything. */
const TRANSLATOR_TYPE = /^(T|TT|BT|Translate<[\s\S]*>|ReturnType<typeof (useStrings|makeT)\b[\s\S]*>)$/;

/** The identifiers a binding name declares (destructuring included), with the node that declares each. */
function bindingNames(name: ts.BindingName, out: Map<string, ts.Node>, decl: ts.Node): void {
  if (ts.isIdentifier(name)) out.set(name.text, decl);
  else for (const el of name.elements) if (!ts.isOmittedExpression(el)) bindingNames(el.name, out, ts.isIdentifier(el.name) ? el : decl);
}

/** The node that declares `id` where it is used: the nearest enclosing parameter, variable, function, class or import
 *  of that name (hoisting aside). null for a global. */
function bindingOf(id: ts.Identifier): ts.Node | null {
  const name = id.text;
  for (let a: ts.Node | undefined = id.parent; a; a = a.parent) {
    const found = new Map<string, ts.Node>();
    if (ts.isFunctionLike(a)) for (const p of a.parameters) bindingNames(p.name, found, p);
    if (ts.isBlock(a) || ts.isSourceFile(a) || ts.isModuleBlock(a) || ts.isCaseClause(a) || ts.isDefaultClause(a)) {
      for (const st of a.statements) {
        if (ts.isVariableStatement(st)) for (const d of st.declarationList.declarations) bindingNames(d.name, found, d);
        else if ((ts.isFunctionDeclaration(st) || ts.isClassDeclaration(st)) && st.name) found.set(st.name.text, st);
        else if (ts.isImportDeclaration(st) && st.importClause) {
          const c = st.importClause;
          if (c.name) found.set(c.name.text, c);
          if (c.namedBindings && ts.isNamespaceImport(c.namedBindings)) found.set(c.namedBindings.name.text, c);
          if (c.namedBindings && ts.isNamedImports(c.namedBindings)) for (const e of c.namedBindings.elements) found.set(e.name.text, e);
        }
      }
    }
    if ((ts.isForStatement(a) || ts.isForOfStatement(a) || ts.isForInStatement(a)) && a.initializer && ts.isVariableDeclarationList(a.initializer))
      for (const d of a.initializer.declarations) bindingNames(d.name, found, d);
    if (ts.isCatchClause(a) && a.variableDeclaration) bindingNames(a.variableDeclaration.name, found, a.variableDeclaration);
    const hit = found.get(name);
    if (hit) return hit;
  }
  return null;
}

/** The type text a destructured parameter gives the property `key`: from an inline type literal, or an interface or
 *  type alias of that name in the same file. */
function memberType(param: ts.ParameterDeclaration, key: string, sf: ts.SourceFile): string | null {
  const t = param.type;
  if (!t) return null;
  const fromMembers = (ms: readonly ts.TypeElement[]) => {
    const m = ms.find((x) => x.name && keyOf(x.name) === key);
    return m && ts.isPropertySignature(m) && m.type ? m.type.getText(sf) : null;
  };
  if (ts.isTypeLiteralNode(t)) return fromMembers(t.members);
  if (ts.isTypeReferenceNode(t) && ts.isIdentifier(t.typeName)) {
    const n = t.typeName.text;
    for (const st of sf.statements) {
      if (ts.isInterfaceDeclaration(st) && st.name.text === n) return fromMembers(st.members);
      if (ts.isTypeAliasDeclaration(st) && st.name.text === n && ts.isTypeLiteralNode(st.type)) return fromMembers(st.type.members);
    }
  }
  return null;
}

/** The strings a file reads. Its .json imports by local name. A translator call reads by where its callee is bound:
 *  `useStrings(x)` / `makeT(x)` (bound or inline) read that table only; a page hook's translator (`const t = useT()`)
 *  and a parameter typed as a translator (TRANSLATOR_TYPE, a destructured prop included) read the file's imports and
 *  its owner's strings files (`pages/<id>/`, `kit/`, `shell/`, `ask/`), only when every table with the key gives the
 *  same texts. Any other callee (a local function, an untyped or function-typed parameter, a global) is unread. */
function stringsOf(file: string, sf: ts.SourceFile, load: LoadJson, ownerJsons: (file: string) => string[]) {
  const own = new Map<string, Json>();
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier)) continue;
    const spec = st.moduleSpecifier.text;
    const name = st.importClause?.name?.text;
    if (!name || !spec.endsWith('.json')) continue;
    const path = spec.startsWith('@kit/') ? `kit/${spec.slice(5)}` : spec.startsWith('.') ? posix(`${file.split('/').slice(0, -1).join('/')}/${spec}`) : null;
    const j = path ? load(path) : null;
    if (j) own.set(name, j);
  }
  /** `useStrings(x)` / `makeT(x)` on an imported table: that table. */
  const tableOfMaker = (e: ts.Expression): Json | null => {
    const x = unwrap(e);
    if (!ts.isCallExpression(x) || !ts.isIdentifier(x.expression) || !/^(useStrings|makeT)$/.test(x.expression.text)) return null;
    const a = x.arguments[0] && unwrap(x.arguments[0]);
    // The argument must be the import itself, not a parameter or variable shadowing its name.
    const d = a && ts.isIdentifier(a) ? bindingOf(a) : null;
    return d && ts.isImportClause(d) && a && ts.isIdentifier(a) ? (own.get(a.text) ?? null) : null;
  };
  /** What a callee reads: one table, the owner's tables, or nothing the guard can read. */
  const translatorOf = (callee: ts.Expression): Json | 'owner' | null => {
    const c = unwrap(callee);
    const made = tableOfMaker(c);
    if (made) return made;
    if (!ts.isIdentifier(c)) return null;
    const d = bindingOf(c);
    if (!d) return null;
    if (ts.isVariableDeclaration(d) && ts.isIdentifier(d.name) && d.initializer) {
      const tab = tableOfMaker(d.initializer);
      if (tab) return tab;
      const init = unwrap(d.initializer);
      return ts.isCallExpression(init) && ts.isIdentifier(init.expression) && /^use[A-Z]?[A-Za-z]*T$/.test(init.expression.text) && init.arguments.length === 0 ? 'owner' : null;
    }
    if (ts.isParameter(d) && ts.isIdentifier(d.name)) return d.type && TRANSLATOR_TYPE.test(d.type.getText(sf).trim()) ? 'owner' : null;
    if (ts.isBindingElement(d)) {
      // `{ t }` or `{ t: tr }` straight in a parameter: the prop's declared type.
      const pattern = d.parent;
      const param = pattern.parent;
      if (!ts.isObjectBindingPattern(pattern) || !ts.isParameter(param)) return null;
      const key = d.propertyName ? keyOf(d.propertyName) : ts.isIdentifier(d.name) ? d.name.text : null;
      const type = key !== null ? memberType(param, key, sf) : null;
      return type !== null && TRANSLATOR_TYPE.test(type.trim()) ? 'owner' : null;
    }
    return null;
  };
  const owner = ownerJsons(file).map(load).filter((j): j is Json => !!j);
  return {
    own,
    /** The texts `callee(key)` shows, or null when the callee is no translator the guard can read. `keys` picks the
     *  table entries read (default: the key and all its plural forms). */
    resolve(callee: ts.Expression, k: string, keys: (j: Json) => readonly string[] = () => formsOf(k)): string[] | null {
      const tr = translatorOf(callee);
      if (tr === null) return null;
      if (tr !== 'owner') {
        const v = textsOf(tr, keys(tr));
        return v.length ? v : null;
      }
      // The candidates are the tables holding any form of the key; each one's answer counts, none included, so tables
      // that disagree on what the call shows leave it unread.
      const found = new Set(
        [...own.values(), ...owner].filter((j) => textsIn(j, k).length).map((j) => JSON.stringify(textsOf(j, keys(j)))),
      );
      const only = found.size === 1 ? (JSON.parse([...found][0]!) as string[]) : [];
      return only.length ? only : null;
    },
  };
}

/** The English texts a title can show: each readable branch and plural form; null for one the guard cannot read. */
function copyOf(e: ts.Expression | undefined, sf: ts.SourceFile, strings: ReturnType<typeof stringsOf>): (string | null)[] {
  if (!e) return [null];
  const x = unwrap(e);
  if (ts.isStringLiteral(x) || ts.isNoSubstitutionTemplateLiteral(x)) return [x.text];
  if (ts.isTemplateExpression(x)) return [x.head.text + x.templateSpans.map((s) => `{{${s.expression.getText(sf)}}}${s.literal.text}`).join('')];
  if (ts.isConditionalExpression(x)) return [...copyOf(x.whenTrue, sf, strings), ...copyOf(x.whenFalse, sf, strings)];
  if (ts.isBinaryExpression(x) && (x.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken || x.operatorToken.kind === ts.SyntaxKind.BarBarToken))
    return [...copyOf(x.left, sf, strings), ...copyOf(x.right, sf, strings)];
  // strings['k'] / strings.k on an imported strings file: that exact key.
  if ((ts.isElementAccessExpression(x) || ts.isPropertyAccessExpression(x)) && ts.isIdentifier(x.expression) && strings.own.has(x.expression.text)) {
    const j = strings.own.get(x.expression.text)!;
    const a = ts.isElementAccessExpression(x) ? unwrap(x.argumentExpression) : null;
    const k = ts.isPropertyAccessExpression(x) ? x.name.text : a && (ts.isStringLiteral(a) || ts.isNoSubstitutionTemplateLiteral(a)) ? a.text : null;
    return [k !== null && typeof j[k] === 'string' ? (j[k] as string) : null];
  }
  // t('k', …), t(c ? 'a' : 'b'): the key(s) read to text by the translator's own table.
  if (ts.isCallExpression(x) && x.arguments[0]) {
    const a = unwrap(x.arguments[0]);
    const read = (s: ts.Expression): (string | null)[] => {
      const u = unwrap(s);
      return (ts.isStringLiteral(u) || ts.isNoSubstitutionTemplateLiteral(u) ? strings.resolve(x.expression, u.text) : null) ?? [null];
    };
    if (ts.isConditionalExpression(a)) return [...read(a.whenTrue), ...read(a.whenFalse)];
    return read(a);
  }
  return [null];
}

/** The entries `lookup` (kit/strings.ts) can read for key k given the call's vars: no count, the key alone; a numeric
 *  literal count, the form English picks for it (else _other, else the key); any other count, every form. */
const EN_PLURAL = new Intl.PluralRules('en');
function formsRead(k: string, count: ts.Expression | undefined): (j: Json) => readonly string[] {
  if (!count) return () => [k];
  const c = unwrap(count);
  if (!ts.isNumericLiteral(c)) return () => formsOf(k);
  const picked = `${k}_${EN_PLURAL.select(Number(c.text))}`;
  return (j) => [typeof j[picked] === 'string' ? picked : typeof j[`${k}_other`] === 'string' ? `${k}_other` : k];
}

/** Whether a title's translator call leaves out a var the text it shows interpolates (the `vars` rule above): each
 *  readable branch is judged, on the entries that call can read; a second argument that is not a plain object
 *  literal with readable keys is not. */
function varsMissing(e: ts.Expression | undefined, sf: ts.SourceFile, strings: ReturnType<typeof stringsOf>): boolean {
  if (!e) return false;
  const x = unwrap(e);
  if (ts.isConditionalExpression(x)) return varsMissing(x.whenTrue, sf, strings) || varsMissing(x.whenFalse, sf, strings);
  if (ts.isBinaryExpression(x) && (x.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken || x.operatorToken.kind === ts.SyntaxKind.BarBarToken))
    return varsMissing(x.left, sf, strings) || varsMissing(x.right, sf, strings);
  if (!ts.isCallExpression(x) || !x.arguments[0]) return false;
  const v = x.arguments[1] && unwrap(x.arguments[1]);
  if (v && (!ts.isObjectLiteralExpression(v) || v.properties.some(ts.isSpreadAssignment) || unreadKey(v))) return false;
  const given = new Set(v ? v.properties.flatMap((q) => (q.name ? [keyOf(q.name)!] : [])) : []);
  const count = v ? propOf(v, 'count') : undefined;
  const a = unwrap(x.arguments[0]);
  const keys = ts.isConditionalExpression(a) ? [a.whenTrue, a.whenFalse].map(unwrap) : [a];
  const texts = keys.flatMap((u) =>
    ts.isStringLiteral(u) || ts.isNoSubstitutionTemplateLiteral(u) ? (strings.resolve(x.expression, u.text, formsRead(u.text, count)) ?? []) : [],
  );
  return texts.some((t) => [...t.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)].some((m) => !given.has(m[1]!)));
}

/** The titles spreads can set, and whether one may set a title the guard cannot see: `...(c ? { title } : {})` and
 *  `...(c && { title })` are read; any other spread, a computed key or a nested spread may set anything. */
function spreadTitles(o: ts.ObjectLiteralExpression): { titles: ts.Expression[]; unread: boolean } {
  const titles: ts.Expression[] = [];
  let unread = false;
  for (const p of o.properties.filter(ts.isSpreadAssignment)) {
    const x = unwrap(p.expression);
    const sides = ts.isConditionalExpression(x)
      ? [x.whenTrue, x.whenFalse]
      : ts.isBinaryExpression(x) && x.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken
        ? [x.right]
        : null;
    if (!sides) {
      unread = true;
      continue;
    }
    for (const side of sides) {
      const u = unwrap(side);
      if (!ts.isObjectLiteralExpression(u) || unreadKey(u) || u.properties.some(ts.isSpreadAssignment)) {
        unread = true;
        continue;
      }
      const t = propOf(u, 'title');
      if (t) titles.push(t);
    }
  }
  return { titles, unread };
}

/** showErrorToast calls handed an ErrorInfo (already normalized) instead of the rejection or its MutationResult: the
 *  info carries no tokenSaid mark, so the page's toast would repeat the shell's (:1050). Read: a
 *  call of errorInfo/infoOf/withOutcome, or a name bound to one or typed ErrorInfo. */
const INFO_MAKERS = new Set(['errorInfo', 'infoOf', 'withOutcome']);
export function infoArgs(file: string, text: string): string[] {
  if (!/\bshowErrorToast\b/.test(text)) return [];
  const sf = parseOnce(file, text);
  const names = toastNames(sf);
  const out: string[] = [];
  const made = (e: ts.Expression | undefined): boolean => {
    if (!e) return false;
    const x = unwrap(e);
    if (ts.isCallExpression(x)) {
      const c = unwrap(x.expression);
      if (ts.isPropertyAccessExpression(c)) return INFO_MAKERS.has(c.name.text);
      if (!ts.isIdentifier(c)) return false;
      if (INFO_MAKERS.has(c.text)) return true;
      // An imported alias (`errorInfo as normalize`) names the maker it imports.
      const b = bindingOf(c);
      return !!b && ts.isImportSpecifier(b) && INFO_MAKERS.has((b.propertyName ?? b.name).text);
    }
    if (ts.isIdentifier(x)) {
      const b = bindingOf(x);
      const typed = (t: string | null | undefined) => !!t && /\bErrorInfo\b/.test(t);
      if (b && ts.isVariableDeclaration(b)) return typed(b.type?.getText(sf)) || made(b.initializer);
      if (b && ts.isParameter(b)) return typed(b.type?.getText(sf));
      // A destructured parameter member typed ErrorInfo (`({ info }: { info: ErrorInfo })`).
      if (b && ts.isBindingElement(b)) {
        let a: ts.Node = b;
        while (a.parent && !ts.isParameter(a)) a = a.parent;
        const key = b.propertyName && ts.isIdentifier(b.propertyName) ? b.propertyName.text : x.text;
        return ts.isParameter(a) && b.parent.parent === a && typed(memberType(a, key, sf));
      }
    }
    return false;
  };
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node)) {
      const callee = unwrap(node.expression);
      const idx = indexName(callee);
      const own = (n: string) => (n === 'showErrorToast' ? n : undefined);
      const fn = ts.isIdentifier(callee) ? names.get(callee.text) : ts.isPropertyAccessExpression(callee) ? own(callee.name.text) : idx !== null ? own(idx) : undefined;
      if (fn === 'showErrorToast' && made(node.arguments[1])) out.push(`${file}:${sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

/** Every toast call's copy in one file, judged against the copy rules (SUBJECT_OK applied by the caller). */
export function copyCalls(file: string, text: string, load: LoadJson, ownerJsons: (file: string) => string[] = () => []): CopyCall[] {
  if (!/\bshow(Error)?Toast\b/.test(text)) return [];
  const sf = parseOnce(file, text);
  const strings = stringsOf(file, sf, load, ownerJsons);
  const names = toastNames(sf);
  const out: CopyCall[] = [];
  const lineOf = (n: ts.Node) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
  const judgeTitle = (titleE: ts.Expression | undefined, at: string, extra: string[]): void => {
    const texts = copyOf(titleE, sf, strings);
    const breaks = new Set(extra);
    if (varsMissing(titleE, sf, strings)) breaks.add('vars');
    for (const t of texts) {
      if (t === null) breaks.add('copyreview');
      else for (const b of copyBreaks(t)) breaks.add(b);
    }
    out.push({ key: `${file}|${titleOf(titleE, sf)}`, at, breaks: [...breaks], texts: texts.map((t) => t ?? '(unread)') });
  };
  const content = (node: ts.CallExpression, c0: ts.Expression | undefined, side: string): void => {
    const at = `${file}:${lineOf(node)}${side}`;
    const c = c0 && unwrap(c0);
    if (c && ts.isConditionalExpression(c)) {
      content(node, c.whenTrue, `${side}a`);
      content(node, c.whenFalse, `${side}b`);
      return;
    }
    if (!c || !ts.isObjectLiteralExpression(c)) {
      out.push({ key: `${file}|${titleOf(c, sf)}`, at, breaks: ['copyreview'], texts: ['(unread)'] });
      return;
    }
    const { tones, read } = tonesOf(propOf(c, 'tone'));
    const said = present(propOf(c, 'body')) || present(propOf(c, 'action'));
    // A spread may carry a body or an action: only a readable call is judged for its fix.
    const plain = read && c.properties.filter(ts.isSpreadAssignment).every((p) => plainSpread(p) && !/\b(body|action)\b/.test(p.getText(sf)));
    const fix = plain && tones.some((t) => t === 'error' || t === 'unknown') && !said ? ['copyfix'] : [];
    const spread = spreadTitles(c);
    // A spread that sets a title fails closed: the call needs a reviewed COPY_REVIEW row, and the
    // spread's title is also judged under its own key, so no waiver of the explicit title covers it.
    judgeTitle(propOf(c, 'title'), at, [...fix, ...(spread.unread || spread.titles.length > 0 || unreadKey(c) ? ['copyreview'] : [])]);
    for (const t of spread.titles) judgeTitle(t, `${at} spread`, []);
  };
  const error = (node: ts.CallExpression): void => {
    const at = `${file}:${lineOf(node)}`;
    const opts = node.arguments[2] && unwrap(node.arguments[2]);
    const lit = !opts || ts.isObjectLiteralExpression(opts) ? (opts as ts.ObjectLiteralExpression | undefined) : null;
    const change = lit ? propOf(lit, 'change') : undefined;
    const isChange = !(change && change.kind === ts.SyntaxKind.FalseKeyword);
    const pendingE = lit ? propOf(lit, 'pendingTitle') : undefined;
    // A spread or an options variable may carry pendingTitle: those go to TONE_REVIEW already, so no 'pending' here.
    const readable = lit !== null && !(lit?.properties.some(ts.isSpreadAssignment) ?? false);
    judgeTitle(node.arguments[0], at, readable && isChange && !present(pendingE) ? ['pending'] : []);
    if (pendingE && present(pendingE)) judgeTitle(pendingE, `${at} pendingTitle`, []);
  };
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node)) {
      const callee = unwrap(node.expression);
      const idx = indexName(callee);
      const own = (n: string) => (n === 'showToast' || n === 'showErrorToast' ? n : undefined);
      const fn = ts.isIdentifier(callee) ? names.get(callee.text) : ts.isPropertyAccessExpression(callee) ? own(callee.name.text) : idx !== null ? own(idx) : undefined;
      if (fn === 'showToast') content(node, node.arguments[0], '');
      else if (fn === 'showErrorToast') error(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

/** Titles with no interpolation that still name their subject: the subject they spell out. */
const SUBJECT_OK: Record<string, string> = {
  "pages/ai/parts/exportMd.term.ts|export.copied":
    "Names the chat the person exported (this chat: the one on screen) and that it was copied as Markdown.",
  "pages/ai/parts/exportMd.term.ts|export.notCopied":
    "Names the chat the person exported (this chat: the one on screen) and that it was not copied.",
  "pages/computers/parts/CreateDrawer.tsx|create.sshNotInstalled":
    "Names the computer the person just created ('The new computer') and its SSH key; the sent name may be the API's make-one-up word, so no name is shown.",
  "pages/files/ReadActions.tsx|ask.whichComputer":
    "Names the link the person followed and the computer it meant, and says nothing was opened.",
  "pages/files/ReadActions.tsx|ask.hidden":
    "Names the link and its pane, and says why nothing was opened (a Preview or an Open terminal here ask alike).",
  "kit/states/openOutside.ts|outside.refused":
    "The subject is the address itself: the copied/shown toast carries the whole URL as its body, and the refusal names \"that address\" the person just chose to open (openOutside.ts, terminal Hub).",
  "kit/states/openOutside.ts|outside.copied|outside.copyIt":
    "The subject is the address itself: the copied/shown toast carries the whole URL as its body, and the refusal names \"that address\" the person just chose to open (openOutside.ts, terminal Hub).",
  "kit/states/openOutside.ts|outside.secretStuck":
    "The subject is the private address the person just chose to open (\"This private address\"); the toast never shows it, so no placeholder carries it (openOutside.ts).",
  "kit/states/openOutside.ts|outside.webOnly":
    "The subject is the page the person just chose to open (\"This page\"); with no web origin known there is no address to show (openOnWeb in openOutside.ts).",
  "kit/agent/ForkMenu.tsx|tm.wholeMade":
    "Names this chat, the whole chat that was (or was not) forked.",
  "kit/agent/ForkMenu.tsx|tm.wholeNone":
    "Names this chat, the whole chat that was (or was not) forked.",
  "kit/agent/ForkMenu.tsx|tm.wholeRefused":
    "Names this chat, the whole chat that was (or was not) forked.",
  "kit/agent/ForkMenu.tsx|tm.wholeUnknown":
    "Names this chat, the whole chat that was (or was not) forked.",
  "kit/perf.ts|perf.on|perf.off":
    "Names Performance mode and whether it is now on or off.",
  "kit/perf.term.ts|perf.on|perf.off":
    "The terminal sibling of kit/perf.ts, same calls and texts: names Performance mode and whether it is now on or off.",
  "pages/ai/parts/EndpointStep.tsx|ep.holdNotKept":
    "Names the pending endpoint.",
  "pages/ai/parts/ConvMenu.tsx|compact.parked|compact.refused":
    "Both texts open with Compact, the action that was not sent.",
  "pages/ai/parts/ConvMenu.tsx|compact.unknown":
    "Opens with Compact, the action that may not have been sent.",
  "pages/board/broadcast/Broadcast.tsx|link.removalFailed":
    "Names the link.",
  "pages/board/broadcast/Broadcast.tsx|link.removalUnknown":
    "Names the link.",
  "pages/board/parts/addLinks.ts|add.bad":
    "Names this Board link.",
  "pages/board/parts/BoardView.tsx|add.full":
    "Names the Board and the Board link's tile.",
  "pages/board/parts/BoardView.tsx|notice.updating":
    "Names the Boards, which are updating from another tab.",
  "pages/board/parts/ProgramView.tsx|notice.updating":
    "Names the Boards, which are updating from another tab.",
  "pages/board/parts/BoardView.tsx|add.listPartial":
    "Names this Board link's computer.",
  "pages/board/parts/BoardView.tsx|add.noNumber":
    "Names a terminal on this computer.",
  "pages/board/parts/BoardView.tsx|add.notFound":
    "Names this Board link.",
  "pages/board/parts/BoardView.tsx|board.keepLoadedOn|board.keepLoadedOff":
    "Names the Board's frames.",
  "pages/board/parts/BoardView.tsx|board.notABoard":
    "Names that file.",
  "pages/board/parts/BoardView.tsx|board.notAdded|full|refusalText(r)":
    "Names the new Board (the readable branch; the others are in COPY_REVIEW).",
  "pages/board/parts/BoardView.tsx|board.unknown":
    "Names the new Board.",
  "pages/board/parts/ProgramView.tsx|board.fullAll|board.fullRealm":
    "Names the realm's 9 Boards (All realms, or the realm by name).",
  "pages/board/parts/ProgramView.tsx|board.notAdded":
    "Names the new Board.",
  "pages/board/parts/ProgramView.tsx|board.unknown":
    "Names the new Board.",
  "pages/board/parts/BoardView.tsx|layout.undoStaleSaid":
    "Names this Board.",
  "pages/board/parts/BoardView.tsx|recent.cleared":
    "Names recent programs.",
  "pages/board/parts/BoardView.tsx|recent.notRestored":
    "Names the cleared list (recent programs) and says nothing was restored.",
  "pages/board/parts/BoardView.tsx|undo.notLast":
    "Names this Board and its last change, and says nothing was undone.",
  "pages/board/parts/BoardView.tsx|tile.closedEmpty|tile.closed|tile.closedIdle":
    "Names the tile or empty slot.",
  "pages/board/parts/ProgramView.tsx|recent.cleared":
    "Names recent programs.",
  "pages/board/parts/ProgramView.tsx|recent.notRestored":
    "Names the cleared list (recent programs) and says nothing was restored.",
  "pages/board/parts/ProgramView.tsx|view.fullPhone|view.full|board.full":
    "Names the Board.",
  "pages/home/widgets/store.ts|add.lost":
    "Names a web widget you added.",
  "pages/home/widgets/store.ts|toast.notKept":
    "Names your web widgets.",
  "pages/keys/parts/ShareDrawer.tsx|share.lateMade":
    "Names a share.",
  "pages/keys/parts/ShareDrawer.tsx|share.latePending":
    "Names a share.",
  "pages/keys/parts/SshTab.tsx|ssh.checkedHolds|ssh.removed":
    "Names the computer and this SSH key.",
  "pages/keys/parts/mint-flow.ts|mint.notSettled":
    "Names the key being made (a create's hold can be moved before the key has a name).",
  "pages/keys/parts/mint-flow.ts|strings[\"mint.lateMade\"]":
    "Names a key.",
  "pages/logs/view.tsx|v.clearFail":
    "Names the saved views.",
  "pages/logs/view.tsx|v.cleared":
    "Names saved views.",
  "pages/notes/holds.ts|toast.holdNotKept":
    "Names the pending note.",
  "pages/notes/view.tsx|toast.downloadTooBig|toast.downloadFailed":
    "Names the note.",
  "pages/notes/view.tsx|toast.downloadedNamed|toast.downloaded":
    "Names the download (of the named note, when it has a title).",
  "pages/scripts/parts/SettingsTab.tsx|delete.linksOff":
    "Names its public links.",
  "pages/scripts/parts/SettingsTab.tsx|delete.linksStopped":
    "Names a public link of this script.",
  "pages/scripts/parts/SettingsTab.tsx|delete.linksUnchecked":
    "Names this script's public links.",
  "pages/scripts/parts/SettingsTab.tsx|delete.testsHeldOlder":
    "Names the script and its saved tests.",
  "pages/scripts/parts/SettingsTab.tsx|delete.testsLeft":
    "Names the script and its saved tests.",
  "pages/scripts/parts/SettingsTab.tsx|delete.testsPending":
    "Names the script and its saved tests.",
  "pages/scripts/parts/SettingsTab.tsx|delete.testsUnread":
    "Names the script and its saved tests.",
  "pages/scripts/new/records.ts|draft.droppedOldest":
    "Names what was dropped: your oldest draft that had no build.",
  "pages/scripts/parts/Building.tsx|build.stopUnknownOn|build.stopUnknown":
    "Names the build (the row Stop was pressed on) and its computer when known.",
  "pages/scripts/parts/Building.tsx|build.discardedRunningOn|build.discardedRunning":
    "Names the build that was discarded and its computer when known.",
  "pages/scripts/parts/Building.tsx|build.discardedLostOn|build.discardedLost":
    "Names the build that was discarded and its computer when known.",
  "pages/scripts/parts/Building.tsx|build.discardRefused":
    "Names the build (the row Discard was pressed on).",
  "pages/scripts/parts/Building.tsx|build.discardedKept":
    "Names what is left: the records of the discarded build still listed.",
  "pages/scripts/parts/Building.tsx|build.discardChangeFailed":
    "Names the change request Discard was pressed on.",
  "pages/scripts/parts/Building.tsx|build.deployUnknownOn|build.deployUnknown":
    "Names the check (the held row's Check again) and the script, and its computer when known.",
  "pages/scripts/parts/runScript.ts|run.checking":
    "Names the earlier run.",
  "pages/scripts/parts/runScript.ts|run.failed":
    "Names the run.",
  "pages/scripts/parts/runScript.ts|run.pending":
    "Names the run.",
  "shell/notices.tsx|notice.offline":
    "Names you (offline) and what the Hub shows.",
  "shell/notices.tsx|notice.realmGone":
    "Names the realm you were using (core's realm-gone notice carries no realm id to interpolate).",
  "shell/notices.tsx|notice.realmNotRestored":
    "Names the realm you last used.",
  "shell/notices.tsx|notice.tokenChanged":
    "Names this shared access.",
  "pages/board/parts/addLinks.ts|add.left":
    "Names the tile (or tiles) from the Board link.",
  "pages/board/parts/BoardView.tsx|add.listFailed":
    "Names the tile (or tiles) from the Board link and your computers.",
  "pages/board/parts/BoardView.tsx|add.listSlow":
    "Names the tile (or tiles) from the Board link and your computers.",
  "pages/board/parts/BoardView.tsx|board.notAdded|full|refusalText(r)#board.full":
    "Names the Board and its 6 tiles.",
  "pages/board/parts/BoardView.tsx|board.notAdded|full|refusalText(r)#board.fullAll":
    "Names All realms' 9 Boards.",
  "pages/board/parts/BoardView.tsx|closed.busy":
    "Names Closed Boards, whose change is still on its way.",
  "pages/board/parts/BoardView.tsx|closeText(t, name, r)#closed.tooBig":
    "Names Closed Boards, which cannot keep the Board (it is shown inside closed.notClosed, which names the Board).",
  "pages/board/parts/BoardView.tsx|said#board.fullAll":
    "Names All realms' 9 Boards.",
  "pages/board/parts/BoardView.tsx|said#closed.gone":
    "Names the Board the Undo or Restore asked for: that Board, no longer in Closed Boards.",
  "pages/board/parts/ClosedBoardsDialog.tsx|closed.busy":
    "Names Closed Boards, whose change is still on its way.",
  "pages/board/parts/BoardView.tsx|rename.lost":
    "Names the name the person was typing (the Rename draft), never its text or the Board's name: both are the value that stopped opening.",
  "pages/board/parts/ClosedBoardsDialog.tsx|closedRefusalText(t, r)#closed.gone":
    "Names the Board asked for: that Board, no longer in Closed Boards.",
  "pages/board/parts/ClosedBoardsDialog.tsx|closedRefusalText(t, r)#closed.notStored":
    "Names the change to Closed Boards that was not confirmed.",
  "pages/board/parts/ClosedBoardsDialog.tsx|closedRefusalText(t, r)#closed.tooBig":
    "Names Closed Boards, which cannot keep it (the entry the change asked for).",
  "pages/board/parts/ClosedBoardsDialog.tsx|closedRefusalText(t, b)#closed.gone":
    "Names the Board asked for: that Board, no longer in Closed Boards.",
  "pages/board/parts/ClosedBoardsDialog.tsx|closedRefusalText(t, b)#closed.notStored":
    "Names the change to Closed Boards that was not confirmed.",
  "pages/board/parts/ClosedBoardsDialog.tsx|closedRefusalText(t, b)#closed.tooBig":
    "Names Closed Boards, which cannot keep it (the entry the change asked for).",
  "pages/board/parts/ClosedBoardsDialog.tsx|closedRefusalText(t, r.r)#closed.gone":
    "Names the Board asked for: that Board, no longer in Closed Boards.",
  "pages/board/parts/ClosedBoardsDialog.tsx|closedRefusalText(t, r.r)#closed.notStored":
    "Names the change to Closed Boards that was not confirmed.",
  "pages/board/parts/ClosedBoardsDialog.tsx|closedRefusalText(t, r.r)#closed.tooBig":
    "Names Closed Boards, which cannot keep it (the entry the change asked for).",
  "pages/board/parts/BoardView.tsx|board.notAdded|full|refusalText(r)#board.sessionsFull":
    "Names this program's session numbers on this computer.",
  "pages/board/parts/BoardView.tsx|text#board.full":
    "Names the Board and its 6 tiles.",
  "pages/board/parts/BoardView.tsx|text#board.fullAll":
    "Names All realms' 9 Boards.",
  "pages/board/parts/BoardView.tsx|text#board.sessionsFull":
    "Names this program's session numbers on this computer.",
  "pages/board/parts/BoardView.tsx|tile.tokenNotSaved":
    "Names the option (or options) that look like sign-in tokens.",
  "pages/board/parts/ProgramView.tsx|tile.tokenNotSaved":
    "Names the option (or options) that look like sign-in tokens.",
  "pages/keys/parts/KeysTab.tsx|outcomeText(t, r, nameOf(k), false)#out.err.AUTH_TOKEN_LIMIT_REACHED":
    "Names your account's keys.",
  "pages/keys/parts/KeysTab.tsx|outcomeText(t, r, nameOf(k), false)#out.err.DUPLICATE_ALIAS":
    "Names your key name.",
  "pages/keys/parts/KeysTab.tsx|outcomeText(t, r, nameOf(k), false)#out.err.TOKEN_CEILING_EXCEEDED":
    "Names the key.",
  "pages/keys/parts/KeysTab.tsx|outcomeText(t, r, nameOf(k), false)#out.err.TOKEN_NOT_FOUND":
    "Names this key.",
  "pages/keys/parts/KeysTab.tsx|outcomeText(t, r, nameOf(k), false)#out.refused.CHANGED":
    "Names this key.",
  "pages/keys/parts/KeysTab.tsx|outcomeText(t, r, nameOf(k), false)#out.refused.CHANGE_FROM_ALL":
    "Names this key.",
  "pages/keys/parts/KeysTab.tsx|outcomeText(t, r, nameOf(k), false)#out.refused.HELD_OTHER":
    "Names another key request of this account.",
  "pages/keys/parts/KeysTab.tsx|outcomeText(t, r, nameOf(k), false)#out.refused.KEY_BUSY":
    "Names this key and its other change.",
  "pages/keys/parts/KeysTab.tsx|outcomeText(t, r, nameOf(k), false)#out.refused.KEY_SENDING":
    "Names another key change.",
  "pages/keys/parts/KeysTab.tsx|outcomeText(t, r, nameOf(k), false)#out.refused.NOT_HERE":
    "Names this key.",
  "pages/keys/parts/KeysTab.tsx|outcomeText(t, r, nameOf(k), false)#out.refused.NO_CHECK":
    "Names this key.",
  "pages/keys/parts/KeysTab.tsx|outcomeText(t, r, nameOf(k), false)#out.refused.NO_KEY":
    "Names this key.",
  "pages/keys/parts/KeysTab.tsx|outcomeText(t, r, nameOf(k), false)#out.refused.NO_SCRUB":
    "Names this page and the key it shows.",
  "pages/keys/parts/KeysTab.tsx|outcomeText(t, r, nameOf(k), false)#out.refused.NO_STORAGE":
    "Names this browser and the request.",
  "pages/keys/parts/KeysTab.tsx|outcomeText(t, r, nameOf(k), false)#out.refused.REALM_SCOPE":
    "Names a key in this realm.",
  "pages/keys/parts/KeysTab.tsx|outcomeText(t, { outcome: \"not_sent\", code }, nameOf(k), false)#out.refused.CHANGED":
    "Names this key.",
  "pages/keys/parts/KeysTab.tsx|outcomeText(t, { outcome: \"not_sent\", code }, nameOf(k), false)#out.refused.CHANGE_FROM_ALL":
    "Names this key.",
  "pages/keys/parts/KeysTab.tsx|outcomeText(t, { outcome: \"not_sent\", code }, nameOf(k), false)#out.refused.HELD_OTHER":
    "Names another key request of this account.",
  "pages/keys/parts/KeysTab.tsx|outcomeText(t, { outcome: \"not_sent\", code }, nameOf(k), false)#out.refused.KEY_BUSY":
    "Names this key and its other change.",
  "pages/keys/parts/KeysTab.tsx|outcomeText(t, { outcome: \"not_sent\", code }, nameOf(k), false)#out.refused.KEY_SENDING":
    "Names another key change.",
  "pages/keys/parts/KeysTab.tsx|outcomeText(t, { outcome: \"not_sent\", code }, nameOf(k), false)#out.refused.NOT_HERE":
    "Names this key.",
  "pages/keys/parts/KeysTab.tsx|outcomeText(t, { outcome: \"not_sent\", code }, nameOf(k), false)#out.refused.NO_CHECK":
    "Names this key.",
  "pages/keys/parts/KeysTab.tsx|outcomeText(t, { outcome: \"not_sent\", code }, nameOf(k), false)#out.refused.NO_KEY":
    "Names this key.",
  "pages/keys/parts/KeysTab.tsx|outcomeText(t, { outcome: \"not_sent\", code }, nameOf(k), false)#out.refused.NO_SCRUB":
    "Names this page and the key it shows.",
  "pages/keys/parts/KeysTab.tsx|outcomeText(t, { outcome: \"not_sent\", code }, nameOf(k), false)#out.refused.NO_STORAGE":
    "Names this browser and the request.",
  "pages/keys/parts/KeysTab.tsx|outcomeText(t, { outcome: \"not_sent\", code }, nameOf(k), false)#out.refused.REALM_SCOPE":
    "Names a key in this realm.",
  "pages/keys/parts/SharedTab.tsx|outcomeText(t, c, nameOf(r), false)#out.err.AUTH_TOKEN_LIMIT_REACHED":
    "Names your account's keys.",
  "pages/keys/parts/SharedTab.tsx|outcomeText(t, c, nameOf(r), false)#out.err.DUPLICATE_ALIAS":
    "Names your key name.",
  "pages/keys/parts/SharedTab.tsx|outcomeText(t, c, nameOf(r), false)#out.err.TOKEN_CEILING_EXCEEDED":
    "Names the key.",
  "pages/keys/parts/SharedTab.tsx|outcomeText(t, c, nameOf(r), false)#out.err.TOKEN_NOT_FOUND":
    "Names this key.",
  "pages/keys/parts/SharedTab.tsx|outcomeText(t, c, nameOf(r), false)#out.refused.CHANGED":
    "Names this key.",
  "pages/keys/parts/SharedTab.tsx|outcomeText(t, c, nameOf(r), false)#out.refused.CHANGE_FROM_ALL":
    "Names this key.",
  "pages/keys/parts/SharedTab.tsx|outcomeText(t, c, nameOf(r), false)#out.refused.HELD_OTHER":
    "Names another key request of this account.",
  "pages/keys/parts/SharedTab.tsx|outcomeText(t, c, nameOf(r), false)#out.refused.KEY_BUSY":
    "Names this key and its other change.",
  "pages/keys/parts/SharedTab.tsx|outcomeText(t, c, nameOf(r), false)#out.refused.KEY_SENDING":
    "Names another key change.",
  "pages/keys/parts/SharedTab.tsx|outcomeText(t, c, nameOf(r), false)#out.refused.NOT_HERE":
    "Names this key.",
  "pages/keys/parts/SharedTab.tsx|outcomeText(t, c, nameOf(r), false)#out.refused.NO_CHECK":
    "Names this key.",
  "pages/keys/parts/SharedTab.tsx|outcomeText(t, c, nameOf(r), false)#out.refused.NO_KEY":
    "Names this key.",
  "pages/keys/parts/SharedTab.tsx|outcomeText(t, c, nameOf(r), false)#out.refused.NO_SCRUB":
    "Names this page and the key it shows.",
  "pages/keys/parts/SharedTab.tsx|outcomeText(t, c, nameOf(r), false)#out.refused.NO_STORAGE":
    "Names this browser and the request.",
  "pages/keys/parts/SharedTab.tsx|outcomeText(t, c, nameOf(r), false)#out.refused.REALM_SCOPE":
    "Names a key in this realm.",
  "pages/keys/parts/SharedTab.tsx|outcomeText(t, { outcome: \"not_sent\", code }, nameOf(r), false)#out.refused.CHANGED":
    "Names this key.",
  "pages/keys/parts/SharedTab.tsx|outcomeText(t, { outcome: \"not_sent\", code }, nameOf(r), false)#out.refused.CHANGE_FROM_ALL":
    "Names this key.",
  "pages/keys/parts/SharedTab.tsx|outcomeText(t, { outcome: \"not_sent\", code }, nameOf(r), false)#out.refused.HELD_OTHER":
    "Names another key request of this account.",
  "pages/keys/parts/SharedTab.tsx|outcomeText(t, { outcome: \"not_sent\", code }, nameOf(r), false)#out.refused.KEY_BUSY":
    "Names this key and its other change.",
  "pages/keys/parts/SharedTab.tsx|outcomeText(t, { outcome: \"not_sent\", code }, nameOf(r), false)#out.refused.KEY_SENDING":
    "Names another key change.",
  "pages/keys/parts/SharedTab.tsx|outcomeText(t, { outcome: \"not_sent\", code }, nameOf(r), false)#out.refused.NOT_HERE":
    "Names this key.",
  "pages/keys/parts/SharedTab.tsx|outcomeText(t, { outcome: \"not_sent\", code }, nameOf(r), false)#out.refused.NO_CHECK":
    "Names this key.",
  "pages/keys/parts/SharedTab.tsx|outcomeText(t, { outcome: \"not_sent\", code }, nameOf(r), false)#out.refused.NO_KEY":
    "Names this key.",
  "pages/keys/parts/SharedTab.tsx|outcomeText(t, { outcome: \"not_sent\", code }, nameOf(r), false)#out.refused.NO_SCRUB":
    "Names this page and the key it shows.",
  "pages/keys/parts/SharedTab.tsx|outcomeText(t, { outcome: \"not_sent\", code }, nameOf(r), false)#out.refused.NO_STORAGE":
    "Names this browser and the request.",
  "pages/keys/parts/SharedTab.tsx|outcomeText(t, { outcome: \"not_sent\", code }, nameOf(r), false)#out.refused.REALM_SCOPE":
    "Names a key in this realm.",
  "pages/scripts/parts/TestTab.tsx|doneText#test.removedToast":
    "Names the test.",
  "pages/scripts/parts/TestTab.tsx|doneText#test.savedToast":
    "Names the test.",
};

/** Titles the guard cannot read to text (a helper, a variable): the strings file and the keys it can show. Each key's
 *  texts are judged as a title is (`<call key>#<key>` in SUBJECT_OK / KNOWN_COPY); `prefix*` names every key that
 *  starts so. `why`: how the title comes to be one of these. */
interface Reviewed {
  strings: string;
  keys: readonly string[];
  why: string;
}
const COPY_REVIEW: Record<string, Reviewed> = {
  'pages/ai/models/claude/copyStore.ts|c.toast.title': {
    strings: 'pages/ai/models/claude/Transfer.strings.en.json',
    keys: ['toast.title'],
    why: "The store has no strings of its own: each copy's toast words are fixed by toastOf in Transfer.tsx when the apply is sent; the title names the subject (login.subject or files.subject: the sign-in or settings copy to a named computer).",
  },
  'pages/board/parts/BoardView.tsx|text': {
    strings: 'pages/board/strings.en.json',
    keys: ['board.full', 'board.fullAll', 'board.fullRealm', 'board.sessionsFull'],
    why: "refusalText(r): the refusal's own sentence (fullRealmText is board.fullAll or board.fullRealm); an empty one shows nothing.",
  },
  'pages/board/parts/BoardView.tsx|title': {
    strings: 'pages/board/strings.en.json',
    keys: ['keyed.boardsFull', 'keyed.boardFull', 'keyed.notAdded'],
    why: "The keyed add's refusal: BOARDS_FULL, BOARD_FULL, else not added.",
  },
  'pages/board/parts/BoardView.tsx|closeText(t, name, r)': {
    strings: 'pages/board/strings.en.json',
    keys: ['closed.changed', 'closed.closeUnknown', 'closed.boardGone', 'closed.notClosedUnconfirmed', 'closed.notClosed', 'closed.tooBig', 'closed.notDone'],
    why: "ClosedBoardsDialog closeText: each refusal of Close in its own words (closed.notClosed's why is closed.tooBig).",
  },
  'pages/board/parts/BoardView.tsx|said': {
    strings: 'pages/board/strings.en.json',
    keys: ['closed.restoredKept', 'closed.restoreUnsaved', 'closed.restoreUnknown', 'closed.gone', 'closed.notRestored', 'board.fullAll', 'board.fullRealm'],
    why: "ClosedBoardsDialog restoreText for Close's Undo and the dialog's Restore: each answer in its own words; BOARDS_FULL shows fullRealmText (board.fullAll or board.fullRealm).",
  },
  'pages/board/parts/ClosedBoardsDialog.tsx|closedRefusalText(t, r)': {
    strings: 'pages/board/strings.en.json',
    keys: ['closed.tooBig', 'closed.gone', 'closed.notStored'],
    why: 'closedRefusalText: HISTORY_FULL, NOT_FOUND, else not confirmed.',
  },
  'pages/board/parts/ClosedBoardsDialog.tsx|closedRefusalText(t, b)': {
    strings: 'pages/board/strings.en.json',
    keys: ['closed.tooBig', 'closed.gone', 'closed.notStored'],
    why: 'closedRefusalText: HISTORY_FULL, NOT_FOUND, else not confirmed.',
  },
  'pages/board/parts/ClosedBoardsDialog.tsx|closedRefusalText(t, r.r)': {
    strings: 'pages/board/strings.en.json',
    keys: ['closed.tooBig', 'closed.gone', 'closed.notStored'],
    why: 'closedRefusalText: HISTORY_FULL, NOT_FOUND, else not confirmed.',
  },
  'pages/board/parts/BoardView.tsx|board.notAdded|full|refusalText(r)': {
    strings: 'pages/board/strings.en.json',
    keys: ['board.full', 'board.fullAll', 'board.fullRealm', 'board.sessionsFull'],
    why: "sayLocked's `full` (fullRealmText) and refusalText(r); board.notAdded is read in the call.",
  },
  'pages/keys/parts/KeysTab.tsx|outcomeText(t, { outcome: "not_sent", code }, nameOf(k), false)': {
    strings: 'pages/keys/strings.en.json',
    keys: ['out.refused.*'],
    why: 'words.ts outcomeText for not_sent: out.refused.<code> (refusedKey).',
  },
  'pages/keys/parts/KeysTab.tsx|outcomeText(t, r, nameOf(k), false)': {
    strings: 'pages/keys/strings.en.json',
    keys: ['out.pending', 'out.refused.*', 'out.err.*'],
    why: 'words.ts outcomeText: out.pending, out.refused.<code> (not_sent, stale), else out.err.<errKey>.',
  },
  'pages/keys/parts/KeysTab.tsx|full': {
    strings: 'pages/keys/strings.en.json',
    keys: ['op.editNoBody', 'op.readFailed', 'op.editNotYet', 'del.notYet', 'op.notYet', 'op.notSettledOf'],
    why: "sayHeld's full text, from its callers in KeysTab.tsx.",
  },
  'pages/keys/parts/SharedTab.tsx|outcomeText(t, { outcome: "not_sent", code }, nameOf(r), false)': {
    strings: 'pages/keys/strings.en.json',
    keys: ['out.refused.*'],
    why: 'words.ts outcomeText for not_sent: out.refused.<code> (refusedKey).',
  },
  'pages/keys/parts/SharedTab.tsx|outcomeText(t, c, nameOf(r), false)': {
    strings: 'pages/keys/strings.en.json',
    keys: ['out.pending', 'out.refused.*', 'out.err.*'],
    why: 'words.ts outcomeText: out.pending, out.refused.<code> (not_sent, stale), else out.err.<errKey>.',
  },
  'pages/keys/parts/SharedTab.tsx|full': {
    strings: 'pages/keys/strings.en.json',
    keys: ['op.notSettledOf', 'op.editNoBody', 'op.readFailed', 'op.editNotYet', 'op.cutList', 'op.notYet'],
    why: "sayOp's full text, from checkShareOp in SharedTab.tsx.",
  },
  'pages/scripts/parts/useEditor.ts|code.saved': {
    strings: 'pages/scripts/strings.en.json',
    keys: ['code.saved'],
    why: "useEditor's `t` is a function-typed parameter; its one caller (Detail.tsx) passes the scripts page's useStrings(strings).",
  },
  'pages/scripts/parts/useEditor.ts|code.restored': {
    strings: 'pages/scripts/strings.en.json',
    keys: ['code.restored'],
    why: "useEditor's `t` is a function-typed parameter; its one caller (Detail.tsx) passes the scripts page's useStrings(strings).",
  },
  'shell/realmParam.shared.tsx|realmParam.unknown': {
    strings: 'shell/strings.en.json',
    keys: ['realmParam.unknown'],
    why: "`tr` comes from latest.current, the hook's useStrings(strings) kept in a ref for the async answer.",
  },
  'pages/scripts/parts/TestTab.tsx|doneText': {
    strings: 'pages/scripts/strings.en.json',
    keys: ['test.savedToast', 'test.removedToast'],
    why: "writeCases' doneText, from its two callers in TestTab.tsx.",
  },
  'kit/pickers/signinLeave.ts|left.title': {
    strings: 'kit/pickers/ProviderSetup.strings.en.json',
    keys: ['left.title'],
    why: "`t` is built on use (a kit module does nothing at load), so the guard cannot follow it: it is makeT(strings) over ProviderSetup's table, and the title names the provider's sign-in.",
  },
};

/** The known copy breaks, `<rule>:<file>|<title>` → the page that fixes it. Only shrinks. */
const KNOWN_COPY: Record<string, string> = {
  "ban:kit/forms/Outcome.pure.ts|outcome.toastTitleOf|outcome.toastTitle":
    "The fallback when a caller passes no subject: SettingRow, Dialog LeaveWatch and FormFooter (kit) and the page callers (Inbox, SshGate, SshForm, BrowserForm) pass usePendingToast's / OutcomeSlot's subject in their toasts.",
  "ban:pages/programs/sandbox/NewProgram.tsx|np.found.once":
    "Copy on the Programs page, fixed with that page",
  "ban:pages/scripts/parts/DeletedDrawer.tsx|code.restored":
    "Copy on the Scripts page, fixed with that page",
  "ban:pages/scripts/parts/MagicPanel.tsx|magic.saved":
    "Copy on the Scripts page, fixed with that page",
  "ban:pages/scripts/parts/SettingsTab.tsx|secrets.saved":
    "Copy on the Scripts page, fixed with that page",
  "ban:pages/scripts/parts/opcheck.ts|check.notSent":
    "Copy on the Scripts page, fixed with that page",
  "ban:pages/scripts/parts/useEditor.ts|code.restored#code.restored":
    "Copy on the Scripts page, fixed with that page",
  "ban:pages/scripts/parts/useEditor.ts|code.saved#code.saved":
    "Copy on the Scripts page, fixed with that page",
  "ban:pages/scripts/parts/runScript.ts|run.started":
    "Copy on the Scripts page, fixed with that page",
  "ban:pages/vault/parts/EditDrawer.tsx|done.saved":
    "Copy on the Vault page, fixed with that page",
  "ban:pages/vault/parts/Entry.tsx|done.deleted":
    "Copy on the Vault page, fixed with that page",
  "copyfix:pages/board/broadcast/Broadcast.tsx|link.removalUnknown":
    "Copy on the Board page, fixed with that page",
  "copyfix:pages/board/parts/BoardView.tsx|board.unknown":
    "Copy on the Board page, fixed with that page",
  "copyfix:pages/board/parts/ProgramView.tsx|board.unknown":
    "Copy on the Board page, fixed with that page; the program view's New Board says the Board view's text",
  "copyfix:pages/scripts/parts/Building.tsx|build.deployUnprovenOn|build.deployUnproven":
    "The fix is in the title (Open the draft and Check there later): an idea's request may still arrive, which only a later Check can tell, and a toast has no action that opens the draft.",
  "copyfix:pages/scripts/parts/Building.tsx|build.deployFoundOn|build.deployFound":
    "The fix is in the title (Open the draft and Check there): the list cannot tell whether the script it found is this deploy's, and a toast has no action that opens the draft.",
  "pending:pages/scripts/parts/runScript.ts|run.failed":
    "Copy on the Scripts page, fixed with that page",
  "subject:kit/forms/Outcome.pure.ts|outcome.toastTitleOf|outcome.toastTitle":
    "The fallback when a caller passes no subject: SettingRow, Dialog LeaveWatch and FormFooter (kit) and the page callers (Inbox, SshGate, SshForm, BrowserForm) pass usePendingToast's / OutcomeSlot's subject in their toasts.",
  "subject:pages/programs/sandbox/NewProgram.tsx|np.found.once":
    "Copy on the Programs page, fixed with that page",
  "subject:pages/scripts/parts/DeletedDrawer.tsx|code.restored":
    "Copy on the Scripts page, fixed with that page",
  "subject:pages/scripts/parts/MagicPanel.tsx|magic.saved":
    "Copy on the Scripts page, fixed with that page",
  "subject:pages/scripts/parts/SettingsTab.tsx|secrets.saved":
    "Copy on the Scripts page, fixed with that page",
  "subject:pages/scripts/parts/opcheck.ts|check.failed":
    "Copy on the Scripts page, fixed with that page",
  "subject:pages/scripts/parts/opcheck.ts|check.notSent":
    "Copy on the Scripts page, fixed with that page",
  "subject:pages/scripts/parts/useEditor.ts|code.restored#code.restored":
    "Copy on the Scripts page, fixed with that page",
  "subject:pages/scripts/parts/useEditor.ts|code.saved#code.saved":
    "Copy on the Scripts page, fixed with that page",
  "subject:pages/scripts/parts/runScript.ts|run.started":
    "Copy on the Scripts page, fixed with that page",
  "subject:pages/vault/parts/EditDrawer.tsx|done.saved":
    "Copy on the Vault page, fixed with that page",
  "subject:pages/vault/parts/Entry.tsx|done.deleted":
    "Copy on the Vault page, fixed with that page",
  "copyreview:pages/ai/parts/ConvMenu.tsx|no":
    "The title is the Rename or Close item's own disabled reason (renameWhy/closeWhy, menu.* strings), shown when a typed /rename or /exit asks for an item that cannot run now; it names why, the command is the person's own typing.",
};

/** Entries more than one call shares → how many (`subject_ok:` / `copy_review:` / `<rule>:` + key): a new call with the
 *  same key changes the count and is read again (as SHARED). */
const COPY_SHARED: Record<string, number> = {
  "subject_ok:kit/agent/ForkMenu.tsx|tm.wholeRefused": 4,
  "subject_ok:kit/perf.ts|perf.on|perf.off": 2,
  "subject_ok:kit/perf.term.ts|perf.on|perf.off": 2,
  "ban:pages/scripts/parts/DeletedDrawer.tsx|code.restored": 2,
  "copy_review:pages/keys/parts/KeysTab.tsx|outcomeText(t, r, nameOf(k), false)": 4,
  "subject:pages/scripts/parts/DeletedDrawer.tsx|code.restored": 2,
  "subject_ok:pages/board/parts/BoardView.tsx|add.full": 2,
  "subject_ok:pages/board/parts/BoardView.tsx|notice.updating": 2,
  "subject_ok:pages/scripts/parts/runScript.ts|run.failed": 3,
};

const JSONS = ALL.filter((f) => /^(pages|kit|shell|ask)\//.test(f) && f.endsWith('.json') && !f.startsWith('kit/gallery/'));
const jsonCache = new Map<string, Json | null>();
const loadJson: LoadJson = (p) => {
  if (!jsonCache.has(p)) {
    let j: Json | null = null;
    try {
      const v = JSON.parse(readFileSync(join(SRC, p), 'utf8')) as unknown;
      j = v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : null;
    } catch {
      j = null;
    }
    jsonCache.set(p, j);
  }
  return jsonCache.get(p) ?? null;
};
/** A file's owner strings: its page's (pages/<id>/), else the kit's, shell's or ask's strings files. */
const ownerJsons = (file: string): string[] => {
  const root = file.startsWith('pages/') ? file.split('/').slice(0, 2).join('/') + '/' : `${file.split('/')[0]}/`;
  return JSONS.filter((j) => j.startsWith(root) && /strings\.en\.json$/.test(j));
};
const called = toastFiles.flatMap(([f, text]) => copyCalls(f, text, loadJson, ownerJsons));
/** The base keys a COPY_REVIEW entry names (plural suffixes folded), and the patterns that name none. */
const reviewedKeys = (r: Reviewed): { keys: string[]; none: string[] } => {
  const j = loadJson(r.strings) ?? {};
  const base = [...new Set(Object.keys(j).map((k) => k.replace(new RegExp(`_(${PLURALS.join('|')})$`), '')))];
  const keys: string[] = [];
  const none: string[] = [];
  for (const k of r.keys) {
    const hit = k.endsWith('*') ? base.filter((b) => b.startsWith(k.slice(0, -1))) : base.filter((b) => b === k);
    if (hit.length === 0) none.push(k);
    keys.push(...hit);
  }
  return { keys: [...new Set(keys)], none };
};
/** Each COPY_REVIEW key's texts, judged as titles. */
const reviewed: CopyCall[] = Object.entries(COPY_REVIEW).flatMap(([key, r]) =>
  reviewedKeys(r).keys.map((k) => {
    const texts = textsIn(loadJson(r.strings) ?? {}, k);
    return { key: `${key}#${k}`, at: 'COPY_REVIEW', breaks: [...new Set(texts.flatMap(copyBreaks))], texts };
  }),
);
const copies = [...called, ...reviewed];
/** A call's open copy breaks: subject is waived by SUBJECT_OK. */
const openCopy = (c: CopyCall) => c.breaks.filter((b) => !(b === 'subject' && SUBJECT_OK[c.key]) && !(b === 'copyreview' && COPY_REVIEW[c.key]));

describe('toast copy names its subject and what happened', () => {
  it('reads the copy of every call', () => {
    expect(called.length).toBe(calls.length + called.filter((c) => c.at.endsWith('pendingTitle') || c.at.endsWith(' spread')).length);
  });

  it('every COPY_REVIEW key is in its strings file', () => {
    expect(Object.entries(COPY_REVIEW).flatMap(([k, r]) => reviewedKeys(r).none.map((n) => `${k}: ${r.strings} ${n}`))).toEqual([]);
  });

  it('every copy break is a KNOWN_COPY entry with an owner', () => {
    const bad = copies.flatMap((c) => openCopy(c).map((b) => `${b}:${c.key}`)).filter((k) => !KNOWN_COPY[k]);
    expect([...new Set(bad)].sort()).toEqual([]);
  });

  it('every list entry still matches a call that needs it', () => {
    const subj = new Set(copies.filter((c) => c.breaks.includes('subject')).map((c) => c.key));
    const rev = new Set(copies.filter((c) => c.breaks.includes('copyreview')).map((c) => c.key));
    const known = new Set(copies.flatMap((c) => openCopy(c).map((b) => `${b}:${c.key}`)));
    expect({
      subject: Object.keys(SUBJECT_OK).filter((k) => !subj.has(k)),
      review: Object.keys(COPY_REVIEW).filter((k) => !rev.has(k)),
      known: Object.keys(KNOWN_COPY).filter((k) => !known.has(k)),
    }).toEqual({ subject: [], review: [], known: [] });
  });

  it('a list entry more than one call shares is pinned in COPY_SHARED with its count', () => {
    const count = new Map<string, number>();
    const bump = (k: string) => count.set(k, (count.get(k) ?? 0) + 1);
    for (const c of copies)
      for (const b of new Set(c.breaks)) {
        if (b === 'subject' && SUBJECT_OK[c.key]) bump(`subject_ok:${c.key}`);
        else if (b === 'copyreview' && COPY_REVIEW[c.key]) bump(`copy_review:${c.key}`);
        else if (KNOWN_COPY[`${b}:${c.key}`]) bump(`${b}:${c.key}`);
      }
    expect(Object.fromEntries([...count].filter(([, n]) => n > 1))).toEqual(COPY_SHARED);
  });

  it('every entry gives a reason', () => {
    const empty = [...Object.entries(SUBJECT_OK), ...Object.entries(COPY_REVIEW).map(([k, r]) => [k, r.why] as const), ...Object.entries(KNOWN_COPY)].filter(([, v]) => v.trim().length < 12);
    expect(empty.map(([k]) => k)).toEqual([]);
  });
});

describe('showErrorToast gets the rejection, never an ErrorInfo (:1050)', () => {
  it('no page hands it an ErrorInfo (the tokenSaid mark would be lost)', () => {
    expect(toastFiles.flatMap(([f, text]) => infoArgs(f, text))).toEqual([]);
  });
  it('fixtures: a maker call, a name bound to one or typed ErrorInfo is found; the rejection or a result is not', () => {
    const at = (body: string) => infoArgs('pages/x/v.tsx', `import { showErrorToast } from '@kit';\nconst f = (e: unknown, r: Result, i: ErrorInfo) => {\n${body}\n};`).length;
    expect(at(`showErrorToast(t('a'), errorInfo(e));`)).toBe(1);
    expect(at(`const info = infoOf(e); showErrorToast(t('a'), info);`)).toBe(1);
    expect(at(`showErrorToast(t('a'), i);`)).toBe(1);
    expect(at(`const x: ErrorInfo = pick(); showErrorToast(t('a'), x);`)).toBe(1);
    expect(at(`showErrorToast(t('a'), e); showErrorToast(t('a'), r, { check });`)).toBe(0);
    const alias = (body: string) => infoArgs('pages/x/v.tsx', `import { showErrorToast } from '@kit';\nimport { errorInfo as normalize } from '@core';\n${body}`).length;
    expect(alias(`const f = (e: unknown) => showErrorToast(t('a'), normalize(e));`)).toBe(1);
    expect(alias(`function g({ info }: { info: ErrorInfo }) { showErrorToast(t('a'), info); }`)).toBe(1);
    expect(alias(`function g({ err }: { err: unknown }) { showErrorToast(t('a'), err); }`)).toBe(0);
  });
});

describe('the copy analyser (fixtures)', () => {
  const JS: Record<string, Json> = {
    'pages/x/strings.en.json': {
      gone: 'Deleted.', named: '{{name}} is deleted.', run: 'The run did not start.', pend: 'Deleting {{name}} may have gone through',
      bare: 'This may have gone through', chg: 'This change moved.', chgTo: "This change to your widgets couldn't be kept.",
      n_one: '{{count}} key removed', n_other: '{{count}} keys removed',
      p_one: '{{name}} key removed', p_other: 'Keys removed', o_other: '{{name}} rows', num: 'Row {{0}} removed', dot: 'Removed {{a.b}}',
    },
    'pages/x/other.strings.en.json': { only: 'Saved views removed.', twice: 'A' },
    'pages/x/third.strings.en.json': { twice: 'B' },
    'pages/x/a.strings.en.json': { bye: '{{name}} is deleted.', q: '{{name}} left' },
    'pages/x/b.strings.en.json': { bye: 'Deleted.', one_one: 'Done.', one_other: '{{count}} keys removed', q_one: '{{name}} left' },
  };
  const load: LoadJson = (p) => JS[p] ?? null;
  const owner = (f: string) => (f.startsWith('pages/x/') ? Object.keys(JS) : []);
  const judge = (body: string, imp = "import strings from './strings.en.json';\n") =>
    copyCalls('pages/x/v.tsx', `${imp}const f = (t: T) => { ${body} };`, load, owner).map((c) => `${c.texts.join('|')} ${c.breaks.join(',')}`.trim());

  it('a banned bare title breaks ban and subject; an interpolated one passes', () => {
    expect(judge(`showToast({ title: t('gone'), action: undo })`)).toEqual(['Deleted. ban,subject']);
    expect(judge(`showToast({ title: t('named', { name }) })`)).toEqual(['{{name}} is deleted.']);
  });

  it('a translator call that leaves out a var its text interpolates breaks vars', () => {
    expect(judge(`showToast({ title: t('named') })`)).toEqual(['{{name}} is deleted. vars']);
    expect(judge(`showToast({ title: t('named', { other }) })`)).toEqual(['{{name}} is deleted. vars']);
    expect(judge(`showToast({ title: t('named', { name: x }) })`)).toEqual(['{{name}} is deleted.']);
    expect(judge(`showToast({ title: t('named', { 'name': x }) })`)).toEqual(['{{name}} is deleted.']);
    // A variable or a spread may carry it: not judged.
    expect(judge(`showToast({ title: t('named', opts) })`)).toEqual(['{{name}} is deleted.']);
    expect(judge(`showToast({ title: t('named', { ...opts }) })`)).toEqual(['{{name}} is deleted.']);
    // Every readable branch, plural forms, showErrorToast's title and its pendingTitle.
    expect(judge(`showToast({ title: t(ok ? 'named' : 'gone') })`)).toEqual(['{{name}} is deleted.|Deleted. vars,ban,subject']);
    expect(judge(`showToast({ title: t('named', { name }) ?? t('pend') })`)).toEqual(['{{name}} is deleted.|Deleting {{name}} may have gone through vars']);
    expect(judge(`showToast({ title: ok ? t('gone') : t('named') })`)).toEqual(['Deleted.|{{name}} is deleted. vars,ban,subject']);
    expect(judge(`showErrorToast(t('named'), e, { retry, change: false })`)).toEqual(['{{name}} is deleted. vars']);
    expect(judge(`showErrorToast(t('pend', { name }), e, { retry, check, pendingTitle: t('pend') })`)).toEqual(['Deleting {{name}} may have gone through', 'Deleting {{name}} may have gone through vars']);
    // A text with no placeholder needs no vars.
    expect(judge(`showToast({ title: t('chgTo') })`)).toEqual(["This change to your widgets couldn't be kept. subject"]);
  });

  it('vars reads every object key form keyOf reads; a dotted placeholder is one key', () => {
    // Every key form the guard reads (keyOf): computed literal and template, numeric; a dotted name is one key.
    expect(judge(`showToast({ title: t('named', { ['name']: x }) })`)).toEqual(['{{name}} is deleted.']);
    expect(judge('showToast({ title: t(\'named\', { [`name`]: x }) })')).toEqual(['{{name}} is deleted.']);
    expect(judge(`showToast({ title: t('named', { ['other']: x }) })`)).toEqual(['{{name}} is deleted. vars']);
    expect(judge(`showToast({ title: t('num', { 0: x }) })`)).toEqual(['Row {{0}} removed']);
    expect(judge(`showToast({ title: t('num', { 1: x }) })`)).toEqual(['Row {{0}} removed vars']);
    expect(judge(`showToast({ title: t('dot', { 'a.b': x }) })`)).toEqual(['Removed {{a.b}}']);
    expect(judge(`showToast({ title: t('dot', { a: x }) })`)).toEqual(['Removed {{a.b}} vars']);
  });

  it('vars judges only the entries lookup can read for the call', () => {
    // As lookup reads them: no count reads the key alone (here none: the toast shows 'n', no placeholder); a literal
    // count reads the form English picks; any other count may read every form.
    expect(judge(`showToast({ title: t('n') })`)).toEqual(['{{count}} key removed|{{count}} keys removed']);
    expect(judge(`showToast({ title: t('p', { count: 2 }) })`)).toEqual(['{{name}} key removed|Keys removed subject']);
    expect(judge(`showToast({ title: t('p', { count: 1 }) })`)).toEqual(['{{name}} key removed|Keys removed vars,subject']);
    expect(judge(`showToast({ title: t('p', { count }) })`)).toEqual(['{{name}} key removed|Keys removed vars,subject']);
    expect(judge(`showToast({ title: t('p', { count, name }) })`)).toEqual(['{{name}} key removed|Keys removed subject']);
    expect(judge(`showToast({ title: t('p') })`)).toEqual(['{{name}} key removed|Keys removed subject']);
    // A picked form the table lacks falls back to _other, as lookup does.
    expect(judge(`showToast({ title: t('o', { count: 1 }) })`)).toEqual(['{{name}} rows vars']);
  });

  it('vars gives no verdict when the owner tables a call may read disagree on what it shows', () => {
    // a.strings has q, b.strings only q_one: with no count, a shows '{{name}} left' and b shows 'q'. The words agree.
    expect(judge(`showToast({ title: t('q') })`, '')).toEqual(['{{name}} left']);
    // With count 1 both show '{{name}} left' (a by falling back to q): one answer, judged.
    expect(judge(`showToast({ title: t('q', { count: 1 }) })`, '')).toEqual(['{{name}} left vars']);
  });

  it('a subjectless opening is banned; one that names its subject is not', () => {
    expect(judge(`showToast({ title: t('bare'), tone: 'unknown', action: check })`)).toEqual(['This may have gone through ban,subject']);
    expect(judge(`showToast({ title: t('chg'), tone: 'warn' })`)).toEqual(['This change moved. ban,subject']);
    expect(judge(`showToast({ title: t('chgTo'), tone: 'warn' })`)).toEqual(["This change to your widgets couldn't be kept. subject"]);
    expect(judge(`showToast({ title: t('pend', { name }), tone: 'unknown', action: check })`)).toEqual(['Deleting {{name}} may have gone through']);
  });

  it('a plural key reads its _other form; a key with no own import reads its page strings when they agree', () => {
    expect(judge(`showToast({ title: t('n', { count }) })`)).toEqual(['{{count}} key removed|{{count}} keys removed']);
    expect(judge(`showToast({ title: t('only') })`, '')).toEqual(['Saved views removed. subject']);
    expect(judge(`showToast({ title: t('twice') })`, '')).toEqual(['(unread) copyreview']);
    expect(judge(`showToast({ title: label })`)).toEqual(['(unread) copyreview']);
  });

  it('each readable branch is judged, plain and template text too', () => {
    expect(judge(`showToast({ title: t(ok ? 'named' : 'gone', { name }) })`)).toEqual(['{{name}} is deleted.|Deleted. ban,subject']);
    expect(judge(`showToast({ title: 'Done' })`)).toEqual(['Done ban,subject']);
    expect(judge('showToast({ title: `${name} is gone` })')).toEqual(['{{name}} is gone']);
    expect(judge(`showToast({ title: strings['run'] })`)).toEqual(['The run did not start. subject']);
  });

  it('an error or unknown toast with neither body nor action breaks copyfix; a warn needs no fix', () => {
    expect(judge(`showToast({ title: t('named', { name }), tone: 'error' })`)).toEqual(['{{name}} is deleted. copyfix']);
    expect(judge(`showToast({ title: t('named', { name }), tone: 'error', body: t('run') })`)).toEqual(['{{name}} is deleted.']);
    expect(judge(`showToast({ title: t('named', { name }), tone: 'warn' })`)).toEqual(['{{name}} is deleted.']);
  });

  it('showErrorToast for a change needs pendingTitle, which is judged too; change: false needs none', () => {
    expect(judge(`showErrorToast(t('named', { name }), e, { retry, check })`)).toEqual(['{{name}} is deleted. pending']);
    expect(judge(`showErrorToast(t('named', { name }), e)`)).toEqual(['{{name}} is deleted. pending']);
    expect(judge(`showErrorToast(t('named', { name }), e, { retry, change: false })`)).toEqual(['{{name}} is deleted.']);
    expect(judge(`showErrorToast(t('named', { name }), e, { retry, check, pendingTitle: t('bare') })`)).toEqual(['{{name}} is deleted.', 'This may have gone through ban,subject']);
    expect(judge(`showErrorToast(t('named', { name }), e, { retry, check, pendingTitle: t('pend', { name }) })`)).toEqual(['{{name}} is deleted.', 'Deleting {{name}} may have gone through']);
    // Options the guard cannot read go to TONE_REVIEW; no pending verdict on them.
    expect(judge(`showErrorToast(t('named', { name }), e, opts)`)).toEqual(['{{name}} is deleted.']);
  });

  it('a title a spread sets is judged too; a spread the guard cannot read needs COPY_REVIEW', () => {
    expect(judge(`showToast({ title: t('named', { name }), ...(logs ? { title: 'Done' } : {}) })`)).toEqual(['{{name}} is deleted. copyreview', 'Done ban,subject']);
    expect(judge(`showToast({ title: t('named', { name }), ...(logs && { title: t('gone') }) })`)).toEqual(['{{name}} is deleted. copyreview', 'Deleted. ban,subject']);
    expect(judge(`showToast({ title: t('named', { name }), ...opts })`)).toEqual(['{{name}} is deleted. copyreview']);
    expect(judge(`showToast({ title: t('named', { name }), ...(c ? { [k]: 'Done' } : {}) })`)).toEqual(['{{name}} is deleted. copyreview']);
    expect(judge(`showToast({ title: t('named', { name }), ...(c ? { action: undo } : {}) })`)).toEqual(['{{name}} is deleted.']);
  });
  it('a title a getter or method sets, spread or not, needs COPY_REVIEW (:1075)', () => {
    expect(judge(`showToast({ title: t('named', { name }), ...(c ? { get title() { return 'Done.'; } } : {}) })`)).toEqual(['{{name}} is deleted. copyreview']);
    expect(judge(`showToast({ title: t('named', { name }), ...(c && { title() { return 'Done.'; } }) })`)).toEqual(['{{name}} is deleted. copyreview']);
    expect(judge(`showToast({ get title() { return 'Done.'; } })`)).toEqual(['(unread) copyreview']);
    expect(judge(`showToast({ title: t('named', { name }), get body() { return x; } })`)).toEqual(['{{name}} is deleted. copyreview']);
  });

  it('every plural form is judged, not only _other', () => {
    const imp = "import b from './b.strings.en.json';\n";
    expect(judge(`const t = useStrings(b); showToast({ title: t('one', { count }) })`, imp)).toEqual(['Done.|{{count}} keys removed ban,subject']);
  });

  it("a translator reads its own table; another helper is unread", () => {
    const imp = "import a from './a.strings.en.json';\nimport b from './b.strings.en.json';\n";
    expect(judge(`const t = useStrings(b); showToast({ title: t('bye') })`, imp)).toEqual(['Deleted. ban,subject']);
    expect(judge(`const t = makeT(a); showToast({ title: t('bye', { name }) })`, imp)).toEqual(['{{name}} is deleted.']);
    expect(judge(`showToast({ title: makeT(b)('bye') })`, imp)).toEqual(['Deleted. ban,subject']);
    // An unbound t reads every table it can: two that disagree leave it unread.
    expect(judge(`showToast({ title: t('bye') })`, imp)).toEqual(['(unread) copyreview']);
    expect(judge(`showToast({ title: label('named') })`)).toEqual(['(unread) copyreview']);
  });

  it('a callee is read by its own binding: a shadowing parameter or a local function named t is unread', () => {
    const imp = "import a from './a.strings.en.json';\n";
    // A function-typed parameter may be anything, whatever an outer t is.
    expect(judge(`const t = makeT(a); function n(t: (k: string) => string) { showToast({ title: t('named'), action: undo }); }`, imp)).toEqual(['(unread) copyreview']);
    expect(judge(`const t = (k: string) => 'Done.'; showToast({ title: t('named') })`, imp)).toEqual(['(unread) copyreview']);
    expect(judge(`const t = useOther(); showToast({ title: t('named') })`, imp)).toEqual(['(unread) copyreview']);
    // A page hook's translator, a T-typed parameter and a destructured T-typed prop read the owner strings.
    expect(judge(`const t = useT(); showToast({ title: t('named', { name }) })`, imp)).toEqual(['{{name}} is deleted.']);
    expect(judge(`function n({ t }: { t: T }) { showToast({ title: t('only') }); }`, imp)).toEqual(['Saved views removed. subject']);
    expect(judge(`function n(tr: Translate<typeof a>) { showToast({ title: tr('named', { name }) }); }`, imp)).toEqual(['{{name}} is deleted.']);
    // A table argument shadowing an import is not that import.
    expect(judge(`function n(a: typeof b) { const t = makeT(a); showToast({ title: t('bye'), action: undo }); }`, imp)).toEqual(['(unread) copyreview']);
  });

  it("a spread title keeps its own key, so the explicit title's waiver does not cover it", () => {
    const keys = copyCalls('pages/x/v.tsx', `const f = (t: T) => { showToast({ title: t('only'), ...(c ? { title: "Couldn't save." } : {}) }) };`, load, owner).map((c) => `${c.key} ${c.breaks.join(',')}`);
    expect(keys).toEqual(['pages/x/v.tsx|only copyreview,subject', "pages/x/v.tsx|Couldn't save. subject"]);
  });

  it('the banned list reads whole titles, without case or a final period', () => {
    expect(copyBreaks('Saved')).toEqual(['ban', 'subject']);
    expect(copyBreaks('SAVED!')).toEqual(['ban', 'subject']);
    expect(copyBreaks('Saved views removed.')).toEqual(['subject']);
    expect(copyBreaks("It's live.")).toEqual(['ban', 'subject']);
    expect(copyBreaks('It’s live.')).toEqual(['ban', 'subject']);
    expect(copyBreaks("This key doesn't allow that")).toEqual(['ban', 'subject']);
    expect(copyBreaks("{{name}} doesn't allow that")).toEqual([]);
  });
});
