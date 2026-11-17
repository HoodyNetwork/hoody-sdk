// The Code tab: the editor fills the pane, Save sits in the save bar (the detail draws it), problems list under the
// editor, and the versions kept are a 320 px side panel. Below 600 px the editor is read only.
// The code is coloured by its file's language, and the editor's toolbar copies it and saves it as a file. The assistant
// is the header's button, which shows on this tab too.
import { useState } from 'react';
import { hostEnv, save } from '@core';
import { Band, Button, CodeEditor, CopyButton, EmptyState, ErrorState, IconButton, ItemList, OutcomeBanner, Panel, Skeleton, SubSection, formatBytes, formatDateTime, useStrings } from '@kit';
import strings from '../strings.en.json';
import type { CompScripts, ScriptItem, Version } from '../types';
import { ChangeBanner } from './Bits';
import { VersionPreview } from './VersionPreview';
import type { EditorState } from './useEditor';
import { readOnlyNote, readOnlyText } from './readOnly';
import s from './parts.module.css';

/** The most a script saved as a file may weigh; a longer one is refused and a banner over the editor says so. */
export const CODE_SAVE_MAX = 4 * 1024 * 1024;

/** The colours of a script, from its file name: TypeScript and JavaScript are coloured, any other file stays plain. */
export function codeLangOf(path: string): 'ts' | 'js' | undefined {
  const m = /\.([a-z]{2,3})$/.exec(path.toLowerCase());
  const ext = m?.[1];
  return ext === 'ts' || ext === 'mts' || ext === 'cts' || ext === 'tsx' ? 'ts' : ext === 'js' || ext === 'mjs' || ext === 'cjs' || ext === 'jsx' ? 'js' : undefined;
}

/** A version row's second line: its size, when the computer said. The version's own id is never shown: it names the stored
 *  copy, not anything a person saved. */
export function versionMeta(v: Version): readonly [string] | undefined {
  return typeof v.size === 'number' && Number.isFinite(v.size) && v.size >= 0 ? [formatBytes(v.size)] : undefined;
}

/** The file a download is saved as: the script's own file name, without its folders. */
export function codeFileName(path: string): string {
  return path.split('/').pop() || path;
}

