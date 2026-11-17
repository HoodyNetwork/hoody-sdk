// The Ask dock's pure part (split out of ask.ts so the terminal build shares it; the dock's state is in ask.ts): the
// switch, the dock's width bounds, the start message rules and the panel's focus registration. ask.ts re-exports
// every name here. focusFn (the registered focus, a live binding) is for ask.ts.
import type { ComputerRow } from '@core';

/**
 * The one Ask switch: on.
 * Were it off, the dock would never open, open()/toggle() would do nothing, and the shell would hide every Ask entry
 * (top bar, phone tab, ⌘J).
 */
export const ASK_ENABLED: boolean = true;

export const DOCK_MIN = 320;
export const DOCK_MAX = 560;

/** What a page starts the dock with: the question, and which page asked (for the agent's context). */
export interface AskDraft {
  text: string;
  /** A short label of the asking page, its shown title ("Logs"); never a url or a resource id. */
  source?: string;
  /** Send this text as the first message of a NEW conversation (Home's quick ask); the conversation open before
   *  stays in Recent, untouched. Without it the text fills the composer of a new conversation and is not sent. */
  start?: boolean;
  /** Told each time the start's outcome changes (it may be unknown first, then sent). */
  onStart?: (o: AskStartOutcome) => void;
  /** The computer (container id) the start is for: only that computer's panel takes it. Without it: any. */
  computer?: string;
}

/** How a start ended: the agent took it, nothing reached the agent, or it may have (C9: never shown as either). */
export type AskStartOutcome = 'sent' | 'notSent' | 'unknown';

// The Ask panel's focus (src/ask registers it while mounted): pages reach it only through AskDock.focus.
export let focusFn: (() => boolean) | null = null;

/** The Ask panel registers how to focus itself (its gate card, else its composer); null when it unmounts. */
export function setAskFocus(fn: (() => boolean) | null): void {
  focusFn = fn;
}

/** The longest message the agent takes, in characters as the engine counts them (ask/logic MAX_TEXT, textLength;
 *  a test keeps them equal). */
export const ASK_MAX_TEXT = 4000;
// U+2060 (word joiner, invisible) makes the marker unambiguous: it is taken out of every text a person or a page
// hands in (dock starts, page context, the composer), so only startAgentConversation ever writes the marker.
const WJ = '\u2060';
/** Where a page's context starts inside the sent message. The agent reads "Context" as written; the panel shows the
 *  part after it as the message's Context block, never hidden. */
export const ASK_CONTEXT_MARK = `\n\n${WJ}Context${WJ}\n`;
const CLIP_NOTE = '\n[…]';

/** Text a person or a page hands in, with the marker's invisible character taken out (it carries no meaning). */
export function askPlain(text: string): string {
  return text.includes(WJ) ? text.split(WJ).join('') : text;
}

/** Characters as the engine counts them: a surrogate pair is one. */
function chars(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); if (c < 0xd800 || c > 0xdbff) n++; }
  return n;
}
/** The first n characters of s, never splitting a pair. */
function headChars(s: string, n: number): string {
  let i = 0;
  for (let k = 0; k < n && i < s.length; k++) { const c = s.charCodeAt(i); i += c >= 0xd800 && c <= 0xdbff && i + 1 < s.length ? 2 : 1; }
  return s.slice(0, i);
}

/** Where an action's own instructions start inside the sent message, after its one-line title. The agent reads
 *  "Instructions" as written; the panel shows the title as the request and keeps the rest with the context. */
export const ASK_REQUEST_MARK = `\n\n${WJ}Instructions${WJ}\n`;
/** The context marker, plain or naming what the context is ("Context: access rules of 3 computers"). `u`: the label
 *  bound counts characters (code points), as oneLine cuts them, never UTF-16 units. */
const CONTEXT_RE = /\n\n\u2060Context(?:: ([^\n\u2060]{1,120}))?\u2060\n/u;
const contextMark = (label: string): string => (label ? `\n\n${WJ}Context: ${label}${WJ}\n` : ASK_CONTEXT_MARK);
/** The longest title or context label a start carries (characters); a longer one is cut. */
export const ASK_LABEL_MAX = 120;
/** A title or label as it travels: plain, on one line, within ASK_LABEL_MAX. */
function oneLine(text: string | undefined): string {
  return headChars(askPlain(text ?? '').replace(/\s+/g, ' ').trim(), ASK_LABEL_MAX).trim();
}

