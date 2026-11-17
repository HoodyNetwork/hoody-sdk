// Look inside an archive: the files program's listing of a zip or tar, in a
// drawer beside the list. Reads only. A file inside opens in a new tab straight from the program (its ?preview=<entry>
// read: shown inline with nosniff, saved for html, svg, xml and js); a link or a special file (a pipe, a device)
// inside is listed and marked, never extracted. Entry names are shown through entryLabel: a direction override or an
// invisible character in a name is written out, never applied. An archive too big to list (past the listing bound, or the program's own 500 MB / 1 M entries cap) says
// so and keeps Download and Extract.
import { Button, Drawer, EmptyState, ErrorState, Icon, Skeleton, TextButton, formatBytes, useStrings } from '@kit';
import { useState } from 'react';
import { entryLabel, type ArchiveEntry } from './archive';
import { useArchiveList, useExtractAllowed, type FilesComputer } from './data';
import { displayName, parentOf } from './logic';
import { fileLink, openLink } from './ro';
import s from './files.module.css';
import strings from './Archive.strings.en.json';
import filesStrings from './strings.en.json';

const PAGE = 100;

/** A plain link to one entry of the archive at `path`: the program's REST read of the archive (fileLink's download
 *  link, so the same address rules) with ?preview=<entry> in place of ?download=1. '' when the archive has no link. */
export function entryLink(c: FilesComputer, path: string, entry: string): string {
  const base = fileLink(c, path, 'download');
  return base.endsWith('?download=1') ? `${base.slice(0, -'?download=1'.length)}?preview=${encodeURIComponent(entry)}` : '';
}

/** Folders first, then by path. */
const ordered = (es: readonly ArchiveEntry[]) => [...es].sort((a, b) => (a.dir === b.dir ? a.path.localeCompare(b.path) : a.dir ? -1 : 1));

export function Archive({ c, path, name, onExtract, extractOff, onClose }: {
  c: FilesComputer;
  path: string;
  name: string;
  onExtract: () => void;
  /** Why Extract is off now (extract off on this computer, changes off), or null. */
  extractOff: string | null;
  onClose: () => void;
}) {
  const t = useStrings(strings);
  const tt = useStrings(filesStrings);
  const q = useArchiveList(c, path, true);
  // Extract is off where the program's history read answers 403 (extract off on that computer), and while unread.
  const allowed = useExtractAllowed(c, !extractOff);
  const off = extractOff ?? (allowed === false ? t('extract.off') : allowed === undefined ? t('extract.checking') : null);
  const [shown, setShown] = useState(PAGE);
  const download = fileLink(c, path, 'download');
  const shownName = displayName(name);
  const where = parentOf(path) === '/' ? c.name : displayName(parentOf(path));
  // Past the listing bound core names the answer 'too_large'; past its own caps the program answers 400.
  const err = q.error as { status?: number | null; code?: string | null } | null;
  const tooBig = q.isError && (err?.code === 'too_large' || err?.status === 400);

  let body;
  if (q.isPending && !q.isError) body = <Skeleton variant="text" rows={6} />;
  else if (tooBig) body = <EmptyState size="sm" icon="warn" title={t('look.tooBig')} body={t('look.tooBigBody')} />;
  else if (q.isError || !q.data) body = <ErrorState size="sm" title={t('look.failed')} error={q.error} onRetry={() => void q.refetch()} retrying={q.isFetching} />;
  else if (q.data.entries.length === 0) body = <EmptyState size="sm" icon="notes" title={t('look.empty')} />;
  else {
    const items = ordered(q.data.entries);
    body = (
      <>
        <p className={s.note}>{t('look.summary', { count: items.filter((e) => !e.dir && !e.link && !e.special).length, size: formatBytes(q.data.totalSize) })}</p>
        <ul className={s.found} aria-label={t('look.list', { name: shownName })}>
          {items.slice(0, shown).map((e, i) => {
            const opens = !e.dir && !e.link && !e.special;
            const link = opens ? entryLink(c, path, e.path) : '';
            // By place: an archive may hold one path twice (the program extracts the first).
            return (
              <li key={i} className={s.foundRow}>
                <Icon name={e.dir ? 'files' : 'notes'} size="sm" />
                <div className={s.foundName}>
                  <span className={s.nameText}>{entryLabel(e.path)}</span>
                  <span className={s.note}>{e.link ? t('look.link') : e.special ? t('look.special') : e.dir ? t('look.folder') : formatBytes(e.size)}</span>
                </div>
                {!opens ? null : (
                  <div className={s.foundActions}>
                    <Button size="sm" variant="secondary" iconEnd="external" isDisabled={!link} onPress={() => openLink(link)} aria-label={t('look.openOne', { name: entryLabel(e.path) })}>{t('look.open')}</Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        {items.length > shown ? <TextButton onPress={() => setShown((n) => n + PAGE)}>{t('look.more')}</TextButton> : null}
      </>
    );
  }

  return (
    <Drawer resizeKey="files-archive" overlayId="files-archive"
      isOpen
      onOpenChange={(open) => { if (!open) onClose(); }}
      title={t('look.title', { name: shownName })}
      subtitle={where}
      size="md"
      cancel={t('extract.close')}
      primary={<Button variant="primary" icon="download" isDisabled={!!off} onPress={onExtract}>{t('action.extract')}</Button>}
      secondary={<Button variant="secondary" icon="download" isDisabled={!download} onPress={() => openLink(download)}>{tt('action.download')}</Button>}
    >
      <div className={s.preview}>
        {body}
        {off ? <p className={s.note}>{off}</p> : null}
      </div>
    </Drawer>
  );
}