export function CodeTab({ item, comp, ed }: { item: ScriptItem; comp: CompScripts; ed: EditorState }) {
  const t = useStrings(strings);
  // The version being read before it is restored (null: none).
  const [preview, setPreview] = useState<{ version: string | number; at: string } | null>(null);
  const [unsaved, setUnsaved] = useState(false);
  if (ed.file.isPending) return <Skeleton rows={8} />;
  if (ed.file.isError || !ed.file.data || ed.text === null) return <ErrorState onRetry={() => void ed.file.refetch()} size="sm" />;
  const readOnly = !ed.canWrite || ed.locked;
  const problems = ed.verdict?.verdict === 'needs_fix' ? ed.verdict.errors.map((e) => ({ line: e.line ?? null, message: e.message })) : [];

  const text = ed.text;
  // A download the browser was not given (the code is too long to save as one file) is said, never silent.
  const download = () => setUnsaved('refused' in save(codeFileName(item.path), [text], { maxBytes: CODE_SAVE_MAX }));
  // Icon buttons, each named by its tooltip: the toolbar keeps to one row beside Find, also in the narrow detail pane.
  // Download only where the Hub is a web page: a terminal has no file save (the download reads `document`); Copy stays.
  const files = hostEnv().browserPage === true;
  const tools = (
    <>
      <CopyButton text={text} label={t('code.copy')} />
      {files ? <IconButton size="sm" icon="download" label={t('code.download')} onPress={download} /> : null}
    </>
  );

  const readOnlyWhy = readOnlyText(t, readOnlyNote(item, comp) ?? { title: 'code.oldKit', body: 'code.oldKitBody' });

  return (
    <div className={s.codeGrid}>
      <div className={s.codeMain}>
        {!ed.canWrite ? (
          <Band size="table">
            {readOnlyWhy}
          </Band>
        ) : null}
        {ed.conflict ? (
          <OutcomeBanner
            kind="stale"
            title={t('code.conflict')}
            body={t('code.conflictBody')}
            actions={
              <>
                {ed.dirty ? (
                  <Button size="sm" onPress={() => void ed.keepMine()}>
                    {t('code.keepMine')}
                  </Button>
                ) : null}
                <Button size="sm" onPress={() => void ed.loadTheirs()}>
                  {t('code.loadTheirs')}
                </Button>
              </>
            }
          />
        ) : null}
        {ed.note ? <OutcomeBanner kind={ed.note.kind} title={ed.note.text} onDismiss={ed.note.kind === 'pending' ? undefined : () => ed.setNote(null)} /> : null}
        <ChangeBanner out={ed.out?.kind === 'failed' ? ed.out : null} what="save" onDismiss={ed.dismiss} />
        {unsaved ? <OutcomeBanner kind="failed" title={t('code.downloadRefused')} onDismiss={() => setUnsaved(false)} /* noDetails: no request was made; the code is over the size the browser is given as one file */ /> : null}
        <CodeEditor value={ed.text} onChange={ed.setText} label={t('code.label')} readOnly={readOnly} problems={problems} onSave={() => void ed.save()} lang={codeLangOf(item.path)} tools={tools} className={s.editor} />
        {ed.verdict?.verdict === 'ready' && ed.verdict.missing.length > 0 ? <Band size="table">{t('code.willInstall', { names: ed.verdict.missing.join(', ') })}</Band> : null}
        {ed.dirty && ed.changes.length > 0 ? (
          <SubSection title={t('code.worthKnowing')} state={{ kind: 'ready' }}>
            <ItemList label={t('code.worthKnowing')} items={ed.changes.map((c) => ({ id: c.code, title: t(`change.${c.code}` as never, { detail: c.detail ?? '' }) }))} />
          </SubSection>
        ) : null}
      </div>
      {comp.caps?.history ? (
        <aside className={s.versions} aria-label={t('versions.title')}>
          {/* Padded like every card: the rows line up with the heading and their buttons stay inside the frame. */}
          <Panel title={t('versions.title')} description={t('versions.body')}>
            {ed.versions.isPending ? (
              <Skeleton rows={3} />
            ) : ed.versions.data && ed.versions.data.length > 0 ? (
              <ItemList
                label={t('versions.title')}
                items={ed.versions.data.map((v) => {
                  // A save is known by when it was kept, in the Hub's date format; the list is newest first.
                  const at = formatDateTime(v.savedAt);
                  const meta = versionMeta(v);
                  return {
                    id: String(v.version),
                    title: at,
                    ...(meta ? { meta } : {}),
                    // The list holds the code each save replaced, newest first, never the code in use: a version is the one in use
                    // only while it holds the same code (its revision is the file's, as right after it was restored). Every other
                    // one, the newest included, can be read before it is restored.
                    ...(v.revision !== undefined && v.revision === ed.file.data?.revision
                      ? { status: { tone: 'ok' as const, label: t('versions.current') } }
                      : { actions: { inline: [{ id: 'preview', label: t('versions.preview'), name: t('versions.previewName', { at }), opens: 'dialog' as const, onPress: () => setPreview({ version: v.version, at }) }] as const } }),
                  };
                })}
              />
            ) : (
              <EmptyState size="sm" title={t('versions.empty')} />
            )}
          </Panel>
        </aside>
      ) : null}
      {preview !== null ? (
        <VersionPreview
          id={item.id}
          version={preview.version}
          at={preview.at}
          current={ed.file.data.content}
          canRestore={ed.canWrite && !ed.locked && !ed.dirty}
          onRestore={() => void ed.restoreVersion(preview.version)}
          onClose={() => setPreview(null)}
        />
      ) : null}
    </div>
  );
}
