// TurnRun: runs ONE item of the turn menu (ForkMenu.tsx) without opening the menu, for a host that asks for it another way (a typed
// "/fork 3", "/fork", "/trim 2" in the composer). It never copies an item: it calls the same providers the reply's menu calls, for the
// asked turn, runs the named item once, and stays mounted (keyed on the ask) so what that item opened (Remove what follows' confirm, its
// provider's `aside`) outlives the send. A newer ask replaces it; the host drops the ask when the chat changes.
// Use the reply's own menu (`turnMenuOf`) for a pointer or keyboard press on a reply; this is only for a request made in words.
import { useEffect, useRef } from 'react';
import { runMenuAction, type MenuAction } from '../overlays/Menu';
import type { TurnItems, TurnItemsHook } from './ForkMenu';

/** What a request asks of the turn menu: `fork` with a turn (that reply's Fork), `forkWhole` (the chat's Fork this chat) or `trim` with
 *  a turn (that reply's Remove what follows). `turn` is 0-based, the index a reply block carries. `refused` gets the item's own disabled
 *  reason, or '' when the menu offers no such item. */
export type TurnAskOf = ({ what: 'fork' | 'trim'; turn: number } | { what: 'forkWhole' }) & { refused: (why: string) => void };
/** An ask as the host holds it: `n` names it (a new one replaces the runner). */
export type TurnAsk = TurnAskOf & { n: number };

/** The providers the chat's turn menu is built from: a reply's (in its menu's order) and the whole chat's. */
export interface TurnProviders { reply: readonly TurnItemsHook[]; whole: () => TurnItems }

/** The 1-based turn number typed after a command ("/fork 3"): null when the words are not one whole number from 1. */
export function turnArg(args: string): number | null {
  return /^[1-9]\d{0,5}$/u.test(args) ? Number(args) : null;
}

/** The item each ask runs, by id: a pending fork's item is its Check, as on the reply. */
const IDS: Record<TurnAsk['what'], readonly string[]> = { fork: ['fork', 'fork-check'], forkWhole: ['fork-whole', 'fork-whole-check'], trim: ['trim'] };

/** Runs one ask (none: nothing). `items`: the providers of the chat's turn menu, the same ones its replies' menus are built from. */
export function TurnRun({ ask, items }: { ask: TurnAsk | null; items: TurnProviders }) {
  if (!ask) return null;
  return ask.what === 'forkWhole'
    ? <WholeRun key={ask.n} ask={ask} providers={items} />
    : <ReplyRun key={ask.n} ask={ask} turn={ask.turn} providers={items} />;
}

function ReplyRun({ ask, turn, providers }: { ask: TurnAsk; turn: number; providers: TurnProviders }) {
  // The providers are fixed for the menu's life (hooks): called in the same order on every render, as the reply's menu calls them.
  const sets = providers.reply.map((p) => p({ key: `slash:${ask.n}`, turn }));
  return <Run ask={ask} sets={sets} />;
}

function WholeRun({ ask, providers }: { ask: TurnAsk; providers: TurnProviders }) {
  return <Run ask={ask} sets={[providers.whole()]} />;
}

function Run({ ask, sets }: { ask: TurnAsk; sets: readonly TurnItems[] }) {
  const ids = IDS[ask.what];
  const own = sets.find((x) => x.items.some((i) => ids.includes(i.id)));
  const item: MenuAction | undefined = own?.items.find((i) => ids.includes(i.id));
  // Once per ask, after the render that built the item: the item reads the chat as it is now.
  const ran = useRef(false);
  const now = useRef({ item, refused: ask.refused });
  now.current = { item, refused: ask.refused };
  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const { item: it, refused: say } = now.current;
    if (!it || it.isDisabled) { say(it?.disabledReason ?? ''); return; }
    void runMenuAction(it);
  }, []);
  // Only the run item's provider: what another item would open is never opened here.
  return own?.aside ?? null;
}
