// RowChat: the ⋯ menu of a chat list row: Rename, Close and Delete. A row has no
// ConversationSource and this does not invent one: the items are the three writes whose only judge is the agent (Delete of a chat
// that is open elsewhere answers 409 session_live, which the dialog shows). Rename is allowed by the capability table
// for any chat; Close of a chat that is closed already ends honestly as done (the agent answers "not live" and the proof read
// says nothing is attached), so a row needs no `can()` of its own. Anything the table gates joins once the pane mounts the
// same source factory the open chat uses, never a copy of it.
//
// The dialogs are the open chat's own (RenameDialog.tsx, CloseDialog.tsx, DeleteDialog.tsx), mounted by the list outside the table's menu so they
// survive the menu closing. The attempt records are tab-wide and filed by `attemptKey` (container id, realm, session: never the
// computer's mutable handle), the key ConvMenu builds for the same chat: a rename or close started from a row locks the open
// chat's menu, and the reverse. Every row is sent to ITS OWN computer's target, and every completion carries the full ChatId the
// request was made for: the host acts on that identity only, never on the row object or the chat that is open now.
//
// A dialog that has not sent yet is bound to the list context it opened in (the computer's container and the list's scope): when
// the list moves to another computer or realm, or the row's computer is no longer followed, the dialog closes and its confirm is
// refused. A request that already left keeps its record, its Api and its identity.
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { agent, type Target } from '@core';
import { useStrings, type FaqItem, type RowActionEntry } from '@kit';
import { attemptKey, closeAttempts, type ChatId, type CloseAttempts } from './closeAttempts';
import { CloseDialog } from './CloseDialog';
import { DeleteDialog, type DeletedHow } from './DeleteDialog';
import { deleteAttempts, type DeleteAttempts } from './deleteAttempts';
import { RenameDialog } from './RenameDialog';
import { renameAttempts, type RenameAttempts } from './renameAttempts';
import { trimAttempts, type TrimAttempts } from './trimAttempts';
import type { ChatRow } from './chats.logic';
import strings from './ConvMenu.strings.en.json';

/** Where a row's chat is: its computer's Target and the handle (name.last4) of its chat links. */
export interface RowChatWhere {
  target: Target;
  handle: string;
  /** The list's context (its realm selection): a dialog opened in one scope is refused in another. */
  scope: string;
}

/** Whether a list reading `listRealm` ('all' or one realm) on `listTarget` shows chats of `chat`: the only completions that may
 *  refresh it. A late completion for another computer or another realm refreshes nothing here. */
export const listShows = (listRealm: string, listTarget: string, chat: ChatId): boolean =>
  chat.target === listTarget && (listRealm === 'all' || listRealm === chat.realm);

export interface RowChatOptions {
  /** Where each row's chat is; null: its computer is not shown, so the row has no actions. */
  where: (row: ChatRow) => RowChatWhere | null;
  /** The agent stored this title (null: it cleared it). `chat` is the identity the rename was made for: reload that chat's row. */
  onRenamed?: (name: string | null, chat: ChatId) => void;
  /** A read proved the chat closed. `chat` is the identity the close was made for: reload that chat's row. It stays listed. */
  onClosed?: (chat: ChatId) => void;
  /** A delete settled. `chat` is the identity it was made for: reload that chat's list. 'deleted': the agent said so, the row goes;
   *  'not_found': it could not be found for this caller, so the list is refreshed and nothing is claimed. */
  onDeleted?: (chat: ChatId, how: DeletedHow) => void;
  /** Tests: the requests of a computer (default: `agent.sessionApi(target)`). */
  apiFor?: (target: Target) => agent.SessionApi;
  /** Tests: the attempt records (default: the tab's). */
  attempts?: RenameAttempts;
  closeAttempts?: CloseAttempts;
  deleteAttempts?: DeleteAttempts;
  trimAttempts?: TrimAttempts;
  /** The page's settle answer and the link's words (ChatList passes them from the AI FAQ): each dialog links it while its change waits. */
  faqItem?: FaqItem;
  faqLabel?: string;
}

interface Active {
  kind: 'rename' | 'close' | 'delete';
  chat: ChatId & { key: string };
  row: ChatRow;
  scope: string;
  title: string;
  calls: agent.SessionApi;
  open: boolean;
}

