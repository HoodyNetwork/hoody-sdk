// ConvMenu: the chat's own menu, the "⋯" in its header. Rename, Compact now, Export transcript, Close and
// Delete (Close and Delete and their dialogs are CloseDialog.tsx and DeleteDialog.tsx); Fork this chat is the kit's whole-chat item (`forkWhole`), first in the menu. Compact now is the message
// `/compact` through the active door. Every item's enabled state is the capability table's (`source.can`),
// its disabled reason the same sentence every surface says (`useWhy`); nothing is re-derived. Export reads the snapshot the
// person sees, so it works on a read-only chat; Rename is a change and needs an active source.
//
// Rename is RenameDialog.tsx, Close is CloseDialog.tsx and Delete is DeleteDialog.tsx, shared with the chat list's row menu
// (RowChat.tsx): the attempt records are tab-wide, so a rename, close or delete started from a row locks this menu too, and the reverse. This menu hands each dialog the
// open chat's own rule (`allowed`: `source.can(..)`), never a copy of it.
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { agent, hostEnv, type Target } from '@core';
import { ActionMenu, isActive, showToast, useStrings, useWhy, type ConversationSource, type FaqItem, type TurnItems } from '@kit';
import { attemptKey, closeAttempts, type CloseAttempts } from './closeAttempts';
import { CloseDialog } from './CloseDialog';
import { DeleteDialog, type DeletedHow } from './DeleteDialog';
import { deleteAttempts, type DeleteAttempts } from './deleteAttempts';
import { downloadText, exportFileName, exportMarkdown, type ExportWords } from './exportMd';
import { RenameDialog } from './RenameDialog';
import { renameAttempts, type RenameAttempts } from './renameAttempts';
import { trimAttempts, type TrimAttempts } from './trimAttempts';
import type { ChatId } from './closeAttempts';
import strings from './ConvMenu.strings.en.json';

/** The composer's ask to open one of this menu's dialogs (a typed "/rename" or "/exit"). `n` counts asks: each new one is
 *  one open; the same ask given again opens nothing. `seed`: Rename's field starts with it. */
export interface MenuAsk { what: 'rename' | 'close'; n: number; seed?: string }

export interface ConvMenuProps {
  source: ConversationSource;
  /** The computer every request goes to (the top bar's); null when the chat's computer is not shown: nothing is sent. */
  target: Target | null;
  /** The agent stored this title (null: it cleared it, the automatic one shows). The host reloads its chat list. `chat` is the
   *  full identity (computer, realm, session, target) the rename was made for: it may no longer be the chat this menu shows. */
  onRenamed?: (name: string | null, chat: ChatId) => void;
  /** A read proved the chat closed (after the close, or on a Check again). Given the full identity (computer, realm, session,
   *  target) the close was made for, which may no longer be the chat this menu shows: act on that chat only. It stays in the list
   *  and opens again; the host shows it as closed and does not attach it again by itself. */
  onClosed?: (chat: ChatId) => void;
  /** A delete of this chat settled: 'deleted' (the agent said so; the chat is gone, leave it) or 'not_found' (it could not be found for
   *  this caller; refresh, claim nothing). Given the full identity the delete was made for, which may no longer be the chat shown. */
  onDeleted?: (chat: ChatId, how: DeletedHow) => void;
  /** Fork this chat: the kit's whole-chat item, built by the page with the one fork host it shares with a reply's Fork from here. It is a
   *  hook, called every render; a page gives the same function for as long as this menu lives. Absent: the menu has no Fork. */
  forkWhole?: () => TurnItems;
  /** Open Rename or Close as the menu's own items do (the same dialog, the same rule); one that is unavailable says why. */
  ask?: MenuAsk | null;
  /** The ask numbered `n` was handled (opened, or refused with its reason): the page drops it, so a menu mounted again (the chat's
   *  source back after a gap) never replays it. */
  onAskDone?: (n: number) => void;
  /** Tests: the requests. */
  api?: agent.SessionApi;
  /** Tests: where an export goes (file name, text). */
  save?: (name: string, text: string) => void;
  /** Tests: the attempt records (default: the tab's). */
  attempts?: RenameAttempts;
  /** Tests: the close attempt records (default: the tab's). */
  closeAttempts?: CloseAttempts;
  /** Tests: the delete attempt records (default: the tab's). */
  deleteAttempts?: DeleteAttempts;
  /** Tests: the trim attempt records (default: the tab's). */
  trimAttempts?: TrimAttempts;
  /** The page's settle answer and the link's words (Conversation passes them from the AI FAQ): each dialog links it while its change waits. */
  faqItem?: FaqItem;
  faqLabel?: string;
}

