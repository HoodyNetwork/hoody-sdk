// The shared left rail for the kit gallery: `/_kit?layout=rail` draws a RailFrame with a whole RailPane (head, RailNav with
// a RailSubnav under the current place, a list, RailFoot) beside the page, its PaneSeparator handle on a remembered width
// (usePaneWidth) clamped to the room the frame has (useElementWidth), as the AI tab does. `&strip=1`, or a page narrower than the
// rail plus the page column, is the rail as the whole screen: one slot, no handle, the screen list across (five screens, wider
// than a 320 px phone, so the strip scrolls sideways); `&screen=main`
// then shows the main region as the screen instead (as the AI tab does off its chat list).
// The main region is a kit ContentRegion, the `content` container its rules read, as the AI tab's: its section's
// ActionBar folds its secondaries into ⋯ exactly when that region's `@container content (width < 600px)` rules apply
// (rail.spec.ts checks the two agree at 1440, 900 and 390).
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createColumnHelper } from '@tanstack/react-table';
import { LinkButton } from '../controls/Button';
import { DataTable } from '../data/DataTable';
import { InlineActions, SuggestionActions } from '../layouts/anatomy/ActionBar';
import { AnatomySection } from '../layouts/anatomy/Section';
import { ContentRegion } from '../layouts/ContentRegion';
import { PageHeader } from '../layouts/PageHeader';
import { PaneSeparator, useElementWidth, usePaneWidth, type PaneRange } from '../layouts/PaneSeparator';
import { RailFoot, RailFrame, RailNav, RailPane, RailSubnav } from '../layouts/RailPane';
import { useContainerNarrow } from '../media';
import { useSearchParam } from '../nav';
import { ActionMenu } from '../overlays/Overlays';
import { useStrings } from '../strings';
import strings from './rail.strings.en.json';
import g from './gallery.module.css';

/** The suggestion specimen's ids, in order: short and long labels, so the row wraps at a phone width. */
const SUGGESTIONS = ['backup', 'weather', 'resize', 'digest', 'uptime', 'cleanup'] as const;

const RANGE: PaneRange = { min: 280, max: 560, def: 340 };
/** The page column keeps at least this much beside the rail. */
const PAGE_MIN = 480;
/** Below this page width the rail and the page take turns: the rail is the whole screen (as the AI tab). */
const NARROW = RANGE.min + PAGE_MIN;

interface Item {
  id: string;
  n: number;
}
const ITEMS: readonly Item[] = Array.from({ length: 24 }, (_, i) => ({ id: String(i + 1), n: i + 1 }));
const col = createColumnHelper<Item>();

/** The page region's height, so the sticky rail is exactly as tall as what shows (null before it is measured). */
function useRegionHeight(): number | null {
  const [h, setH] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = document.getElementById('hub-main');
    if (!el) return;
    const measure = () => setH(el.clientHeight > 0 ? el.clientHeight : null);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return h;
}

