// A file's preview: an image's thumbnail or a text file's first lines, in a drawer beside the list, with the ways on.
// The foot holds Download and Open with… only; the other ways (the computer's viewer, its editor where changes are
// allowed, the program that suits the file, an archive's Look inside and Extract here) are rows under the preview,
// each with the reason beside it when it is off. Reads only. Each state says one thing (ro.data.ts usePreview): a 403
// on a thumbnail means thumbnails are off on this computer, so Download is the way to look. A text preview is
// coloured by its kind (lang.ts).
import { Button, CodeBlock, Drawer, EmptyState, ErrorState, SettingGroup, SettingRow, Skeleton, formatBytes, useStrings } from '@kit';
import type { ReactNode } from 'react';
import type { FilesComputer } from './data';
import { previewLang } from './lang';
import { displayName, parentOf } from './logic';
import { PreviewImage } from './PreviewImage';
import { TEXT_LINES, fileLink, openLink, type LinkKind } from './ro';
import { usePreview } from './ro.data';
import s from './files.module.css';
import strings from './strings.en.json';
import archiveStrings from './Archive.strings.en.json';

export interface PreviewFile { readonly path: string; readonly name: string; readonly size: number | null }

/** Where the file is, for the drawer's second line: its folder's name, or the computer's at the top. */
const whereOf = (c: FilesComputer, file: PreviewFile): string => (parentOf(file.path) === '/' ? c.name : displayName(parentOf(file.path)));

/** whyNot says why a link of a kind can't be built for this file (the row menu's reasons), so a button that is off
 *  says why beside it, as the row menu does. openWith: Open in ‹Top› once its check found it,
 *  and Open with… always (null: the computer can't start programs from Files now). */
export function Preview({ c, file, canChange, whyNot, onClose, openWith, archive }: {
  c: FilesComputer;
  file: PreviewFile;
  canChange: boolean;
  whyNot: (kind: LinkKind) => string | null;
  onClose: () => void;
  openWith?: (decodedText: boolean) => { top: ReactNode; choose: (() => void) | null; off?: string };
  /** An archive the files program opens: Look inside, and Extract here… unless `extractOff` says why not. */
  archive?: { look: () => void; extract: () => void; extractOff: string | null };
}) {
  const t = useStrings(strings);
  const tt = useStrings(archiveStrings);
  const { state, retry } = usePreview(c, file.path, file.name, true);
  const name = displayName(file.name);
  const download = fileLink(c, file.path, 'download');
  const view = fileLink(c, file.path, 'view');
  const edit = canChange ? fileLink(c, file.path, 'edit') : '';
  const where = whereOf(c, file);
  // Open in ‹program› once the page's check found one, Open with… while this key can start programs, else why not.
  const { top = null, choose = null, off: owWhy } = openWith?.(state.kind === 'text') ?? {};
  // Why a way is off, in the words the row menu uses; null while it is on.
  const downloadWhy = download ? null : whyNot('download');
  const viewWhy = view ? null : whyNot('view');
  const editWhy = canChange && !edit ? whyNot('edit') : null;
  const downloadOff = downloadWhy ? t('preview.actionOff', { action: t('action.download'), why: downloadWhy }) : null;
  const viewOff = viewWhy ? t('preview.actionOff', { action: t('action.view'), why: viewWhy }) : null;
  const editOff = editWhy ? t('preview.actionOff', { action: t('action.edit'), why: editWhy }) : null;
  const extractOff = archive?.extractOff ? t('preview.actionOff', { action: tt('action.extract'), why: archive.extractOff }) : null;
  // Open with… while the computer runs but this key can't start programs: shown, off, with its reason.
  const owOff = !choose && owWhy ? t('preview.actionOff', { action: t('ow.openWith'), why: owWhy }) : null;
  // The foot's line: why Download or Open with… is off, else what pressing does.
  const footOff = downloadOff ?? owOff;

  const body = state.kind === 'loading' ? <Skeleton variant="text" rows={6} />
    : state.kind === 'image' ? <PreviewImage url={state.url} alt={t('preview.alt', { name })} />
      : state.kind === 'text' ? (
        state.lines === 0
          ? <EmptyState size="sm" icon="notes" title={t('preview.emptyText')} />
          : <CodeBlock code={state.text} lang={previewLang(file.name, state.text) ?? 'plain'} // reason: a file of no known language (or too long to colour) shows as typed
            label={t('preview.textLabel', { name })} wrap footer={state.more ? t('preview.more', { count: TEXT_LINES }) : undefined} />
      ) : state.kind === 'failed' ? <ErrorState title={t('preview.failed')} body={t('preview.failedBody')} error={state.error} onRetry={retry} />
        : <EmptyState size="sm" icon={state.kind === 'gone' ? 'warn' : 'notes'} title={t(`preview.${state.kind}`)} />;

  return (
    <Drawer resizeKey="files-preview"
      isOpen
      onOpenChange={(open) => { if (!open) onClose(); }}
      title={name}
      subtitle={file.size === null ? where : `${where} · ${formatBytes(file.size)}`}
      size="md"
      cancel={t('preview.close')}
      reason={footOff ?? t('preview.note')}
      primary={<Button variant="primary" icon="download" isDisabled={!download} {...(downloadOff ? { disabledReason: downloadOff } : {})} onPress={() => openLink(download)}>{t('action.download')}</Button>}
      secondary={
        choose ? <Button variant="secondary" icon="terminal" onPress={choose}>{t('ow.openWith')}</Button>
          : owOff ? <Button variant="secondary" icon="terminal" isDisabled disabledReason={owOff}>{t('ow.openWith')}</Button>
            : undefined
      }
    >
      <div className={s.preview}>
        {body}
        <Ways
          viewOff={viewOff}
          onView={view ? () => openLink(view) : null}
          canEdit={canChange}
          editOff={editOff}
          onEdit={edit ? () => openLink(edit) : null}
          top={top}
          onLook={archive ? archive.look : null}
          onExtract={archive ? archive.extract : null}
          extractOff={extractOff}
        />
      </div>
    </Drawer>
  );
}

