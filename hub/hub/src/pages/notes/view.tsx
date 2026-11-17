// The notes page: one table of the recent notes of your computers, grouped by computer, with the selected note open beside it
// (over it on a phone; layout `list-detail`). useDataView owns search, the Computer filter, sort and the URL (?q, ?computer, ?sort,
// ?sel). Each computer's group row carries what Notes there said (and Try again), Open Notes and New note. The Hub reads titles
// only: the note itself is the Notes program's own page for it, shown in a frame (parts/NoteFrame.tsx) or opened in a new tab.
import { computerHandle, filterComputer, hostEnv, isFramed, useAgentScopeFacts, useCore, useCurrentComputer } from '@core';
import { AgentHint, Button, ComputerMark, DataTable, EmptyState, LinkButton, ListDetailPage, Notice, TextButton, createColumnHelper, followPageLink, formatRelative, showErrorToast, showToast, useDataView, useGo, useLiveLocation, usePageLink, useSearchParam, useStrings, type RowActionEntry, type TableGroup, openOutside } from '@kit';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { links as computersLinks } from '../computers/links';
import { shownOf, useApi, useComputers, useNotes } from './data';
import { useInFlight, useNotesKept } from './holds';
import { ID, agentCommand, clean, emptyIsError, emptyKinds, emptyNoneYet, emptyOpenTarget, emptyWays, isDenied, noteLink, noteUrl, type EmptyWay } from './logic';
import { DeleteNote } from './parts/DeleteNote';
import { GroupNote } from './parts/GroupNote';
import { NoteDetail, NoteMissing } from './parts/NoteDetail';
import { NewNote, notesUrl } from './parts/NewNote';
import { removeAttempts, type OnRemoveEnd, type RemoveTarget } from './remove';
import strings from './strings.en.json';
import type { Computer, Me, Row } from './types';
import { useBoardAddEntry } from '../board/links';

/** A computer as the Board's Put on Board takes it. */
const boardComputer = (c: Computer | undefined) => c && { id: c.id, project: c.projectId, server: c.serverName };

const col = createColumnHelper<Row>();
/** A new core generation (account or realm switch) starts the page afresh: the rows and the dialog end with it; held creates stay in the account prefs. */
export default function NotesPage() {
  const { gen } = useCore();
  return <NotesBody key={gen} />;
}

