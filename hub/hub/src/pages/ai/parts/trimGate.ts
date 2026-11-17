// Whether "Remove what follows" may be used on the finished reply `turn` (0-based) of this chat right now. The capability table
// answers for the chat (activated, open, no turn running, no waiting approval, at least two finished turns); the reply itself is
// the menu's own check, because the table takes no index: something must FOLLOW this reply. A count the host has not reported
// proves nothing follows, so it is refused too (never guessed).
import type { Capability, ConversationSource } from '@kit';

export function trimCap(source: ConversationSource, turn: number): Capability {
  const base = source.can('trim');
  if (!base.ok) return base;
  if (!Number.isInteger(turn) || turn < 0) return { ok: false, reason: 'missing' };
  const done = source.snapshot().facts.completedTurns;
  if (done === undefined) return { ok: false, reason: 'loading' };
  return turn >= done - 1 ? { ok: false, reason: 'no_later_turn' } : { ok: true };
}
