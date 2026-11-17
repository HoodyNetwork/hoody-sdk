// Notes… of the chat composer's add menu: the recent notes of the running computers, as the Notes page reads them, in one
// table. Attach reads each picked note's Markdown text once (never more than a text file may hold, never cut) and hands it to
// the composer's own add path as a text file named after the note; the agent gets the text, never a link. A note that proves
// too long is marked and can no longer be picked. Nothing is attached unless every picked note was read, and nothing is sent.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Band, DataTable, Dialog, Stack, Tag, TextButton, createColumnHelper, formatBytes, formatRelative, useDataView, useStrings } from '@kit';
import { attach as A } from '@ask/io';
import { notesShownOf, readNoteText, useNotes, useNotesApi, useNotesComputers, type NoteRow, type NoteText, type NotesComputer } from '../../notes/links';
import strings from './Conversation.strings.en.json';

export interface AttachNotesProps {
  /** How many more text files the next message takes: at most this many notes are picked. */
  room: number;
  /** The composer's own add path (its rules decide what is kept). */
  onAdd: (files: readonly File[]) => void;
  onClose: () => void;
}

interface Row {
  /** The computer's id and the note's, as the Notes page keys its rows. */
  id: string;
  computer: NotesComputer;
  notebook: string;
  note: NoteRow;
  title: string;
  on: string;
  at: number | null;
}

/** The attached file's name: the note's title with ".md". A slash would read as a folder, so it becomes a dash. */
export function noteFileName(title: string, untitled: string): string {
  return `${(title.trim() || untitled).replace(/[\\/]+/gu, '-')}.md`;
}

const col = createColumnHelper<Row>();

/** What the line above the rows says: the last Attach's failure, the notes that proved too long, or a pick past the room. */
type Said = { k: 'failed'; error: unknown } | { k: 'long'; names: string } | { k: 'over' } | null;

