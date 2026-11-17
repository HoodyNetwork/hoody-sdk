// An older version, read before it is restored: what would change in the code, and what is worth knowing about the header (a key
// dropped, a schedule added, an address taken). Restoring is a separate press: this dialog only reads.
import { Band, CodeBlock, Dialog, ErrorState, ItemList, Skeleton, Stack, SubSection, useStrings } from '@kit';
import { useVersionRead } from '../data';
import { changesOf, diff, splitKey } from '../logic';
import strings from '../strings.en.json';
import s from './parts.module.css';

const SHOWN = 80;

/** `at`: when the version was kept, as its row in the list says it; it names the dialog (the version's id is never shown). */
export function VersionPreview({ id, version, at, current, canRestore, onRestore, onClose }: { id: string; version: string | number; at: string; current: string; canRestore: boolean; onRestore: () => void; onClose: () => void }) {
  const t = useStrings(strings);
  const read = useVersionRead(id, version);
  const old = read.data?.content;
  // A refetch that failed keeps the earlier answer beside its error, and one still reading may be about to replace it: Restore waits for a settled read.
  const blocked = old === undefined || read.isError || read.isFetching || !canRestore;
  // The caller key never reaches the screen: the editor shows the file without its `@token` line, so the comparison does too.
  const d = old === undefined ? null : diff(splitKey(current).body, splitKey(old).body);
  const changes = old === undefined ? [] : changesOf(current, old);
  const changed = d && !d.tooBig ? d.ops.filter((o) => o.t !== ' ') : [];
  return (
    <Dialog
      isOpen
      onOpenChange={(o) => { if (!o) onClose(); }}
      title={t('versions.previewTitle', { at })}
      size="xl"
      body={t('versions.previewBody')}
      primaryLabel={t('versions.restoreThis')}
      primaryDisabled={blocked}
      onPrimary={() => { if (blocked) return; onRestore(); onClose(); }}
      cancelLabel={t('versions.close')}
    >
      {read.isPending ? <Skeleton rows={4} /> : null}
      {read.isError ? <ErrorState size="sm" onRetry={() => void read.refetch()} /> : null}
      {old !== undefined ? (
        <Stack gap={3}>
          {changes.length > 0 ? (
            <SubSection title={t('versions.changes')} state={{ kind: 'ready' }}>
              <ItemList label={t('versions.changes')} items={changes.map((c) => ({ id: c.code, title: t(`change.${c.code}` as never, { detail: c.detail ?? '' }) }))} />
            </SubSection>
          ) : null}
          {/* The code's own changes; a comparison too large to show, or with nothing to show, says so as the section's sentence. */}
          {d && d.tooBig ? (
            <SubSection title={t('versions.diff')} description={t('versions.tooBig')} />
          ) : changed.length === 0 ? (
            <SubSection title={t('versions.diff')} description={t('versions.same')} />
          ) : (
            <div className={s.diff}>
              <CodeBlock
                wrap
                lang="diff"
                label={t('versions.diff')}
                code={changed.slice(0, SHOWN).map((o) => `${o.t} ${o.line}`).join('\n') + (changed.length > SHOWN ? `\n${t('versions.more', { n: String(changed.length - SHOWN) })}` : '')}
              />
            </div>
          )}
          {/* Why Restore is off, in words beside it. */}
          {!canRestore ? <Band size="table">{t('versions.cantRestore')}</Band> : null}
        </Stack>
      ) : null}
    </Dialog>
  );
}
