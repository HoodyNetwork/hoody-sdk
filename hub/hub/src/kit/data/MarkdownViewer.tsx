// MarkdownViewer: a long Markdown document in a box (a skill's SKILL.md, instructions).
// Rendered shows it through the reply renderer (parseMd + Prose: safe links, coloured fences); Raw shows the text as written.
// The caller passes a scrubbed source; scrubSecrets runs again here, before every view, Copy and Download, and on the
// names and the frontmatter too (a token-shaped file name or fact is shown, read out and saved like the body).
import { useEffect, useState } from 'react';
import { save } from '@core';
import { scrubSecrets } from '../agent/code';
import { Prose } from '../agent/Reply';
import { Button, cx } from '../controls/Button';
import { SegmentedControl } from '../controls/SegmentedControl';
import { ScrollRegion } from '../layouts/ScrollRegion';
import { ActionMenu } from '../overlays/Menu';
import { ErrorState, Skeleton } from '../states/States';
import { useStrings } from '../strings';
import { Facts } from './Display';
import { CodeBlock, CopyButton } from './Ids';
import { VIEWER_RENDER_MAX, VIEWER_SAVE_MAX, VIEWER_WITHHELD, viewerBytes, type ViewerView } from './MarkdownViewer.pure';
import strings from './MarkdownViewer.strings.en.json';
import s from './MarkdownViewer.module.css';

export { VIEWER_RENDER_MAX } from './MarkdownViewer.pure';

export interface MarkdownViewerProps {
  /** The file's name as shown ("SKILL.md"); also the region's name and the default Download name. */
  label: string;
  /** The document, already scrubbed by the caller; `''` = an empty file. */
  source?: string;
  /** Still loading: Skeleton rows, the one loading state. Wins over `source`. */
  loading?: boolean;
  /** Download name (default `label`). */
  fileName?: string;
  /** Max block size: sm 240px, md 480px (default), lg 70cqb; in a viewer under 480 px wide never more than 60cqb. */
  height?: 'sm' | 'md' | 'lg';
  /** Shown as Facts above the body, in order. */
  frontmatter?: readonly (readonly [string, string])[];
  /** The document could not be read: the failed state with the rejection's words and Details, never an empty file.
   *  Wins over `source`; `loading` wins over it. */
  error?: unknown;
  /** Read the document again (Try again on the failed state). */
  onRetry?: () => void;
}

type View = ViewerView;
const bytes = viewerBytes;
const WITHHELD = VIEWER_WITHHELD;

/** A long Markdown document in a box with a Rendered / Raw switch, Copy and Download, scrolling inside a region of
 * bounded height. Use CodeBlock instead for a command, config or output that is not a document. */
export function MarkdownViewer({ label, source, loading, fileName, height = 'md', frontmatter, error, onRetry }: MarkdownViewerProps) {
  const t = useStrings(strings);
  const [view, setView] = useState<View>('rendered');
  const [refused, setRefused] = useState(false);
  const failed = !loading && error != null;
  const missing = !loading && !failed && source === undefined;
  useEffect(() => {
    // A source left undefined when nothing loads is a caller's bug: say so in development and show the empty state,
    // never a Skeleton that waits forever.
    if (missing && import.meta.env.DEV) console.error(`hub MarkdownViewer: "${scrubSecrets(label)}" has no source and is not loading; pass loading or a source ('' for an empty file)`);
  }, [missing, label]);
  const text = loading || failed ? undefined : scrubSecrets(source ?? '');
  const name = scrubSecrets(label);
  const file = scrubSecrets(fileName ?? label);
  // A refusal belongs to the document it was for: any change of document, file name or a reload clears it (state
  // adjusted during render, React's pattern for a value derived from props). Keyed on the props as given: two different
  // secrets both read [hidden] once scrubbed, and are still two documents. The key is compared, never shown.
  const docKey = text === undefined ? undefined : `${fileName ?? label}\u0000${source ?? ''}`;
  const [shownFor, setShownFor] = useState(docKey);
  if (shownFor !== docKey) {
    setShownFor(docKey);
    setRefused(false);
  }
  // Facts wait with the body: none while loading (a previous document's facts never stay up).
  const facts = text === undefined ? [] : (frontmatter ?? []).map(([k, v]) => ({ label: scrubSecrets(k), value: scrubSecrets(v) }));
  const tooLong = text !== undefined && bytes(text) > VIEWER_RENDER_MAX;
  const shown: View = tooLong ? 'raw' : view;
  const download = () => {
    if (text === undefined) return;
    setRefused('refused' in save(file, [text], { maxBytes: VIEWER_SAVE_MAX }));
  };
  const ready = text !== undefined && text !== '';
  const items = [{ id: 'rendered' as const, label: t('viewer.rendered') }, { id: 'raw' as const, label: t('viewer.raw') }];
  return (
    <div className={cx(s.viewer, s[height])}>
      <div className={s.head}>
        <span className={s.label}>{name}</span>
        {ready && (
          <div className={s.actions}>
            {!tooLong && <SegmentedControl label={t('viewer.view', { label: name })} items={items} value={view} onChange={setView} />}
            <CopyButton label={t('viewer.copy', { label: name })} getValue={() => text} />
            <Button variant="secondary" size="sm" icon="download" aria-label={t('viewer.download', { file })} onPress={download}>
              {t('viewer.downloadShort')}
            </Button>
          </div>
        )}
        {ready && (
          <div className={s.more}>
            <ActionMenu
              label={t('viewer.more', { label: name })}
              items={[
                ...(tooLong ? [] : [{ id: 'toggle', label: shown === 'raw' ? t('viewer.rendered') : t('viewer.raw'), onAction: () => setView(shown === 'raw' ? 'rendered' : 'raw') }]),
                { id: 'copy', label: t('viewer.copyShort'), copy: text, onAction: () => undefined },
                { id: 'download', label: t('viewer.download', { file }), onAction: download },
              ]}
            />
          </div>
        )}
      </div>
      {refused && <p className={s.note} role="status">{t('viewer.saveRefused')}</p>}
      {facts.length > 0 && <Facts items={facts} />}
      {failed ? (
        <ErrorState size="sm" title={t('viewer.failed')} error={error} onRetry={onRetry} />
      ) : text === undefined ? (
        <Skeleton rows={6} />
      ) : text === '' ? (
        <p className={s.empty}>{t('viewer.empty')}</p>
      ) : (
        <>
          {tooLong && <p className={s.note}>{t('viewer.tooLong')}</p>}
          {text === WITHHELD && <p className={s.note}>{t('viewer.withheld')}</p>}
          {/* A keyboard-scrollable region: focus lets the arrows and Page keys scroll a long document. */}
          <ScrollRegion label={name} axis="both" className={s.region}>
            {shown === 'rendered' ? (
              <div dir="auto" className={s.rendered}>
                <Prose text={text} />
              </div>
            ) : (
              <div dir="ltr">
                <CodeBlock
                  label={name}
                  code={text}
                  wrap
                  lang="plain" // reason: a document's raw view is its text as written
                />
              </div>
            )}
          </ScrollRegion>
        </>
      )}
    </div>
  );
}
