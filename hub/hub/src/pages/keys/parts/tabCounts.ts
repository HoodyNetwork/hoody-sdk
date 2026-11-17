// The tab badges' counts, worked out the way each tab works out its own: the API keys tab's realm total, and the
// Shared access tab's rows (one per share, under the first realm shown that it reaches). The page passes them to
// every tab, so a badge does not vanish when its tab is not the one open. Reads the same cached list the tabs read.
import { useMemo } from "react";
import { capture, useAttemptsVersion } from "@core";
import { useKeyList, useRealm, useRealms, useTemplates } from "../data";
import { catalogue, inRealmCount, normToken, RID } from "../logic";
import { ledgerFor, shareRows } from "../share-logic";

export function useTabCounts(): { keys?: number; shared?: number } {
  const list = useKeyList();
  const templates = useTemplates();
  const realms = useRealms();
  const { realm: sel } = useRealm();
  const attempts = useAttemptsVersion();
  const account = capture().account;
  const cat = useMemo(
    () => (templates.data ? catalogue(templates.data) : null),
    [templates.data],
  );
  return useMemo(() => {
    if (!list.data) return {};
    const now = Date.now();
    const keys = inRealmCount(
      list.data.rows.map((r) => normToken(r, cat, now)),
      sel,
    );
    const scan = RID.test(sel ?? "") ? [sel as string] : (realms ?? []).map((r) => r.id);
    const seen = new Set<string>();
    for (const r of scan)
      for (const x of shareRows(list.data.rows, r, ledgerFor(account, r), now)) seen.add(x.id);
    return { keys, shared: seen.size };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- attempts: core's share holds change the ledgers
  }, [list.data, cat, sel, realms, account, attempts]);
}
