// links.newProgram (?new=1) as a one-time ask. The page drops the key
// from the URL as soon as it reads it, so Back, a reload or another tab never brings it back. The ask is bound to the
// part shown when it landed (account, realm, computer: the sender made its computer current first) and to the
// Running tab. It is held while the list is not yet shown (loading, a failed read), opens New program once on that part,
// and any later change of part or tab drops it for good. Landing with no computer shown, or on the Apps tab, drops it.
import { useCallback, useEffect, useState } from 'react';

export interface NewAskInput {
  /** The URL value of the key (undefined: absent). */
  param: unknown;
  /** Drops the key from the URL (replace). */
  clearParam: () => void;
  /** The op scope part shown now (account|realm|computer). */
  part: string;
  /** A computer is shown now. */
  hasTarget: boolean;
  /** The page tab now ('apps' or the Running tab). */
  tab: unknown;
}

export interface NewAsk {
  /** New program should open now (on this part, on the Running tab). */
  asked: boolean;
  /** The form took the ask: it never opens again. */
  take: () => void;
}

export function useNewProgramAsk({ param, clearParam, part, hasTarget, tab }: NewAskInput): NewAsk {
  const [ask, setAsk] = useState<string | null>(null);
  const apps = tab === 'apps';
  useEffect(() => {
    if (param === undefined) return;
    clearParam();
    setAsk(String(param) === '1' && hasTarget && !apps ? part : null);
    // Read once per key: the part and tab of the landing are the ones that count.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [param]);
  useEffect(() => {
    if (ask !== null && (ask !== part || apps)) setAsk(null);
  }, [ask, part, apps]);
  const take = useCallback(() => setAsk(null), []);
  return { asked: ask !== null && ask === part && !apps, take };
}
