// Find by name below the open folder: the files program's ?q= search,
// in a drawer beside the list. A search runs when asked (Enter or Find), never per keystroke: it walks the folder on
// the computer. Matches are paths below the folder; a folder opens in the pane, a file shows in its folder or opens
// its preview. Reads only. The top folder has no documented search, so there the drawer lists the computer's top
// folders (the pane's own listing of /, watched in its cache, never read again here) and one click finds in one of
// them, inside the drawer: the pane stays where it is, and Other folders goes back to the list.
import { Button, Drawer, EmptyState, ErrorState, Icon, SearchField, Skeleton, TextButton, UnreachableState, formatBytes, useStrings } from '@kit';
import { reachOf } from '@core';
import { useState } from 'react';
import { useFolder, type FilesComputer } from './data';
import { blockedPath, displayName, entryOk, joinPath, parentOf, partsOf } from './logic';
import { FIND_CAP, findQuery, type Found } from './ro';
import { useFind } from './ro.data';
import s from './files.module.css';
import strings from './strings.en.json';

const PAGE = 100;
/** Every ask on this page, across drawer openings: an ask's number is part of its search's key, so no two asks share a
 *  cached answer, also after the drawer was closed and opened again. */
let asks = 0;

export function Find({ c, base, onOpen, onPreview, onClose }: {
  c: FilesComputer;
  base: string;
  onOpen: (folder: string) => void;
  onPreview: (f: Found) => void;
  onClose: () => void;
}) {
  const t = useStrings(strings);
  const [typed, setTyped] = useState('');
  const [asked, setAsked] = useState('');
  // Each Enter or Find is its own search, also for the same words: the folder may have changed since.
  const [round, setRound] = useState(0);
  const [shown, setShown] = useState(PAGE);
  // Opened at the top: the top folder picked in the drawer to find in, or null while the list shows.
  const [picked, setPicked] = useState<string | null>(null);
  const fromTop = partsOf(base).length === 0;
  const here = picked ?? base;
  const atTop = partsOf(here).length === 0;
  // The pane at / owns this read: the drawer only watches its cache and never asks again (an old listing included).
  const top = useFolder(c, '/', false);
  const clean = findQuery(typed);
  const find = useFind(c, here, asked, round, !atTop && !!asked);
  const where = atTop ? c.name : displayName(here);
  // Runs on the text it is given: the field's own value on Enter, so an Enter that arrives with the text (a paste
  // ending in a newline, keys faster than a render) searches for that text, never the last text drawn.
  const go = (text: string) => { const q = findQuery(text); if (q) { setAsked(q); setRound(++asks); setShown(PAGE); } };
  const tooLong = typed.trim() !== '' && clean === null && typed.replace(/[/\\\s]/g, '') !== '';

  /** Another folder to find in (or back to the list, null): its words and matches start over. */
  const pick = (folder: string | null) => { setPicked(folder); setTyped(''); setAsked(''); setShown(PAGE); };
  const tops = top.data && !top.isError ? top.data.entries.filter((e) => e.dir) : null;

  let body;
  if (atTop && !tops && !top.isError && top.isFetching) body = <Skeleton variant="text" rows={5} />;
  // A top read that failed says so: never "Open a folder first" over folders it could not read.
  else if (atTop && top.isError && !tops) {
    body = reachOf(top.error) === 'unreachable'
      ? <UnreachableState size="sm" computer={c.name} error={top.error} onRetry={() => void top.refetch()} retrying={top.isFetching} />
      : <ErrorState size="sm" title={t('find.topFailed')} error={top.error} onRetry={() => void top.refetch()} retrying={top.isFetching} />;
  } else if (atTop && (!tops || tops.length === 0)) body = <EmptyState size="sm" icon="files" title={t('find.top')} body={t('find.topBody')} />;
  else if (atTop && tops) {
    body = (
      <>
        <p className={s.note}>{t('find.topNote')}</p>
        <ul className={s.found} aria-label={t('find.tops')}>
          {tops.map((e) => {
            const path = joinPath('/', e.name);
            const why = !entryOk(e) ? t('name.lossy') : blockedPath(path) ? t('row.closed') : null;
            return (
              <li key={e.name} className={s.foundRow}>
                <Icon name="files" size="sm" />
                <div className={s.foundName}>
                  <span className={s.nameText}>{displayName(e.name)}</span>
                  <span className={s.note}>{why ?? t('kind.folder')}</span>
                </div>
                <div className={s.foundActions}>
                  <Button size="sm" variant="secondary" icon="search" isDisabled={!!why} onPress={() => pick(path)} aria-label={t('find.title', { folder: displayName(path) })}>{t('action.find')}</Button>
                </div>
              </li>
            );
          })}
        </ul>
      </>
    );
  }
  else if (!asked) body = <p className={s.note}>{t('find.hint')}</p>;
  else if (find.isError) {
    const st = (find.error as { status?: unknown } | null)?.status;
    body = st === 403
      ? <EmptyState size="sm" icon="warn" title={t('find.off')} />
      : st === 404
        ? <EmptyState size="sm" icon="warn" title={t('pr.gone')} />
        : <ErrorState title={t('find.failed')} body={t('find.failedBody')} error={find.error} onRetry={() => void find.refetch()} retrying={find.isFetching} />;
  } else if (!find.data) body = <Skeleton variant="text" rows={5} />;
  else if (find.data.items.length === 0) body = <EmptyState size="sm" icon="search" title={t('find.none', { q: asked })} body={t('find.noneBody')} />;
  else {
    const items = find.data.items;
    body = (
      <>
        <p className={s.note}>{find.data.capped ? t('find.capped', { count: FIND_CAP }) : t('find.count', { count: items.length })}</p>
        <ul className={s.found} aria-label={t('find.list', { q: asked })}>
          {items.slice(0, shown).map((f) => {
            // The match itself must be addressable: a folder to open it, a file to preview it (and so its folder too).
            const why = f.lossy ? t('name.lossy') : blockedPath(f.path) ? t('row.closed') : null;
            return (
              <li key={f.path} className={s.foundRow}>
                <Icon name={f.dir ? 'files' : 'notes'} size="sm" />
                <div className={s.foundName}>
                  <span className={s.nameText}>{displayName(f.name)}</span>
                  <span className={s.note}>{why ?? (f.dir ? t('kind.folder') : f.size === null ? t('kind.file') : formatBytes(f.size))}</span>
                </div>
                <div className={s.foundActions}>
                  {f.dir ? (
                    <Button size="sm" variant="secondary" isDisabled={!!why} onPress={() => onOpen(f.path)} aria-label={t('find.openOne', { name: displayName(f.name) })}>{t('action.open')}</Button>
                  ) : (
                    <>
                      <Button size="sm" variant="ghost" isDisabled={!!why} onPress={() => onOpen(parentOf(f.path))} aria-label={t('find.showOne', { name: displayName(f.name) })}>{t('find.show')}</Button>
                      <Button size="sm" variant="secondary" isDisabled={!!why} onPress={() => onPreview(f)} aria-label={t('find.previewOne', { name: displayName(f.name) })}>{t('action.preview')}</Button>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        {items.length > shown ? <TextButton onPress={() => setShown((n) => n + PAGE)}>{t('find.more')}</TextButton> : null}
      </>
    );
  }

  return (
    <Drawer resizeKey="files-find" isOpen onOpenChange={(open) => { if (!open) onClose(); }} title={t('find.title', { folder: where })} size="md">
      <div className={s.preview}>
        {fromTop && !atTop ? <TextButton icon="arrow-left" onPress={() => pick(null)}>{t('find.back')}</TextButton> : null}
        {atTop ? null : (
          <div className={s.findRow}>
            <SearchField
              label={t('find.field')}
              value={typed}
              onChange={setTyped}
              onSubmit={(v) => go(v)}
            />
            <Button variant="primary" icon="search" isDisabled={!clean} onPress={() => go(typed)}>{t('action.find')}</Button>
          </div>
        )}
        {tooLong ? <p className={s.note}>{t('find.tooLong')}</p> : null}
        {body}
      </div>
    </Drawer>
  );
}
