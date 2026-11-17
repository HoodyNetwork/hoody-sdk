// A New Bot create held for a computer this page does not list is freed once that computer is proved gone. The proof is
// the one the Computers page uses for an expired delete (computers/data.ts computerGone): the computer's own read on the
// base host answered 404 under the session the check began in, and that session is still alive and unchanged. A Bot
// made on a deleted computer went with it, so freeing the hold loses nothing a read-back could still prove. Without
// this the hold stayed in Home's Needs-you list and the sign-out count until a warned sign-out: its New Bot can never
// open again, and createBot has no read that proves it.
// Anything else keeps the hold: the computer still there (200), a refusal (403), a lost read, a context that moved,
// and every token session (its calls go to its pinned realm's host, whose 404 proves nothing on the base host). The
// held rows are taken before the read and only they are freed (dismissShown: identity and hold token), so a hold
// that replaced them is not freed. Each computer is checked once per mount of the page.
import { alive, api, capture, changesOverview, defineRoute, fixtureModeActive, useChangesVersion, useRealms } from '@core';
import { useEffect, useRef } from 'react';
import { changeId, useCreateBot } from '../data';

// The computer's own read, on the base host (every realm), as the Computers page reads it.
const computerRead = defineRoute({ method: 'GET', path: '/computers/:id', scope: 'base' });

/** True only when the computer's base-host read answered 404 under the context taken here, still alive. */
export async function goneOnBase(computerId: string): Promise<boolean> {
  const ctx = capture();
  try {
    await api(computerRead, { params: { id: computerId }, ctx });
    return false;
  } catch (e) {
    return (e as { status?: unknown } | null)?.status === 404 && alive(ctx);
  }
}

/** The computers whose New Bot create is held in the realm view `realm` (the holds Home lists), once each. */
export function heldCreateComputers(realm: string): string[] {
  const out: string[] = [];
  for (const c of changesOverview({ realm })) {
    const id = (c.identity as { computerId?: unknown } | null)?.computerId;
    if (!c.held || typeof id !== 'string' || id === '' || out.includes(id)) continue;
    if (c.base === 'l:' + changeId('createBot', { computerId: id })) out.push(id);
  }
  return out;
}

/** One computer's check: its create's holds as they are now, then the read; freed only on the proof. */
function GoneCreate({ computerId }: { computerId: string }) {
  const create = useCreateBot(computerId);
  const asked = useRef(false);
  useEffect(() => {
    if (asked.current) return;
    asked.current = true;
    const rows = create.held() ?? [];
    if (!rows.length) return;
    void goneOnBase(computerId).then((gone) => (gone ? create.dismissShown(rows) : false));
    // Once per mount: the rows and the read belong to this one check.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

/** Mounted by the Bots page with its computers list: a check for each held create whose computer the list does not
 *  show. Nothing while the list is not in, in fixture mode (no holds), or in a token session. */
export function GoneCreates({ listed }: { listed: readonly { id: string }[] | undefined }) {
  useChangesVersion(); // a hold made or freed is read again
  const { selected, pinned } = useRealms();
  if (listed === undefined || pinned !== null || fixtureModeActive()) return null;
  const ids = heldCreateComputers(selected).filter((id) => !listed.some((c) => c.id === id));
  return (
    <>
      {ids.map((id) => (
        <GoneCreate key={id} computerId={id} />
      ))}
    </>
  );
}
