// forkBand.tsx: this chat's unconfirmed forks as a band at the top of the Ask column, and the one projection of the engine's rows the column and the
// reply menu share. A fork whose answer was lost is a stored record that blocks its reply until a Check proves what became of it; the band is where it is seen
// and checked or hidden when there is no reply menu to reach it (a hidden row is not shown here; the AI page's list shows it, labelled).
// A Check or Hide settling here also tells the page's other fork views (the reply menu, the AI page's list) to read the records again (forkChanged).
// Its rows and toasts, and the reply menu's, link the AI tab's forkUnconfirmed question (useForkFaq): a peek here, the answer itself on the AI page.
import { useMemo, useReducer } from 'react';
import { ForkPending, useStrings, type FaqItem, type ForkRowView } from '@kit';
import { forkChanged } from '@kit/agent/forkList';
import { pageFaq } from '../pages/ai/faq';
import aiStrings from '../pages/ai/strings.en.json';
import { forkOutcome } from './active';
import type { AskEngine } from './engine';
import { useOpenChat } from './links';

/** The unconfirmed forks of this chat (parent === its session), or null when they cannot be read now. */
export function forkViews(eng: AskEngine): readonly ForkRowView[] | null {
  const sid = eng.record?.s ?? null;
  const rows = eng.forkRows();
  if (!rows || !sid) return rows ? [] : null;
  return rows.filter((x) => x.parent === sid).map((x) => ({ k1: x.k1, parent: x.parent, turn: x.turn, bad: x.bad, hidden: x.hidden, mine: x.mine }));
}

/** The AI tab's question about unconfirmed forks, for the band and the reply menu. */
export function useForkFaq(): FaqItem {
  const t = useStrings(aiStrings);
  return useMemo(() => pageFaq(t).byId.forkUnconfirmed, [t]);
}

export function ForkBand({ eng }: { eng: AskEngine }) {
  const open = useOpenChat();
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const faq = useForkFaq();
  const rows = forkViews(eng) ?? [];
  if (rows.length === 0) return null;
  return (
    <ForkPending
      rows={rows}
      check={async (k1) => { try { return forkOutcome(await eng.checkFork(k1)); } finally { bump(); forkChanged(); } }}
      hide={async (k1) => { try { return await eng.hideFork(k1); } finally { bump(); forkChanged(); } }}
      onOpened={(sid) => { const ref = eng.chatRefOf(sid); if (ref) open(ref); }}
      faqItem={faq}
    />
  );
}