export interface RowChat {
  /** The row's ⋯ menu entries (kit DataTable `actions`). */
  actions: (row: ChatRow) => RowActionEntry[];
  /** The three dialogs; render once, beside the table. */
  dialogs: ReactNode;
}

// The FAQ item is taken apart in the parameter, so each dialog gets it as a forwarded parameter (the form the FAQ conformance reads).
export function useRowChat({ faqItem, faqLabel, ...o }: RowChatOptions): RowChat {
  const t = useStrings(strings);
  const [active, setActive] = useState<Active | null>(null);
  const { where, apiFor } = o;

  const actions = useMemo(() => (row: ChatRow): RowActionEntry[] => {
    const at = where(row);
    if (!at) return [];
    const tid = at.target.container.id;
    const id: ChatId = { computer: at.handle, realm: row.realm, sid: row.sid, target: tid };
    // The same key ConvMenu builds for this chat and target.
    const chat = { key: attemptKey(id), ...id };
    const open = (kind: Active['kind']) => () => setActive({ kind, chat, row, scope: at.scope, title: row.title, calls: apiFor ? apiFor(at.target) : agent.sessionApi(at.target), open: true });
    return [
      { id: 'rename', label: t('menu.rename'), icon: 'pen', opens: true, onAction: open('rename') },
      { id: 'close', label: t('menu.close'), icon: 'x', opens: true, onAction: open('close') },
      '-',
      { id: 'delete', label: t('menu.delete'), icon: 'trash', tone: 'danger', opens: true, onAction: open('delete') },
    ];
  }, [where, apiFor, t]);

  const dismiss = () => setActive((a) => (a ? { ...a, open: false } : a));
  // The context the dialog opened in, asked now (render) and again when its confirm is pressed.
  const stillHere = (a: Active): boolean => {
    const w = where(a.row);
    return !!w && w.target.container.id === a.chat.target && w.scope === a.scope;
  };
  const whereNow = useRef(stillHere);
  whereNow.current = stillHere;
  const unavailable = active && !stillHere(active) ? t('menu.noComputer') : '';
  const allowed = () => (active ? whereNow.current(active) : false);
  const dialogs = active ? (
    <>
      <RenameDialog
        isOpen={active.kind === 'rename' && active.open}
        onClose={dismiss}
        chat={active.chat}
        calls={active.calls}
        allowed={allowed}
        unavailable={unavailable}
        current={active.title}
        attempts={o.attempts ?? renameAttempts}
        blockers={[o.deleteAttempts ?? deleteAttempts, o.trimAttempts ?? trimAttempts, o.closeAttempts ?? closeAttempts]}
        {...(o.onRenamed ? { onRenamed: o.onRenamed } : {})}
        returnFocus={() => null}
        faqItem={faqItem}
        faqLabel={faqLabel}
      />
      <CloseDialog
        isOpen={active.kind === 'close' && active.open}
        onClose={dismiss}
        chat={active.chat}
        calls={active.calls}
        allowed={allowed}
        unavailable={unavailable}
        attempts={o.closeAttempts ?? closeAttempts}
        blockers={[o.deleteAttempts ?? deleteAttempts, o.trimAttempts ?? trimAttempts, o.attempts ?? renameAttempts]}
        {...(o.onClosed ? { onClosed: o.onClosed } : {})}
        returnFocus={() => null}
        faqItem={faqItem}
        faqLabel={faqLabel}
      />
      <DeleteDialog
        isOpen={active.kind === 'delete' && active.open}
        onClose={dismiss}
        chat={active.chat}
        calls={active.calls}
        allowed={allowed}
        unavailable={unavailable}
        attempts={o.deleteAttempts ?? deleteAttempts}
        blockers={[o.attempts ?? renameAttempts, o.closeAttempts ?? closeAttempts, o.trimAttempts ?? trimAttempts]}
        {...(o.onDeleted ? { onDeleted: o.onDeleted } : {})}
        returnFocus={() => null}
        faqItem={faqItem}
        faqLabel={faqLabel}
      />
    </>
  ) : null;
  return { actions, dialogs };
}
