// The open chat's turn-menu item "Remove what follows": a kit TurnItemsHook, so it joins the ONE menu
// on a finished reply (`turnMenuOf(...)`, the slot Fork uses too) without touching it. The capability table decides whether the item
// is offered (`trimCap`: activated, open, no turn running, no waiting approval, something FOLLOWS this reply); the item's words for a
// refusal are the same sentences every surface says (`useWhy`). The confirm and everything after it is TrimDialog.tsx.
//
// A trim that may have gone through is owned by its chat (trimAttempts.ts), not by this menu: while a record exists for the chat the
// item stays available whatever the table says now, because its only job then is Check again (after a real trim the table says "nothing
// follows" on the very reply the record is for, which would otherwise hide the way to settle it).
import { useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { agent } from '@core';
import { showToast, turnMenuOf, useStrings, useWhy, type ConversationSource, type FaqItem, type MenuAction, type TurnItemsHook } from '@kit';
import type { AttemptBlocker } from './attemptBlockers';
import { closeAttempts, type ChatId } from './closeAttempts';
import { deleteAttempts } from './deleteAttempts';
import { renameAttempts } from './renameAttempts';
import { TrimDialog } from './TrimDialog';
import { trimAttempts, type TrimAttempts } from './trimAttempts';
import { trimCap } from './trimGate';
import strings from './TrimItems.strings.en.json';

/** What the item acts on, read at each render: the host's own refs, never a copy captured when the menu was built. */
export interface TrimNow {
  source: ConversationSource;
  /** The chat and computer (with the tab-wide attempt key); null when there is no chat. */
  chat: (ChatId & { key: string }) | null;
  /** The requests to the chat's computer; null when that computer is not shown (nothing is sent). */
  calls: agent.SessionApi | null;
}

export interface TrimHost {
  now(): TrimNow;
  /** A read or the daemon's own result proved the history cut after `turn`. The full identity the trim was made for: reload that
   *  chat only if it is still the one on screen. Fired once per attempt. */
  onTrimmed(chat: ChatId, turn: number): void;
  /** Tests: the attempt records (default: the tab's). */
  attempts?: TrimAttempts;
  /** Tests: the other attempt stores that block a trim (default: the tab's rename, close and delete records). */
  blockers?: readonly AttemptBlocker[];
  /** The page's settle answer and the link's words (Conversation passes them from the AI FAQ): the dialog links it while the trim waits. */
  faqItem?: FaqItem;
  faqLabel?: string;
}

/** The tab's other attempt stores: an unsettled record for the chat in any of them holds a trim back (and the reverse, see ConvMenu). */
const DEFAULT_BLOCKERS: readonly AttemptBlocker[] = [renameAttempts, closeAttempts, deleteAttempts];

// The FAQ item is taken apart in the parameter, so the dialog gets it as a forwarded parameter (the form the FAQ conformance reads).
export function trimItems({ faqItem, faqLabel, ...host }: TrimHost): TurnItemsHook {
  return function useTrimItems(target) {
    const t = useStrings(strings);
    const why = useWhy();
    const attempts = host.attempts ?? trimAttempts;
    const blockers = host.blockers ?? DEFAULT_BLOCKERS;
    useSyncExternalStore(attempts.subscribe, attempts.version, attempts.version);
    const [open, setOpen] = useState(false);
    const { source, chat, calls } = host.now();
    // The capability facts (turn running, waiting approval, finished turns) move with the source.
    useSyncExternalStore(source.subscribe, source.snapshot, source.snapshot);
    const held = chat ? attempts.get(chat.key) : undefined;
    const cap = trimCap(source, target.turn);
    const reason = !chat ? t('trim.noChat') : !calls ? t('trim.noComputer') : !cap.ok ? why(cap) : '';
    const unavailable = held ? '' : reason;
    // Read when the dialog reports, not from the render that built it: the host's chat may have changed by then.
    const onTrimmed = useRef(host.onTrimmed);
    onTrimmed.current = host.onTrimmed;
    const item: MenuAction = {
      id: 'trim',
      label: t('trim.item'),
      description: t('trim.itemDesc'),
      icon: 'trash',
      tone: 'danger',
      opens: true,
      isDisabled: unavailable !== '',
      ...(unavailable !== '' ? { disabledReason: unavailable } : {}),
      onAction: () => setOpen(true),
    };
    return {
      items: [item],
      aside: (
        <TrimDialog
          isOpen={open}
          onClose={() => setOpen(false)}
          chat={chat}
          turn={target.turn}
          calls={calls}
          source={source}
          unavailable={unavailable}
          attempts={attempts}
          blockers={blockers}
          onTrimmed={(c, turn) => { showToast({ title: t('trim.done', { n: String(turn + 1) }), tone: 'ok' }); onTrimmed.current(c, turn); }}
          returnFocus={() => null}
          faqItem={faqItem}
          faqLabel={faqLabel}
        />
      ),
    };
  };
}

/** The turn menu a chat's view takes (`turnMenu`), with this item in it, after the `before` providers (Fork from here comes first).
 *  Built once: the host reads everything through its own refs, and so does every provider given. Returned as an object so the
 *  page-anatomy detector reads the menu as a handle, not as text the page shows. `providers`: the same providers in the menu's
 *  order, for a host that runs an item without the menu (a typed /fork or /trim). */
export function useTrimMenu(host: TrimHost, ...before: readonly TurnItemsHook[]) {
  // eslint-disable-next-line react-hooks/exhaustive-deps -- built once; `host` and the providers read the live state through refs
  return useMemo(() => { const providers = [...before, trimItems(host)]; return { turnMenu: turnMenuOf(...providers), providers }; }, []);
}
