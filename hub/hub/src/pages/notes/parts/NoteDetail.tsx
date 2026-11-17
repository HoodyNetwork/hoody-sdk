// One note beside the table (or over it on a phone): its title and computer, then the note itself in a frame. Open in a new tab,
// Download and Open computer are the same actions the row menu has; a note the frame cannot address (no https address for the
// computer's Notes) says so and keeps the new-tab fallback. A note the list does not hold (`unlisted`: a copied link to an
// older note) is addressed by its id alone: it reads "Note" until Notes shows its own title in the frame.
import { Button, DetailHeader, EmptyState, ErrorState, formatRelative, useStrings, type MenuEntry } from '@kit';
import { noteUrl } from '../logic';
import strings from '../strings.en.json';
import type { Computer, Loaded, Row } from '../types';
import { GroupNote } from './GroupNote';
import { NoteFrame } from './NoteFrame';
import s from './parts.module.css';

/** `focusFrame`: a note made just now; its frame takes the focus when Notes has drawn it. */
export function NoteDetail({ row, base, onOpenTab, menu, unlisted = false, focusFrame = false }: { row: Row; base: string | null; onOpenTab: () => void; menu: readonly MenuEntry[]; unlisted?: boolean; focusFrame?: boolean }) {
  const t = useStrings(strings);
  const embed = noteUrl(base, row.userId, row.note.id, true);
  const tab = noteUrl(base, row.userId, row.note.id);
  // An unlisted note has no title here, except the one made just now (the title it was created with).
  const title = unlisted ? row.title || t('note.title') : row.title || '—';
  return (
    <div className={s.noteDetail}>
      <DetailHeader
        title={title}
        meta={
          <span className={s.muted}>
            {row.computer}
            {row.at !== null ? ` · ${t('note.changed', { when: formatRelative(row.at) })}` : ''}
          </span>
        }
        actions={
          <Button size="sm" icon="external" onPress={onOpenTab} isDisabled={!base} disabledReason={t('action.noAddress')}>
            {t('action.openNoteTab')}
          </Button>
        }
        menu={menu}
      />
      {embed && tab ? <NoteFrame src={embed} title={title} tabUrl={tab} focus={focusFrame} /> : <EmptyState icon="notes" title={t(base ? 'note.cantShow' : 'action.noAddress')} {...(base ? {} : { body: t('note.noAddressBody') })} />}
    </div>
  );
}

/** The detail of a selection the table holds no row for. The table lists only the recent notes of each computer, so what to say
 *  depends on what is known: the computers list still reading or failed, the selected computer missing, stopped or not read
 *  (that computer's own state and Try again), or a selection that names no note Notes could have (an id it never gives). A note
 *  the list does not hold on a computer that answered opens as an unlisted note (NoteDetail `unlisted`), not here. */
export function NoteMissing({
  list,
  computer,
  load,
  onRetryList,
  onRetry,
}: {
  list: { pending: boolean; failed: boolean; error: unknown };
  computer: Computer | undefined;
  load: Loaded | undefined;
  onRetryList: () => void;
  onRetry: () => void;
}) {
  const t = useStrings(strings);
  // The header stays in every state: it carries the pane controls (Show list, Back), so a hidden list can always be brought back.
  const body = (() => {
    if (list.failed) return <ErrorState error={list.error} onRetry={onRetryList} />;
    if (list.pending) return <EmptyState icon="notes" title={t('note.reading')} />;
    if (!computer) return <EmptyState icon="notes" title={t('note.noComputer')} body={t('note.noComputerBody')} />;
    if (computer.state !== 'running' || !load || load.state !== 'ok') {
      // The computer's own state and Try again: GroupNote may draw a block (a warning notice, a loading row), so it goes in
      // the action slot (a block), never the body's paragraph.
      return <EmptyState icon="notes" title={computer.name} action={<GroupNote computer={computer} load={load} count={0} onRetry={onRetry} onNew={null} />} />;
    }
    return <EmptyState icon="notes" title={t('note.gone')} />;
  })();
  return (
    <div className={s.noteDetail}>
      <DetailHeader title={t('note.title')} />
      {body}
    </div>
  );
}