/** The ways on that are not in the foot, one row each: what it opens in, the reason beside it when it is off (the
 *  button is described by it), and its button. `top` is the Open in ‹program› button the page's check found. */
function Ways({ viewOff, onView, canEdit, editOff, onEdit, top, onLook: look, onExtract: extract, extractOff }: {
  viewOff: string | null; onView: (() => void) | null; canEdit: boolean; editOff: string | null; onEdit: (() => void) | null; top: ReactNode;
  onLook: (() => void) | null; onExtract: (() => void) | null; extractOff: string | null;
}) {
  const tt = useStrings(archiveStrings);
  const t = useStrings(strings);
  return (
    <SettingGroup title={t('preview.ways')}>
      <SettingRow label={t('preview.way.view')} {...(viewOff ? { help: viewOff } : {})}>
        {(row) => <Button size="sm" variant="secondary" iconEnd="external" isDisabled={!onView} aria-describedby={row.helpId} onPress={() => onView?.()}>{t('action.view')}</Button>}
      </SettingRow>
      {canEdit ? (
        <SettingRow label={t('preview.way.edit')} {...(editOff ? { help: editOff } : {})}>
          {(row) => <Button size="sm" variant="secondary" iconEnd="external" isDisabled={!onEdit} aria-describedby={row.helpId} onPress={() => onEdit?.()}>{t('action.edit')}</Button>}
        </SettingRow>
      ) : null}
      {top ? <SettingRow label={t('preview.way.top')}>{top}</SettingRow> : null}
      {look ? (
        <SettingRow label={t('preview.way.look')}>
          <Button size="sm" variant="secondary" icon="eye" onPress={look}>{tt('action.look')}</Button>
        </SettingRow>
      ) : null}
      {extract ? (
        <SettingRow label={t('preview.way.extract')} {...(extractOff ? { help: extractOff } : {})}>
          {(row) => <Button size="sm" variant="secondary" icon="download" isDisabled={!!extractOff} aria-describedby={row.helpId} onPress={extract}>{tt('action.extract')}</Button>}
        </SettingRow>
      ) : null}
    </SettingGroup>
  );
}