function NotesBody() {
  const t = useStrings(strings);
  const api = useApi();
  const computers = useComputers();
  const shown = useMemo(() => shownOf(computers.data), [computers.data]);
  // A linked note (?sel) on a computer past the first MAX_COMPUTERS: its Notes is read too, for that note only;
  // the table and its groups stay the shown computers'.
  const [selParam] = useSearchParam('sel');
  const selCid = selParam?.split('~')[0];
  const extra = useMemo(() => (selCid && !shown.some((c) => c.id === selCid) ? computers.data?.find((c) => c.id === selCid) : undefined), [selCid, shown, computers.data]);
  const read = useMemo(() => (extra ? [...shown, extra] : shown), [shown, extra]);
  const notes = useNotes(read, api);
  const go = useGo();
  const boardAdd = useBoardAddEntry();
  const computersLink = usePageLink('computers');
  const current = useCurrentComputer();
  // The dialog keeps the place it opened with: reading the computer's notes again must not close it.
  const [adding, setAdding] = useState<{ c: Computer; me: Me; place: { parentId: string; section: string } } | null>(null);

  const { store, keep, release, settle, claim, move, answered } = useNotesKept();
  // The held create of the computer New note is open for has its send out (the Board's New page, any tab).
  const addingOut = useInFlight(adding ? store.holds[adding.c.id] : null);
  const kept = store.computer;
  // The note New note just proved created (its row id, the Notes user it was made as and the title it was made with): it opens at once, while its
  // computer's notes are read again, and its frame takes the focus once.
  const [fresh, setFresh] = useState<{ id: string; userId: string; name: string } | null>(null);
  // The note Delete was pressed on, captured then (its computer, notebook, id and title): the dialog and the delete are its own.
  const [removing, setRemoving] = useState<RemoveTarget | null>(null);

  const byId = useMemo(() => new Map((computers.data ?? []).map((c) => [c.id, c])), [computers.data]);
  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    for (const c of shown) {
      const l = notes.loads[c.id];
      if (l?.state !== 'ok') continue;
      for (const n of l.recent.items) out.push({ id: `${c.id}~${n.id}`, computerId: c.id, computer: c.name, userId: l.me.userId, note: n, title: n.title, section: n.section, at: n.at });
    }
    return out;
  }, [shown, notes.loads]);

  const placeOf = (c: Computer | undefined) => {
    const l = c ? notes.loads[c.id] : undefined;
    return l?.state === 'ok' && l.recent.create ? { me: l.me, place: l.recent.create } : null;
  };
  const reading = shown.some((c) => c.state === 'running' && (!notes.loads[c.id] || notes.loads[c.id]?.state === 'loading'));

  const startNew = (c: Computer | undefined) => {
    const p = placeOf(c);
    if (c && p) setAdding({ c, ...p });
  };
  const openNotes = (c: Computer | undefined) => {
    const u = c ? notesUrl(c) : null;
    if (u) openOutside(u);
  };
  // One note in its own tab: its own address when it can be built, else the computer's Notes.
  const openNote = (r: Row) => {
    const c = byId.get(r.computerId);
    const u = c ? noteUrl(notesUrl(c), r.userId, r.note.id) : null;
    if (u) openOutside(u);
    else openNotes(c);
  };
  const download = async (r: Row) => {
    const c = byId.get(r.computerId);
    const l = c ? notes.loads[c.id] : undefined;
    if (!c || l?.state !== 'ok') return;
    const d = await api.download(c, l.me.notebookId, r.note);
    if (d === 'saved') showToast({ title: clean(r.title, 80) ? t('toast.downloadedNamed', { title: clean(r.title, 80) }) : t('toast.downloaded'), tone: 'ok' });
    // Each error carries its fix: a note too big for a download still opens in its own tab; a failed download (a read,
    // nothing changed) can simply be tried again.
    else if (d !== 'dropped') {
      const fix = d === 'tooBig' ? { label: t('action.openNote'), onAction: () => openNote(r) } : { label: t('action.tryAgain'), onAction: () => { void download(r); } };
      showToast({ title: t(d === 'tooBig' ? 'toast.downloadTooBig' : 'toast.downloadFailed'), body: clean(r.title, 80), tone: 'error', action: fix });
    }
  };

  const columns = useMemo(
    () => [
      col.accessor('title', { header: t('col.title'), meta: { pinned: true, size: 'fill', label: t('col.title') }, cell: (c) => c.getValue() || '—' }),
      // Measured columns: Section and Changed take their words' width (their declared widths
      // stay their floors), the title takes the rest.
      col.accessor('section', { header: t('col.section'), meta: { width: '180px', size: 'fit', priority: 2, label: t('col.section') } }),
      col.accessor((r) => r.at ?? 0, {
        id: 'at',
        header: t('col.changed'),
        meta: { width: '160px', size: 'fit', fitText: (r: Row) => (r.at === null ? '' : formatRelative(r.at)), priority: 1, label: t('col.changed') },
        cell: (c) => (c.row.original.at === null ? '' : formatRelative(c.row.original.at)),
      }),
    ],
    [t],
  );

  const view = useDataView<Row>({
    rows: computers.data ? rows : undefined,
    columns,
    getRowId: (r) => r.id,
    search: (r) => [r.title, r.section, r.computer],
    filters: [{ id: 'computer', label: t('filter.computer'), value: (r) => r.computerId, options: shown.map((c) => ({ value: c.id, label: c.name, mark: <ComputerMark color={c.color} /> })) }],
    sort: '-at',
    pageSize: 50,
    isLoading: computers.isPending || (reading && rows.length === 0),
    error: computers.error,
  });

  // The computer chosen last time (per account and realm) comes back when the URL names none; the URL always wins.
  // `seen`: the computer the filter held on the last pass; leaving it for nothing is the person choosing "all computers".
  const seen = useRef<string | undefined>(undefined);
  const tried = useRef(false);
  // What the person last chose in the table's own Computer controls (`tableView` below): a computer id, '' for all
  // computers, undefined while they have chosen nothing. A choice is kept the moment it is made, whether or not its URL
  // write ever reaches the page (core applies it over a kept value that arrives later), and the restore's tries bring
  // back only that choice once there is one.
  const chose = useRef<string | undefined>(undefined);
  // Timers only act while mounted (a strict-mode remount must not cancel the one restore that is planned).
  const mounted = useRef(false);
  const live = useLiveLocation();
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const picked = view.filterValue('computer');
  const pick = picked?.kind === 'single' ? picked.value : undefined;
  useEffect(() => {
    if (!computers.data) return;
    // Leaving the page clears its filter from the URL first: that is not a choice of "all computers".
    if (live().pathname !== '/notes') return;
    if (pick !== undefined) {
      // A computer id carried over from another realm names nothing here: drop it, and never keep it as this realm's choice.
      if (!shown.some((c) => c.id === pick)) { view.setFilter('computer', undefined); return; }
      tried.current = true;
      seen.current = pick;
      if (pick !== kept && shown.some((c) => c.id === pick)) keep(pick);
      return;
    }
    if (!tried.current) {
      // The kept scope may arrive after the list; try again when it does.
      if (kept && shown.some((c) => c.id === kept)) {
        tried.current = true;
        // The shell may still be settling the URL after the menu click: ask again until the filter is there. Each try
        // brings back the person's own latest choice if they made one (already kept, `choose` below), else the kept
        // computer: "All computers" chosen before the tries or during them stays, a computer picked whose URL write was
        // lost comes back, and a URL that loses the filter on its own is still asked again.
        for (const ms of [0, 200, 600, 1500, 3000, 6000]) {
          setTimeout(() => {
            const want = chose.current ?? kept;
            const now = live();
            if (want !== '' && mounted.current && now.pathname === '/notes' && !/[?&]computer=/.test(now.searchStr)) view.setFilter('computer', { kind: 'single', value: want });
          }, ms);
        }
      }
      return;
    }
    if (seen.current !== undefined) {
      seen.current = undefined;
      if (kept !== '') keep('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- follows the filter and the list only
  }, [pick, computers.data, kept]);
  const one = pick ? byId.get(pick) : undefined;
  // The agent prompt names the filtered computer, by its id while the list has not answered or failed; with no filter
  // the agent asks which one (filterComputer).
  const agentFilter = filterComputer(pick, one?.id);
  const agentFacts = useAgentScopeFacts(agentFilter.computer, agentFilter.ask);
  // New note goes to the filtered computer, else the current one, else the first that can take a note.
  const target = one ?? (current ? shown.find((c) => c.id === current.container.id) : undefined) ?? shown.find((c) => placeOf(c));
  const can = placeOf(target) !== null;
  // Why New note is off: the computer it would go to is not running or still being read, else its Notes gave no place
  // for a new note; with no such computer, none of them can take one.
  const offReason = (): string => {
    if (!target) return t('new.offAll');
    const l = notes.loads[target.id];
    if (target.state !== 'running') return t('empty.c.off', { names: target.name, count: 1 });
    if (!l || l.state === 'loading') return t('empty.c.reading', { names: target.name });
    return t('new.offHere', { computer: target.name });
  };

  // The list when no computer lists a note: one kit EmptyState, never a hand list.
  // With no computer: "Notes live on your computers" and Get a computer. With computers: a title and one sentence
  // naming them by what their Notes answered (emptyKinds; up to three names, then "and N more"), and the ways on, most
  // useful first (emptyWays): New note, Try again (the ones that gave no whole list), Computers (some aren't running),
  // Open Notes (emptyOpenTarget). The first is the primary, the next the secondary. "No notes yet" and "none of them"
  // only when every computer was read (emptyNoneYet's `unread`: the page reads the first MAX_COMPUTERS).
  const toComputers = computersLink ? () => (computersLink.kind === 'hub' ? go(computersLinks.list) : followPageLink(computersLink, go)) : null;
  const kinds = emptyKinds(shown, notes.loads);
  const names = (cs: readonly Computer[]): string => {
    const [a = '', b = '', c = ''] = cs.map((x) => x.name);
    if (cs.length === 1) return a;
    if (cs.length === 2) return t('empty.n.two', { a, b });
    if (cs.length === 3) return t('empty.n.three', { a, b, c });
    return t('empty.n.more', { a, b, c, count: cs.length - 3 });
  };
  const unread = (computers.data?.length ?? 0) - shown.length;
  const noneYet = emptyNoneYet(kinds, unread);
  // A failed read only when no note is listed: a partial list that still lists notes shows them, without the
  // table's stale-answer band.
  const failedAll = shown.length > 0 && rows.length === 0 && emptyIsError(kinds);
  // Every blocked computer is one only its owner can open up: the empty list says to ask the owner (nothing here helps).
  const allDenied = kinds.blocked.every((c) => isDenied(notes.loads[c.id]));
  const emptyBody = !shown.length
    ? t('empty.body')
    : noneYet
      ? t('empty.allNone')
      : `${kinds.none.length ? `${t('empty.c.none', { names: names(kinds.none), count: kinds.none.length })} ` : ''}${kinds.reading.length ? `${t('empty.c.reading', { names: names(kinds.reading) })} ` : ''}${kinds.failed.length ? `${t('empty.c.failed', { names: names(kinds.failed) })} ` : ''}${kinds.off.length ? `${t('empty.c.off', { names: names(kinds.off), count: kinds.off.length })} ` : ''}${kinds.blocked.length ? t(allDenied ? 'empty.c.denied' : 'empty.c.blocked', { names: names(kinds.blocked) }) : ''}`.trim();
  const openable = emptyOpenTarget(kinds, notes.loads, notesUrl);
  const openUrl = openable ? notesUrl(openable) : null;
  const onNew = can && !isFramed() ? () => startNew(target) : null;
  const ways = shown.length ? emptyWays(kinds, { canNew: onNew !== null, computers: toComputers !== null, open: openUrl !== null }) : [];
  const retry = () => {
    for (const c of kinds.failed) notes.reload(c);
  };
  const way = (w: EmptyWay | undefined, primary: boolean) => {
    if (w === 'new' && onNew) return primary ? <Button variant="primary" icon="plus" onPress={onNew}>{t('action.new')}</Button> : <TextButton icon="plus" onPress={onNew}>{t('action.new')}</TextButton>;
    if (w === 'retry') return primary ? <Button variant="primary" icon="reload" onPress={retry}>{t('action.tryAgain')}</Button> : <TextButton icon="reload" onPress={retry}>{t('action.tryAgain')}</TextButton>;
    if (w === 'computers' && toComputers) return primary ? <Button variant="primary" onPress={toComputers}>{t('action.computers')}</Button> : <TextButton onPress={toComputers}>{t('action.computers')}</TextButton>;
    if (w === 'open' && openUrl) return <LinkButton variant={primary ? 'primary' : 'secondary'} href={openUrl} iconEnd="external">{t('action.openNotes')}</LinkButton>;
    return null;
  };

  // The command palette's New note arrives as ?new=1: open the form once the list and that computer's notes have answered, then drop
  // the key (an answer that gives no place, or a framed Hub, just drops it: the New note button says why it is off).
  const [newParam, setNewParam] = useSearchParam('new');
  useEffect(() => {
    if (newParam === undefined || !computers.data || reading) return;
    if (can && !isFramed() && !adding) startNew(target);
    setNewParam(undefined, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- follows the key and what the form needs
  }, [newParam, computers.data, reading, can]);

  const groups = useMemo<TableGroup[]>(
    () =>
      shown
        .filter((c) => !one || c.id === one.id)
        .map((c) => {
          const l = notes.loads[c.id];
          const count = l?.state === 'ok' ? l.recent.items.length : 0;
          return {
            id: c.id,
            label: c.name,
            showEmpty: true,
            text: <GroupNote part="text" computer={c} load={l} count={count} onRetry={() => notes.reload(c)} onNew={null} />,
            extra: <GroupNote part="actions" computer={c} load={l} count={count} onRetry={() => notes.reload(c)} onNew={placeOf(c) && !isFramed() ? () => startNew(c) : null} />,
          };
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- placeOf reads notes.loads
    [shown, notes.loads, one],
  );

  // Clicking a row opens its note beside the table; the row menu's Open here is that same action.
  const openHere = (r: Row) => view.open(r.id);
  // Copy link and Copy read-only link: the note's own address in its computer's Notes (logic.ts noteLink), the one Open
  // note opens; the read-only item says what read-only means there.
  const baseOf = (r: Row): string | null => {
    const c = byId.get(r.computerId);
    return c ? notesUrl(c) : null;
  };
  // No address (the computer's routing host or the proxy domain unknown): the item stays, disabled with this one reason,
  // which the menu says once for every item it disables.
  const noAddress = () => ({ isDisabled: true, disabledReason: t('action.noAddress') });
  const linkItems = (r: Row): RowActionEntry[] => {
    const base = baseOf(r);
    const link = noteLink(base, r.userId, r.note.id);
    const readOnly = noteLink(base, r.userId, r.note.id, true);
    const no = noAddress();
    return [
      { id: 'copy', label: t('action.copyLink'), icon: 'link', ...(link ? { copy: link } : no), onAction: () => undefined },
      { id: 'copyReadOnly', label: t('action.copyReadOnly'), icon: 'link', ...(readOnly ? { copy: readOnly, description: t('action.copyReadOnlyHint') } : no), onAction: () => undefined },
    ];
  };
  // Copy for an agent: the command an agent on the note's computer runs to read it; the item says what it copies
  // and who can read it, and is disabled with its reason when an id cannot be written as a command (logic.ts agentCommand).
  const agentOf = (r: Row): RowActionEntry[] => {
    const l = notes.loads[r.computerId];
    if (l?.state !== 'ok') return [];
    const cmd = agentCommand(r.computerId, l.me.notebookId, r.note.id);
    return [{
      id: 'agent',
      label: t('action.copyAgent'),
      icon: 'copy',
      ...(cmd ? { copy: cmd, description: t('action.copyAgentHint', { computer: r.computer }) } : { isDisabled: true, disabledReason: t('action.copyAgentNo') }),
      onAction: () => undefined,
    }];
  };
  // Delete: asked in a dialog that names the note (parts/DeleteNote.tsx). A framed Hub sends no change, so it offers none.
  // A note whose delete is on record (sent, answer unknown) opens the same dialog on that record: Check again only.
  const startRemove = (r: Row) => {
    const held = removeAttempts.get(r.id);
    if (held) {
      setRemoving(held.target);
      return;
    }
    const c = byId.get(r.computerId);
    const l = c ? notes.loads[c.id] : undefined;
    if (c && l?.state === 'ok') setRemoving({ key: r.id, computer: c, nb: l.me.notebookId, id: r.note.id, title: clean(r.title, 80) });
  };
  const removeItems = (r: Row): RowActionEntry[] =>
    isFramed() || (notes.loads[r.computerId]?.state !== 'ok' && !removeAttempts.get(r.id)) ? [] : ['-', { id: 'delete', label: t('action.delete'), icon: 'trash', tone: 'danger', opens: true, onAction: () => startRemove(r) }];
  const actions = (r: Row): readonly RowActionEntry[] => {
    return [
    { id: 'here', label: t('action.openHere'), icon: 'arrow-right', onAction: () => openHere(r) },
    // Open note opens the note's address, else the computer's Notes: with no Notes address there is nothing to open.
    { id: 'open', label: t('action.openNote'), icon: 'external', ...(baseOf(r) ? {} : noAddress()), onAction: () => openNote(r) },
    ...linkItems(r),
    ...agentOf(r),
    // Put on Board puts this note, not the whole Notes app: a notes tile on its page.
    ...boardAdd(boardComputer(byId.get(r.computerId)), { program: 'notes', open: { view: 'node', userId: r.userId, nodeId: r.note.id } }),
    // Download saves a file to the device, which only a web page can (core save): a terminal has no such item.
    ...(r.note.hasBody && hostEnv().browserPage === true ? [{ id: 'download', label: t('action.download'), icon: 'download' as const, onAction: () => void download(r) }] : []),
    ...(computersLink && byId.get(r.computerId)
      ? [{
          id: 'computer',
          label: t('action.openComputer'),
          icon: 'computer' as const,
          onAction: () => {
            const c = byId.get(r.computerId);
            if (!c) return;
            if (computersLink.kind === 'hub') go(computersLinks.item(computerHandle(c)));
            else followPageLink(computersLink, go);
          },
        }]
      : []),
    ...removeItems(r),
    ];
  };
  // A delete ended (from the dialog, or from Check again on the toast a closed dialog left). Told through a ref, so an
  // answer that comes late acts on the page as it is then. The dialog closes itself.
  const removeEnd = useRef<OnRemoveEnd>(() => undefined);
  useEffect(() => {
    removeEnd.current = (a, end) => {
      const { target } = a;
      // Every toast names the note: its title, or "This note" for one without a title.
      const note = target.title ? t('delete.noteNamed', { title: target.title }) : t('delete.noteUnnamed');
      if (end === 'removed' || end === 'gone') {
        // The list is read again, and the note stops being the open one. Only Notes' own answer to the delete is "deleted":
        // a note this notebook no longer holds may have been deleted or moved, and the toast says just that.
        notes.reload(target.computer);
        if (view.activeId === target.key) view.open(undefined);
        if (end === 'removed') showToast({ title: t('toast.deleted', { note }), tone: 'ok' });
        else showToast({ title: t('toast.deleteGone', { note }), tone: 'info' });
      } else if (end === 'noNotebook') {
        // Notes cannot find the notebook: nothing is known about the note. The computer's notes are read again.
        notes.reload(target.computer);
        showToast({ title: t('toast.deleteNoNotebook', { note }), tone: 'info' });
      } else if (end === 'there') showToast({ title: t('toast.deleteThere', { note }), tone: 'info' });
      // A refusal the attempt record judged definite (remove.ts: an unknown answer never ends a record), so it is never
      // shown as "may have gone through" (change: false). Try again opens the question again; it sends nothing itself.
      else showErrorToast(t('toast.deleteFailed', { note }), a.err, { retry: { label: t('action.tryAgain'), onAction: () => { setRemoving(target); } }, change: false });
    };
  });
  const onRemoveEnd = useCallback<OnRemoveEnd>((a, end) => removeEnd.current(a, end), []);

  const none = computers.data?.length === 0;
  // While the list holds no note, its empty or error state carries the page's actions (New note among them): the
  // header's New note stands back then, so the screen keeps one accent.
  const listEmpty = rows.length === 0;
  // The Computer filter on one computer with no search: what that computer's Notes answered, not the generic "nothing
  // matches these filters".
  const oneLine = (c: Computer): string => {
    const k = emptyKinds([c], notes.loads);
    if (k.none.length) return t('empty.c.none', { names: c.name, count: 1 });
    if (k.reading.length) return t('empty.c.reading', { names: c.name });
    if (k.failed.length) return t('empty.c.failed', { names: c.name });
    if (k.off.length) return t('empty.c.off', { names: c.name, count: 1 });
    return t(isDenied(notes.loads[c.id]) ? 'empty.c.denied' : 'empty.c.blocked', { names: c.name });
  };
  const noMatch = one && view.q === '' ? oneLine(one) : undefined;
  // That one computer's Notes gave no full list: the table's error state with Try again (reads it again), not "no match".
  const oneFailed = one && view.q === '' && emptyKinds([one], notes.loads).failed.length > 0 ? one : undefined;

  // The selected note (?sel=<computer id>~<note id>) opens beside the table, over it on a phone. A selection the table does not
  // hold is not "gone": the table lists only the recent notes of each computer.
  const unlistedRow = (id: string): Row | undefined => {
    const [cid = '', nid = '', ...rest] = id.split('~');
    const c = byId.get(cid);
    const l = c ? notes.loads[cid] : undefined;
    const userId = l?.state === 'ok' ? l.me.userId : fresh?.id === id ? fresh.userId : undefined;
    if (rest.length || !c || !ID.test(nid) || userId === undefined) return undefined;
    const title = fresh?.id === id ? fresh.name : '';
    return { id, computerId: cid, computer: c.name, userId, note: { id: nid, title, section: '', at: null, hasBody: false }, title, section: '', at: null };
  };
  const sel = view.activeId;
  // A note the list does not hold (a copied link to an older note) still opens when its computer's Notes answered: the note
  // is addressed by its id alone; its title is Notes' own, in the frame.
  const selRow = sel === undefined ? undefined : rows.find((r) => r.id === sel) ?? unlistedRow(sel);
  const selComputer = selRow ? byId.get(selRow.computerId) : undefined;
  const detail =
    selRow && selComputer ? (
      <NoteDetail key={selRow.id} row={selRow} base={notesUrl(selComputer)} onOpenTab={() => openNote(selRow)} menu={actions(selRow).filter((a) => a === '-' || (a.id !== 'open' && a.id !== 'here'))} unlisted={!rows.some((r) => r.id === selRow.id)} focusFrame={fresh?.id === selRow.id} />
    ) : sel !== undefined ? (
      <NoteMissing
        list={{ pending: !computers.data && !computers.isError, failed: !computers.data && computers.isError, error: computers.error }}
        computer={byId.get(sel.split('~')[0] ?? '')}
        load={notes.loads[sel.split('~')[0] ?? '']}
        onRetryList={() => void computers.refetch()}
        onRetry={() => { const c = byId.get(sel.split('~')[0] ?? ''); if (c) notes.reload(c); }}
      />
    ) : null;

  // The table's own controls are the person's: changing the Computer filter there, or Clear all while it holds a
  // computer, records and keeps the person's choice first. The restore and the realm drop go through
  // view.setFilter, never through these.
  const keepNow = useRef(keep);
  useEffect(() => {
    keepNow.current = keep;
  });
  const choose = useCallback((id: string) => {
    chose.current = id;
    keepNow.current(id);
  }, []);
  const chips = useMemo(() => view.chips.map((c) => (c.id === 'computer' ? { ...c, onChange: (raw: string | undefined) => { choose(raw ?? ''); c.onChange(raw); } } : c)), [view.chips, choose]);
  // No running computer's Notes answered: the table's own error state, its sentence naming each computer's answer.
  const tableView = { ...view, chips, error: view.error ?? (failedAll ? kinds.failed : oneFailed ? [oneFailed] : undefined), clearAll: () => { if (pick !== undefined) choose(''); view.clearAll(); } };
  const list = (
    <DataTable
      label={t('table')}
      columns={columns}
      view={tableView}
      onRefresh={() => notes.reloadAll()}
      onRetry={() => (view.error ? void computers.refetch() : oneFailed && !failedAll ? notes.reload(oneFailed) : retry())}
      errorBody={view.error ? undefined : oneFailed && !failedAll ? oneLine(oneFailed) : emptyBody}
      {...(noMatch ? { noMatch } : {})}
      countLabel={(n) => t('count', { count: n })}
      actions={actions}
      onRowAction={openHere}
      groupBy={(r) => r.computerId}
      groups={groups}
      // One header line per computer: its name and count, what Notes said and Open Notes, New note at the end.
      storageKey="notes"
      // No note to list: the kit empty state says what each computer's Notes answered.
      empty={
        <EmptyState
          icon="notes"
          title={!shown.length ? t('empty.title') : noneYet ? t('empty.noneTitle') : t('empty.someTitle')}
          body={emptyBody}
          action={
            !shown.length
              ? toComputers && (
                  <Button variant="primary" onPress={toComputers}>
                    {t('action.getComputer')}
                  </Button>
                )
              : way(ways[0], true)
          }
          secondary={way(ways[1], false)}
        />
      }
    />
  );

  return (
    <>
      <ListDetailPage
        storageKey="notes"
        header={{
          title: t('title'),
          subtitle: t('subtitle'),
          actions: <AgentHint page="notes" facts={agentFacts} />,
          primary: none || isFramed() ? undefined : { label: t('action.new'), icon: 'plus', onPress: () => startNew(target), isDisabled: !can, ...(can ? {} : { disabledReason: offReason() }) },
          primaryQuiet: listEmpty,
          primaryAsFab: !listEmpty,
        }}
        {...(unread > 0 ? { toolbar: <Notice>{t('moreComputers', { shown: shown.length })}</Notice> } : {})}
        list={list}
        detail={detail}
      />
      {adding && (
        <NewNote
          key={adding.c.id}
          api={api}
          computer={adding.c}
          me={adding.me}
          place={adding.place}
          onClose={() => setAdding(null)}
          held={store.holds[adding.c.id] ?? null}
          sendingOut={addingOut}
          onAdded={() => notes.reload(adding.c)}
          // Proven created, this dialog still on screen: it goes and the note opens beside the list, the way a row's
          // Open here opens one.
          onCreated={(note) => {
            const id = `${adding.c.id}~${note.id}`;
            setFresh({ id, userId: adding.me.userId, name: note.name });
            notes.reload(adding.c);
            setAdding(null);
            view.open(id);
          }}
          onClaim={(sent) => claim(adding.c.id, sent)}
          onMove={(from, sent) => move(adding.c.id, from, sent)}
          onAnswered={(note) => answered(adding.c.id, note)}
          onSettle={(note) => settle(adding.c.id, note)}
          onRelease={(note) => release(adding.c.id, note)}
        />
      )}
      {removing && (
        <DeleteNote
          key={removing.key}
          target={removing}
          api={api}
          attempts={removeAttempts}
          // Bound to what the dialog opened with: the same computer, still read, still that notebook; never in a frame.
          allowed={() => {
            const l = notes.loads[removing.computer.id];
            return !isFramed() && byId.has(removing.computer.id) && l?.state === 'ok' && l.me.notebookId === removing.nb;
          }}
          onClose={() => setRemoving(null)}
          onEnd={onRemoveEnd}
        />
      )}
    </>
  );
}