export function AttachNotesDialog({ room, onAdd, onClose }: AttachNotesProps) {
  const t = useStrings(strings);
  const api = useNotesApi();
  const computers = useNotesComputers();
  const shown = useMemo(() => notesShownOf(computers.data), [computers.data]);
  const notes = useNotes(shown, api);
  const max = formatBytes(A.TXT_BYTES);
  const untitled = t('conv.add.notes.untitled');
  const [long, setLong] = useState<ReadonlySet<string>>(() => new Set());
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set());
  const [said, setSaid] = useState<Said>(null);
  const [busy, setBusy] = useState(false);

  const rows = useMemo<Row[]>(() => shown.flatMap((c) => {
    const l = notes.loads[c.id];
    return l?.state === 'ok' ? l.recent.items.map((n) => ({ id: `${c.id}~${n.id}`, computer: c, notebook: l.me.notebookId, note: n, title: n.title.trim() || untitled, on: c.name, at: n.at })) : [];
  }), [shown, notes.loads, untitled]);
  const running = shown.filter((c) => c.state === 'running');
  const reading = running.some((c) => (notes.loads[c.id]?.state ?? 'loading') === 'loading');
  // Running computers whose Notes answered something other than a list: their notes are not in the table.
  const unread = running.filter((c) => { const s = notes.loads[c.id]?.state; return s !== undefined && s !== 'ok' && s !== 'loading'; }).length;

  const columns = useMemo(() => [
    col.accessor('title', {
      header: t('conv.add.notes.col.title'),
      meta: { pinned: true, size: 'fill', label: t('conv.add.notes.col.title') },
      cell: (c) => (long.has(c.row.original.id)
        ? <>{c.getValue()} <Tag tone="warn" tip={t('conv.add.notes.tooLongWhy', { max })}>{t('conv.add.notes.tooLong')}</Tag></>
        : c.getValue()),
    }),
    col.accessor('on', { header: t('conv.add.notes.col.computer'), meta: { width: '160px', size: 'fit', priority: 2, label: t('conv.add.notes.col.computer') } }),
    col.accessor((r) => r.at ?? 0, {
      id: 'at',
      header: t('conv.add.notes.col.changed'),
      meta: { width: '140px', size: 'fit', fitText: (r: Row) => (r.at === null ? '' : formatRelative(r.at)), priority: 1, label: t('conv.add.notes.col.changed') },
      cell: (c) => (c.row.original.at === null ? '' : formatRelative(c.row.original.at)),
    }),
  ], [t, long, max]);
  const view = useDataView<Row>({
    rows: computers.data ? rows : undefined,
    columns,
    getRowId: (r) => r.id,
    search: (r) => [r.title, r.on],
    sort: '-at',
    param: 'att',
    isLoading: computers.isPending || (reading && rows.length === 0),
    error: computers.error,
  });

  // A pick keeps only notes that can be attached, and never more than the message has room for.
  const pick = (ids: Set<string>) => {
    const ok = [...ids].filter((id) => !long.has(id));
    const tooLong = rows.filter((r) => ids.has(r.id) && long.has(r.id));
    setPicked(new Set(ok.slice(0, room)));
    setSaid(tooLong.length ? { k: 'long', names: tooLong.map((r) => r.title).join(', ') } : ok.length > room ? { k: 'over' } : null);
  };

  // A read that ends after the dialog left (closed, or another chat) adds nothing.
  const run = useRef(0);
  useEffect(() => () => { run.current += 1; }, []);
  const chosen = rows.filter((r) => picked.has(r.id));

  const attach = async () => {
    if (busy || chosen.length === 0) return;
    setBusy(true);
    setSaid(null);
    const mine = (run.current += 1);
    const got = await Promise.all(chosen.map((r) => readNoteText(r.computer, r.notebook, r.note, A.TXT_BYTES)));
    if (run.current !== mine) return;
    setBusy(false);
    // The account or realm moved on while a note was read: the dialog goes with it.
    if (got.some((g) => !g.ok && g.why === 'dropped')) { onClose(); return; }
    const over = chosen.filter((_, i) => { const g = got[i]; return !!g && !g.ok && g.why === 'tooBig'; });
    if (over.length) {
      const ids = new Set(over.map((r) => r.id));
      setLong((p) => new Set([...p, ...ids]));
      setPicked((p) => new Set([...p].filter((id) => !ids.has(id))));
    }
    const failed = got.find((g): g is Extract<NoteText, { why: 'failed' }> => !g.ok && g.why === 'failed');
    if (failed) { setSaid({ k: 'failed', error: failed.error }); return; }
    if (over.length) { setSaid({ k: 'long', names: over.map((r) => r.title).join(', ') }); return; }
    onAdd(chosen.flatMap((r, i) => { const g = got[i]; return g?.ok ? [new File([g.text], noteFileName(r.note.title, untitled), { type: 'text/markdown' })] : []; }));
    onClose();
  };

  const note = said?.k === 'failed'
    ? <Band size="table" tone="danger" error={said.error}>{t('conv.add.notes.failed')}</Band>
    : said?.k === 'long'
      ? <Band size="table" tone="warn" /* noDetails: the note was read and is longer than a text file may be, not a rejection */>{t('conv.add.notes.long', { names: said.names, max })}</Band>
      : said?.k === 'over'
        ? <Band size="table" tone="neutral">{t('conv.add.notes.over', { count: room })}</Band>
        : unread > 0
          ? <Band size="table" tone="warn" /* noDetails: some computers' Notes gave no list; the Notes page says what each one answered */ actions={<TextButton onPress={() => notes.reloadAll()}>{t('conv.add.notes.retry')}</TextButton>}>{t('conv.add.notes.unread', { count: unread })}</Band>
          : null;
  // Nothing to list once every read answered: the body says so (the table shows the kit's own empty state).
  const none = !!computers.data && !reading && rows.length === 0;
  return (
    <Dialog
      isOpen
      onOpenChange={(o) => { if (!o) onClose(); }}
      overlayId="ai-attach-notes"
      size="xl"
      title={t('conv.add.notes.title')}
      body={none ? t('conv.add.notes.empty') : t('conv.add.notes.body', { count: room, max })}
      primaryLabel={t('conv.add.attach')}
      onPrimary={() => { void attach(); }}
      primaryDisabled={chosen.length === 0}
      busy={busy}
    >
      <Stack gap={3}>
        {note}
        <DataTable
          label={t('conv.add.notes.table')}
          view={view}
          columns={columns}
          search={t('conv.add.notes.search')}
          selectable="pick"
          selectedIds={picked}
          onSelectionChange={pick}
          onRefresh={() => notes.reloadAll()}
          onRetry={() => void computers.refetch()}
          countLabel={(n) => t('conv.add.notes.count', { count: n })}
          sortParam={false}
          noViewMenu
          fill={false}
          maxHeight={360}
        />
      </Stack>
    </Dialog>
  );
}