const noFork = (): TurnItems => ({ items: [] });

export function ConvMenu({ source, target, onRenamed, onClosed, onDeleted, forkWhole, ask, onAskDone, api, save, attempts = renameAttempts, closeAttempts: closes = closeAttempts, deleteAttempts: deletes = deleteAttempts, trimAttempts: trims = trimAttempts, faqItem, faqLabel }: ConvMenuProps) {
  const t = useStrings(strings);
  const why = useWhy();
  const useForkWhole = forkWhole ?? noFork;
  const fork = useForkWhole();
  const snap = useSyncExternalStore(source.subscribe, source.snapshot, source.snapshot);
  const ref = 'sid' in source.ref ? source.ref : null;
  const calls = useMemo<agent.SessionApi | null>(() => api ?? (target ? agent.sessionApi(target) : null), [api, target]);
  // The chat and computer this menu acts on now: an attempt, and the dialog, belong to the key they were made for.
  const targetId = target?.container.id ?? (api ? 'api' : '');
  const key = ref ? attemptKey({ computer: ref.computer, realm: ref.realm, sid: ref.sid, target: targetId }) : null;
  // The button that opened the menu, kept so focus comes back to it when the dialog closes (the menu item is gone by then).
  const opener = useRef<HTMLElement | null>(null);

  const [renameOpen, setRenameOpen] = useState(false);
  // The latest source, for the code that runs after an await.
  const live = useRef({ source });
  live.current = { source };

  const words = useMemo<ExportWords>(() => ({
    untitled: t('export.untitled'), you: t('export.you'), assistant: t('export.assistant'), earlier: t('export.earlier'), unfinished: t('export.unfinished'),
    cut: (count) => t('export.cut', { count }), attached: (n) => t('export.attached', { name: n }),
    step: { ok: t('export.step.ok'), failed: t('export.step.failed'), running: t('export.step.running'), unknown: t('export.step.unknown') },
    decided: { once: t('export.d.once'), session: t('export.d.session'), deny: t('export.d.deny'), answered: t('export.d.answered'), declined: t('export.d.declined'), elsewhere: t('export.d.elsewhere'), ended: t('export.d.ended') },
  }), [t]);

  const current = (snap.title ?? '').trim();

  const rename = source.can('rename');
  const renameWhy = !ref ? t('menu.noChat') : !rename.ok ? why(rename) : !calls ? t('menu.noComputer') : '';
  const exportable = snap.blocks.length > 0;
  const closeCap = source.can('close');
  const closeWhy = !ref ? t('menu.noChat') : !closeCap.ok ? why(closeCap) : !calls ? t('menu.noComputer') : '';
  const compactCap = source.can('compact');
  const compactWhy = !ref ? t('menu.noChat') : !compactCap.ok ? why(compactCap) : !isActive(source) ? t('menu.readOnly') : '';
  const deleteCap = source.can('delete');
  const deleteWhy = !ref ? t('menu.noChat') : !deleteCap.ok ? why(deleteCap) : !calls ? t('menu.noComputer') : '';
  const [closeOpen, setCloseOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  // An ask from the composer opens the dialog its item opens, under the item's own rule; focus comes back to where it was asked.
  const [seed, setSeed] = useState<string | undefined>(undefined);
  const askSeen = useRef(0);
  const askWhy = useRef({ renameWhy, closeWhy, onAskDone });
  askWhy.current = { renameWhy, closeWhy, onAskDone };
  useEffect(() => {
    if (!ask || ask.n === askSeen.current) return;
    askSeen.current = ask.n;
    askWhy.current.onAskDone?.(ask.n);
    const no = ask.what === 'rename' ? askWhy.current.renameWhy : askWhy.current.closeWhy;
    if (no) { showToast({ title: no, tone: 'warn' /* noDetails: the item's own disabled reason */ }); return; }
    // The element to give the focus back to: a web page's own (no document in the terminal, whose dialogs return focus themselves).
    opener.current = hostEnv().browserPage === true && document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (ask.what === 'rename') { setSeed(ask.seed); setRenameOpen(true); } else setCloseOpen(true);
  }, [ask]);
  const compacting = useRef(false);
  const doExport = () => {
    const text = exportMarkdown(snap, words), file = exportFileName(snap.title, words);
    if (save) save(file, text); else downloadText(file, text);
  };
  const closeChat = useMemo(() => (ref && key ? { key, computer: ref.computer, realm: ref.realm, sid: ref.sid, target: targetId } : null), [ref, key, targetId]);
  // Compact now is a message, `/compact`, through the active door: the engine journals it, queues it like a follow-up while a turn
  // runs, and keeps a lost answer as an unsettled send. Read the capability again when it runs; one press is one send.
  const doCompact = () => {
    const now = live.current.source;
    if (compacting.current || !isActive(now) || !now.can('compact').ok) return;
    compacting.current = true;
    void now.send({ text: '/compact' }).then((o) => {
      if (o.k === 'refused') showToast({ title: o.code === 'gate_parked' ? t('compact.parked') : t('compact.refused'), tone: 'warn' /* noDetails: the outcome has a code, no rejection */ });
      else if (o.k === 'unknown') showToast({ title: t('compact.unknown'), tone: 'warn' /* noDetails: unsettled send, the engine journal owns Check again */ });
    }).finally(() => { compacting.current = false; });
  };

  return (
    <>
      <ActionMenu
        label={t('menu.label')}
        onOpenChange={(o) => { if (o && hostEnv().browserPage === true && document.activeElement instanceof HTMLElement) opener.current = document.activeElement; }}
        items={[
          ...fork.items,
          { id: 'rename', label: t('menu.rename'), icon: 'pen', opens: true, description: t('menu.rename.desc'), isDisabled: renameWhy !== '', disabledReason: renameWhy, onAction: () => { setSeed(undefined); setRenameOpen(true); } },
          { id: 'compact', label: t('menu.compact'), icon: 'minimize', description: t('menu.compact.desc'), isDisabled: compactWhy !== '', disabledReason: compactWhy, onAction: doCompact },
          { id: 'export', label: t('menu.export'), icon: 'download', description: t('menu.export.desc'), isDisabled: !exportable, disabledReason: exportable ? '' : t('menu.nothing'), onAction: doExport },
          { id: 'close', label: t('menu.close'), icon: 'x', opens: true, description: t('menu.close.desc'), isDisabled: closeWhy !== '', disabledReason: closeWhy, onAction: () => setCloseOpen(true) },
          '-',
          { id: 'delete', label: t('menu.delete'), icon: 'trash', tone: 'danger', opens: true, description: t('menu.delete.desc'), isDisabled: deleteWhy !== '', disabledReason: deleteWhy, onAction: () => setDeleteOpen(true) },
        ]}
      />
      <CloseDialog
        isOpen={closeOpen}
        onClose={() => setCloseOpen(false)}
        chat={closeChat}
        calls={calls}
        allowed={() => source.can('close').ok}
        unavailable={closeWhy}
        attempts={closes}
        blockers={[deletes, trims, attempts]}
        onClosed={onClosed}
        returnFocus={() => opener.current}
        faqItem={faqItem}
        faqLabel={faqLabel}
      />
      <DeleteDialog
        isOpen={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        chat={closeChat}
        calls={calls}
        allowed={() => source.can('delete').ok}
        unavailable={deleteWhy}
        attempts={deletes}
        blockers={[attempts, closes, trims]}
        onDeleted={onDeleted}
        returnFocus={() => opener.current}
        faqItem={faqItem}
        faqLabel={faqLabel}
      />
      <RenameDialog
        isOpen={renameOpen}
        onClose={() => setRenameOpen(false)}
        chat={closeChat}
        calls={calls}
        allowed={() => source.can('rename').ok}
        unavailable={renameWhy}
        current={current}
        seed={seed}
        attempts={attempts}
        blockers={[deletes, trims, closes]}
        onRenamed={onRenamed}
        returnFocus={() => opener.current}
        faqItem={faqItem}
        faqLabel={faqLabel}
      />
    </>
  );
}