/** A sent message split into what the person asked and the context a page attached (null when none). */
export function splitAskContext(text: string): { text: string; context: string | null } {
  const m = CONTEXT_RE.exec(text);
  return m ? { text: text.slice(0, m.index), context: text.slice(m.index + m[0].length) } : { text, context: null };
}

/** A sent message as the thread shows it: the request's one-line title when an action gave one, the words (the person's
 *  own, or the action's instructions), and the context a page attached with its label. Nothing is dropped: title, text
 *  and context are all of the message but the markers. */
export interface AskMessage {
  title: string | null;
  text: string;
  context: string | null;
  contextLabel: string | null;
}
export function parseAskMessage(sent: string): AskMessage {
  const m = CONTEXT_RE.exec(sent);
  const head = m ? sent.slice(0, m.index) : sent;
  const context = m ? sent.slice(m.index + m[0].length) : null;
  const i = head.indexOf(ASK_REQUEST_MARK);
  // A title is one line; anything else before the marker is the person's own text, shown whole.
  const title = i > 0 && !head.slice(0, i).includes('\n') ? head.slice(0, i) : null;
  return { title, text: title === null ? head : head.slice(i + ASK_REQUEST_MARK.length), context, contextLabel: m?.[1] ?? null };
}

/** How a start names itself in the thread: sent with it, so every view of the conversation shows the same. */
export interface AskStartNames {
  /** The request in one line ("Check who can open these computers"): the thread shows it in place of the instructions. */
  title?: string;
  /** What the context is, after "Context sent:" ("access rules of 3 computers"). */
  contextLabel?: string;
}

/** The characters left for a start's question and context once its markers, title and context label are counted
 *  (a page sizes its context to this, so the kit never has to cut it). */
export function askStartRoom(o: AskStartNames = {}): number {
  const title = oneLine(o.title);
  return ASK_MAX_TEXT - chars(contextMark(oneLine(o.contextLabel))) - (title ? chars(title) + chars(ASK_REQUEST_MARK) : 0);
}

/** What a page hands startAgentConversation. */
export interface AgentStart {
  /** The person's question: shown, and sent as the new conversation's first message. */
  text: string;
  /** Extra text the page built (what it shows the person): sent with the question and shown under it as Context.
   *  Clipped (marked) so the whole message stays within ASK_MAX_TEXT. */
  context?: string;
  /** The computer to ask on; shown everywhere first when it is another one. Without it: the computer shown now
   *  (none shown: not started). */
  computer?: ComputerRow;
  /** The asking page's shown title ("Access"); never a url or a resource id. */
  source?: string;
  /** Told each time the outcome changes ('unknown' may later become 'sent'). Never re-send on 'unknown'. */
  onStart?: (o: AskStartOutcome) => void;
  /** The request in one line: the thread shows it as your message, with the question and context one press away. */
  title?: string;
  /** What the context is, in a few words: the thread's "Context sent: …" row. */
  contextLabel?: string;
}

/** The message startAgentConversation sends: the question, then the context after ASK_CONTEXT_MARK; null when it
 *  cannot be sent as asked (no question, a question over the limit, or no room left for any of the context; the
 *  context is never dropped silently). A context that does not fit whole is cut at a character and marked. With a
 *  title the message opens with it, then the question after ASK_REQUEST_MARK; a context label rides in the marker. */
export function agentStartText(text: string, context?: string, names: AskStartNames = {}): string | null {
  const ask = askPlain(text).trim();
  const title = oneLine(names.title);
  const q = title && ask ? title + ASK_REQUEST_MARK + ask : ask;
  const c = askPlain(context ?? '').trim();
  if (!q || chars(q) > ASK_MAX_TEXT) return null;
  if (!c) return q;
  const mark = contextMark(oneLine(names.contextLabel));
  const room = ASK_MAX_TEXT - chars(q) - chars(mark);
  if (chars(c) <= room) return q + mark + c;
  const keep = room - chars(CLIP_NOTE);
  if (keep < 1) return null;
  return q + mark + headChars(c, keep) + CLIP_NOTE;
}
