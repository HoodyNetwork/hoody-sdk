// copyReply: copies a finished reply for a request made in words ("/copy", "/copy 3" in the composer), the typed twin of the reply's
// own Copy button (Reply.tsx). It copies the same text that button copies; only a FINISHED reply counts (one still being written is
// not copied). No words: the last finished reply. A number N: the reply that closes finished turn N (1-based as typed; reply blocks
// carry the 0-based index). Nothing goes to the agent. The host says the outcome in its own words (a typed command has no control
// to turn into "Copied").
// Use the reply's Copy button (or a menu item's `copy:`) for a press; this is only for a request made in words.
import { copyText } from '../data/Ids';
import type { ConvSnapshot } from './source';
import { turnArg } from './TurnRun';

export type CopyReplyPick =
  | { k: 'ok'; text: string; n?: number }
  /** Words that are not one turn number. */
  | { k: 'usage' }
  /** No finished turn N in what the chat shows. */
  | { k: 'none'; n: number }
  /** No finished reply at all. */
  | { k: 'empty' };

/** What a copy request came to: `copied` (with the turn number when one was asked) or `failed` (the clipboard refused), or a pick
 *  that copied nothing. */
export type CopyReplyOutcome = Exclude<CopyReplyPick, { k: 'ok' }> | { k: 'copied'; n?: number } | { k: 'failed' };

/** Which reply a request names, without copying. */
export function pickReplyToCopy(blocks: ConvSnapshot['blocks'], args: string): CopyReplyPick {
  const done = blocks.filter((b): b is Extract<typeof b, { k: 'reply' }> => b.k === 'reply' && b.final && !b.streaming);
  if (!args) {
    const last = done[done.length - 1];
    return last ? { k: 'ok', text: last.text } : { k: 'empty' };
  }
  const n = turnArg(args);
  if (n === null) return { k: 'usage' };
  // The last reply of that turn (a turn may hold more than one reply block; the one that carries the index closes it).
  const hit = done.filter((b) => b.turn === n - 1).pop();
  return hit ? { k: 'ok', text: hit.text, n } : { k: 'none', n };
}

/** Picks the reply a request names and copies it once. */
export async function copyReply(blocks: ConvSnapshot['blocks'], args: string): Promise<CopyReplyOutcome> {
  const pick = pickReplyToCopy(blocks, args);
  if (pick.k !== 'ok') return pick;
  const ok = await copyText(pick.text);
  if (!ok) return { k: 'failed' };
  return pick.n ? { k: 'copied', n: pick.n } : { k: 'copied' };
}