export function GalleryRail() {
  const t = useStrings(strings);
  const [stripParam] = useSearchParam('strip');
  const [screen] = useSearchParam('screen');
  // `&select=1`: the rail's list selects: on a coarse pointer its lead column takes the 44
  // check, clear of the row text.
  const [selectParam] = useSearchParam('select');
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set());
  const narrow = useContainerNarrow(NARROW);
  // `&strip=1` asks for the whole-screen rail at any width; below NARROW it is the only way the rail fits.
  const strip = stripParam === '1' || narrow;
  // Beside the page both show; as the whole screen one at a time, the rail unless `&screen=main`.
  const mainOnly = strip && screen === 'main';
  const height = useRegionHeight();
  const frameRef = useRef<HTMLDivElement>(null);
  const [railW, setRailW] = usePaneWidth('kit-gallery', 'rail', RANGE);
  const room = useElementWidth(frameRef, !strip);
  const range = useMemo<PaneRange>(() => {
    if (room === undefined) return RANGE;
    const max = Math.max(RANGE.min, Math.min(RANGE.max, room - PAGE_MIN));
    return { min: RANGE.min, max, def: Math.min(RANGE.def, max) };
  }, [room]);
  const shown = Math.min(railW, range.max);
  // The rail's list is a kit DataTable in list presentation: inside a RailPane it takes the rail grid and scrolls itself.
  const columns = useMemo(() => [col.accessor('n', { header: t('list.label'), cell: (c) => t('list.item', { n: String(c.getValue()) }) })], [t]);
  const sub = (
    <RailSubnav
      label={t('sub.label')}
      strip={strip}
      items={[
        { id: 'notes', href: '/_kit?layout=rail', label: t('sub.notes'), current: true },
        { id: 'files', href: '/_kit?layout=rail', label: t('sub.files') },
        { id: 'links', href: '/_kit?layout=rail', label: t('sub.links') },
        { id: 'shared', href: '/_kit?layout=rail', label: t('sub.shared') },
        { id: 'archive', href: '/_kit?layout=rail', label: t('sub.archive') },
      ]}
    />
  );
  return (
    <RailFrame ref={frameRef} width={shown} regionHeight={height} single={strip} data-gallery-rail="">
      {!mainOnly && (
        <RailPane
          label={t('label')}
          strip={strip}
          head={
            <LinkButton href="/_kit?layout=rail" variant="primary" icon="plus">
              {t('newItem')}
            </LinkButton>
          }
          nav={
            <RailNav
              label={t('nav.label')}
              items={[
                { id: 'inbox', href: '/_kit?layout=rail', icon: 'bell', label: t('nav.inbox'), mark: true },
                { id: 'library', href: '/_kit?layout=rail', icon: 'files', label: t('nav.library'), current: true, below: strip ? null : sub },
                { id: 'settings', href: '/_kit?layout=rail', icon: 'settings', label: t('nav.settings') },
              ]}
            />
          }
          foot={
            <RailFoot
              icon="computer"
              title={t('foot.where')}
              note={t('foot.note')}
              end={<ActionMenu label={t('foot.gear')} icon="sliders" placement="top end" items={[{ id: 'reset', label: t('foot.reset'), icon: 'reload', onAction: () => setRailW(RANGE.def) }]} />}
            />
          }
          handle={strip ? undefined : <PaneSeparator value={shown} range={range} onChange={setRailW} dir={1} label={t('resize')} />}
        >
          {strip && sub}
          <DataTable<Item>
            label={t('list.label')}
            columns={columns}
            data={ITEMS}
            getRowId={(r) => r.id}
            presentation="list"
            noViewMenu
            {...(selectParam === '1' ? { selectable: true, selectedIds: picked, onSelectionChange: setPicked } : {})}
          />
        </RailPane>
      )}
      {(!strip || mainOnly) && (
        <ContentRegion>
          <div className={g.railMain}>
            <PageHeader title={t('main.title')} subtitle={t('main.subtitle', { rail: String(shown), room: String(room ?? 0) })} />
            <AnatomySection
              id="fold"
              title={t('fold.title')}
              description={t('fold.description')}
              actions={{
                primary: { id: 'add', label: t('fold.add'), icon: 'plus', onPress: () => undefined },
                secondary: [
                  { id: 'import', label: t('fold.import'), onPress: () => undefined },
                  { id: 'export', label: t('fold.export'), onPress: () => undefined },
                ],
              }}
              state={{ kind: 'ready' }}
            >
              {t('fold.body')}
            </AnatomySection>
            <AnatomySection id="inline" title={t('inline.title')} description={t('inline.description')} state={{ kind: 'ready' }}>
              <InlineActions actions={[{ id: 'use-free', label: t('inline.use'), literal: true, onPress: () => undefined }]} />
              <InlineActions
                size="md"
                label={t('inline.outcome')}
                actions={[
                  { id: 'remove', label: t('inline.remove'), tone: 'danger', onPress: () => undefined },
                  { id: 'keep', label: t('inline.keep'), literal: true, disabledReason: t('inline.keepWhy'), onPress: () => undefined },
                ]}
              />
            </AnatomySection>
            <AnatomySection id="suggest" title={t('suggest.title')} description={t('suggest.description')} state={{ kind: 'ready' }}>
              <SuggestionActions
                label={t('suggest.label')}
                actions={SUGGESTIONS.map((id) => ({ id, label: t(`suggest.${id}` as never), onPress: () => undefined }))}
              />
            </AnatomySection>
          </div>
        </ContentRegion>
      )}
    </RailFrame>
  );
}
