// The realm switchers' refresh of the realm list (computer counts per realm follow rents and
// deletes). Behind ShellData.refreshRealms; live.tsx passes core's generation.
import { loadRealms } from '@core/shell';

// One realm-list read at a time from the switchers. A failed read keeps the counts it had: no error is shown. core's
// load fences a stale answer itself (a realm switch or account change since it began commits nothing), so an open in a
// newer context (`gen`) than the running read's queues one more read for after it, never a second at once.
let realmsRead: { p: Promise<unknown>; gen: number } | null = null;
let realmsAgain: number | null = null;
export function refreshRealms(gen: number): void {
  if (realmsRead) {
    if (realmsRead.gen !== gen) realmsAgain = gen;
    return;
  }
  const mine = { p: loadRealms().then(null, () => null), gen };
  realmsRead = mine;
  void mine.p.finally(() => {
    if (realmsRead !== mine) return;
    realmsRead = null;
    const again = realmsAgain;
    realmsAgain = null;
    if (again !== null) refreshRealms(again);
  });
}
