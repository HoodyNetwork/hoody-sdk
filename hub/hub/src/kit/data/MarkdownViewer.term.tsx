// MarkdownViewer in the terminal: the same head (name, Rendered / Raw, Copy, and Download where the host can save a
// file), the same facts, states and scrubbing, over a region that is as tall as the document and never taller than its
// size (sm 15 rows, md 30, lg 70 % of the pane) nor than 70 % of the pane, so the head and what follows the viewer stay
// on screen. A longer document scrolls inside the region (the kit ScrollRegion: one Tab stop, arrows and Page keys).
import { useEffect, useState } from 'react';
import { hostEnv } from '@core';
import type * as Web from './MarkdownViewer';
import { Box, Text, useBoxSize } from '@term/prim';
import { usePaneSize } from '@term/kit';
import { scrubSecrets } from '../agent/code';
import { Prose } from '../agent/Reply';
import { Button } from '../controls/Button';
import { SegmentedControl } from '../controls/SegmentedControl';
import { ScrollRegion } from '../layouts/ScrollRegion';
import { ErrorState, Skeleton } from '../states/States';
import { useStrings } from '../strings';
import { Facts } from './Display';
import { CodeBlock, CopyButton } from './Ids';
import { VIEWER_RENDER_MAX, VIEWER_SAVE_MAX, VIEWER_WITHHELD, viewerBytes, type ViewerView } from './MarkdownViewer.pure';
import strings from './MarkdownViewer.strings.en.json';

export type { MarkdownViewerProps } from './MarkdownViewer';
export { VIEWER_RENDER_MAX } from './MarkdownViewer.pure';

/** The region's most rows: the web's 240 px and 480 px at 16 px a row, 70 % of the pane for `lg`; never more than
 *  70 % of the pane, never fewer than 5. */
function regionRows(height: 'sm' | 'md' | 'lg', paneRows: number): number {
  const most = Math.max(5, Math.floor(paneRows * 0.7));
  return Math.min(height === 'sm' ? 15 : height === 'md' ? 30 : most, most);
}

export const MarkdownViewer: typeof Web.MarkdownViewer = ({ label, source, loading, fileName, height = 'md', frontmatter, error, onRetry }) => {
  const t = useStrings(strings);
  const pane = usePaneSize();
  // The document's own height, measured inside the region: the region is that tall, up to its most rows.
  const [doc, onDoc] = useBoxSize();
  const [view, setView] = useState<ViewerView>('rendered');
  const [refused, setRefused] = useState(false);
  const failed = !loading && error != null;
  const missing = !loading && !failed && source === undefined;
  useEffect(() => {
    if (missing && import.meta.env.DEV) console.error(`hub MarkdownViewer: "${scrubSecrets(label)}" has no source and is not loading; pass loading or a source ('' for an empty file)`);
  }, [missing, label]);
  const text = loading || failed ? undefined : scrubSecrets(source ?? '');
  const name = scrubSecrets(label);
  const file = scrubSecrets(fileName ?? label);
  // A refusal belongs to the document it was for (the web's rule: state adjusted during render).
  const docKey = text === undefined ? undefined : `${fileName ?? label}\u0000${source ?? ''}`;
  const [shownFor, setShownFor] = useState(docKey);
  if (shownFor !== docKey) {
    setShownFor(docKey);
    setRefused(false);
  }
  const facts = text === undefined ? [] : (frontmatter ?? []).map(([k, v]) => ({ label: scrubSecrets(k), value: scrubSecrets(v) }));
  const tooLong = text !== undefined && viewerBytes(text) > VIEWER_RENDER_MAX;
  const shown: ViewerView = tooLong ? 'raw' : view;
  // Saving a file is the host's: where it cannot (most terminals), the action is left out (core/host-env.ts `files`).
  const files = hostEnv().files ?? null;
  const download = () => {
    if (text === undefined || !files) return;
    if (viewerBytes(text) > VIEWER_SAVE_MAX) { setRefused(true); return; }
    setRefused(false);
    void files.save(file, text).then((ok) => { if (!ok) setRefused(true); }, () => setRefused(true));
  };
  const ready = text !== undefined && text !== '';
  const items = [{ id: 'rendered' as const, label: t('viewer.rendered') }, { id: 'raw' as const, label: t('viewer.raw') }];
  return (
    <Box dir="column" shrink={0}>
      <Box dir="row" wrap gapX={2} shrink={0} justify="between">
        <Text bold colour="ink" truncate shrink={1}>{name}</Text>
        {ready && (
          <Box dir="row" gap={2} shrink={0}>
            {!tooLong && <SegmentedControl label={t('viewer.view', { label: name })} items={items} value={view} onChange={setView} />}
            <CopyButton label={t('viewer.copy', { label: name })} getValue={() => text} />
            {files && (
              <Button variant="secondary" size="sm" icon="download" aria-label={t('viewer.download', { file })} onPress={download}>
                {t('viewer.downloadShort')}
              </Button>
            )}
          </Box>
        )}
      </Box>
      {refused && <Box shrink={0} sem={{ role: 'status' }}><Text colour="muted">{t('viewer.saveRefused')}</Text></Box>}
      {facts.length > 0 && <Facts items={facts} />}
      {failed ? (
        <ErrorState size="sm" title={t('viewer.failed')} error={error} onRetry={onRetry} />
      ) : text === undefined ? (
        <Skeleton rows={6} />
      ) : text === '' ? (
        <Text colour="muted">{t('viewer.empty')}</Text>
      ) : (
        <>
          {tooLong && <Text colour="muted">{t('viewer.tooLong')}</Text>}
          {text === VIEWER_WITHHELD && <Text colour="muted">{t('viewer.withheld')}</Text>}
          <Box dir="column" shrink={0} height={Math.max(1, Math.min(regionRows(height, pane.rows), doc?.height ?? 3))}>
            <ScrollRegion label={name} axis="both">
              <Box dir="column" shrink={0} onSize={onDoc}>
                {shown === 'rendered' ? (
                  <Prose text={text} />
                ) : (
                  <CodeBlock
                    label={name}
                    code={text}
                    wrap
                    lang="plain" // reason: a document's raw view is its text as written
                  />
                )}
              </Box>
            </ScrollRegion>
          </Box>
        </>
      )}
    </Box>
  );
};
