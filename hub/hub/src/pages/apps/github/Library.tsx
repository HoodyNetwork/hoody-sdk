// The library step of From GitHub: the program library under the
// pane's one box. A rail (Start here, All programs, the categories with their counts; during a search, the results per
// category), one filter row (Kind, Stack, Tag) with the count at its end, and the programs as a grid of pick cards (the
// kit CardGrid: one Tab stop, arrow keys, type-ahead). Picking a card hands its repository to the pane, which shows it
// in its Ready step; nothing is sent before Start. All of it is local state the pane keeps,
// so Library after a pick returns to the same search, filters and place; no URL is read or written here.
// Nothing here fetches anything from GitHub: the library is a static chunk (library.ts), and the only GitHub link is the
// search one under "no match", opened in a new tab by the person.
import { PAGE, licenceWord } from './Library.pure';
import type { T } from './Library.pure';
export { useLibrary, PAGE, START, licenceWord } from './Library.pure';
export type { LibraryState, Browse } from './Library.pure';
import type { LibraryState, Browse } from './Library.pure';
import { useCallback, useMemo } from 'react';
import { AnatomySection, Button, CardGrid, FilterChips, PickCard, Row, SectionMenuItem, Stack, SectionMenuList, StatusPill, useStrings, type FilterChip, type RealmColor } from '@kit';
import strings from '../strings.en.json';
import type { Repo } from '../github';
import { POPULAR, deriveFacets, findByRepo, searchLibrary, type Library as Lib, type LibraryFilter, type LibraryKind, type LibraryProgram } from './library';
import s from './library.module.css';
import { ProgramMark } from './marks';
const ALL = 'all';

/** A category's tint, from its place in the file's list: a mark's colour carries no meaning, it only tells categories apart. */
const TINTS: readonly RealmColor[] = ['blue', 'green', 'orange', 'purple', 'teal', 'red', 'pink', 'yellow'];
/** The tint of a category's marks (the cards' and Ready's); an unknown category takes the first. */
export const categoryTint = (lib: Lib, id: string): RealmColor => TINTS[Math.max(0, lib.categories.findIndex((c) => c.id === id)) % TINTS.length]!;

const kindWord = (t: T, k: LibraryKind): string => t(`gh.lib.kind.${k}`);

export interface LibraryViewProps {
  state: LibraryState;
  retry: () => void;
  /** The words in the box ('' for none). */
  q: string;
  browse: Browse;
  onBrowse: (b: Browse) => void;
  /** The program opened last ("you were here"), if any. */
  here: string | undefined;
  /** A request to focus that card (Library, back from its address); the pane drops it at the next edit. */
  focusKey?: string | undefined;
  onPick: (p: LibraryProgram) => void;
  /** Clears the box (no match's Clear search). */
  onClearSearch: () => void;
  /** The pane is narrower than the kit's one breakpoint: the rail becomes a Category chip. */
  narrow: boolean;
}

export function LibraryView({ state, retry, q, browse, onBrowse, here, focusKey, onPick, onClearSearch, narrow }: LibraryViewProps) {
  const t = useStrings(strings);
  if (state.kind !== 'ready') {
    // The library is its own chunk: its loading and failed states are the section's; a pasted address works meanwhile.
    return (
      <AnatomySection
        id="gh-library"
        title={t('gh.lib.title')}
        description={state.kind === 'failed' ? t('gh.lib.failedBody') : undefined}
        state={state.kind === 'loading' ? { kind: 'loading', rows: 4 } : { kind: 'failed', error: state.error, onRetry: retry }}
      />
    );
  }
  return <Loaded lib={state.lib} q={q} browse={browse} onBrowse={onBrowse} here={here} focusKey={focusKey} onPick={onPick} onClearSearch={onClearSearch} narrow={narrow} />;
}

function Loaded({ lib, q, browse, onBrowse, here, focusKey, onPick, onClearSearch, narrow }: Omit<LibraryViewProps, 'state' | 'retry'> & { lib: Lib }) {
  const t = useStrings(strings);
  const facets = useMemo(() => deriveFacets(lib), [lib]);
  const tintOf = useCallback((id: string) => categoryTint(lib, id), [lib]);
  const labelOf = useMemo(() => new Map(lib.categories.map((c) => [c.id, c.label])), [lib]);
  const searching = q.trim() !== '';
  const filter: LibraryFilter = { kind: browse.kind, stack: browse.stack, tag: browse.tag };
  // In a search the rail shows the results per category; a category with none can't be chosen.
  const found = useMemo(() => (searching ? searchLibrary(lib, q, filter) : []), [lib, q, searching, filter.kind, filter.stack, filter.tag]); // eslint-disable-line react-hooks/exhaustive-deps -- filter's fields are the deps
  const category = browse.view !== POPULAR && browse.view !== ALL ? browse.view : undefined;
  const cat = category ? lib.categories.find((c) => c.id === category) : undefined;
  const list = useMemo(() => {
    if (searching) return category ? found.filter((p) => p.category === category) : found;
    if (browse.view === POPULAR) return searchLibrary(lib, '', { ...filter, category: POPULAR });
    const rows = searchLibrary(lib, '', { ...filter, category });
    // A category: its well-known programs first (with their why line), then the rest A to Z. All programs: A to Z.
    const byName = (a: LibraryProgram, b: LibraryProgram) => a.name.localeCompare(b.name);
    return category ? [...rows.filter((p) => p.popular).sort(byName), ...rows.filter((p) => !p.popular).sort(byName)] : [...rows].sort(byName);
  }, [lib, searching, found, category, browse.view, filter.kind, filter.stack, filter.tag]); // eslint-disable-line react-hooks/exhaustive-deps -- filter's fields are the deps
  const shown = list.slice(0, browse.shown);
  const set = (b: Partial<Browse>) => onBrowse({ ...browse, shown: PAGE, ...b });
  const why = (p: LibraryProgram) => searching || browse.view === POPULAR || (!!category && p.popular);

  const views = [
    { value: POPULAR, label: t('gh.lib.startHere'), count: facets.popular },
    { value: ALL, label: t('gh.lib.all'), count: lib.programs.length },
    ...facets.categories.map((c) => ({ value: c.value, label: c.label, count: c.count })),
  ];
  const searchViews = [
    { value: ALL, label: t('gh.lib.allResults'), count: found.length },
    ...facets.categories.map((c) => ({ value: c.value, label: c.label, count: found.filter((p) => p.category === c.value).length })),
  ];
  const rail = searching ? searchViews : views;
  // A search keeps a chosen category; Start here reads as all results while searching.
  const current = searching && browse.view === POPULAR ? ALL : browse.view;
  const chips: FilterChip[] = [
    // Narrow, the rail's choices: a category with no results is left out, as the rail disables it (the one chosen stays).
    ...(narrow ? [{ id: 'category', label: t('gh.lib.category'), options: rail.filter((v) => !searching || v.count > 0 || v.value === ALL || v.value === current).map((v) => ({ value: v.value, label: v.label, count: v.count })), value: current, required: true, onChange: (v: string | undefined) => set({ view: v ?? POPULAR }) } satisfies FilterChip] : []),
    { id: 'kind', label: t('gh.lib.kindLabel'), options: facets.kinds.map((k) => ({ value: k.value, label: kindWord(t, k.value), count: k.count })), value: browse.kind, display: narrow ? 'chip' : 'segmented', onChange: (v) => set({ kind: v as LibraryKind | undefined }) },
    { id: 'stack', label: t('gh.lib.stack'), options: facets.stacks.map((f) => ({ value: f.value, label: f.value, count: f.count })), value: browse.stack, onChange: (v) => set({ stack: v }) },
    { id: 'tag', label: t('gh.lib.tag'), options: facets.tags.map((f) => ({ value: f.value, label: f.value, count: f.count })), value: browse.tag, onChange: (v) => set({ tag: v }) },
  ];
  const clearFilters = () => set({ kind: undefined, stack: undefined, tag: undefined });
  const filtered = browse.kind !== undefined || browse.stack !== undefined || browse.tag !== undefined;
  // No match keeps the filters in sight (they sit above the section, outside its state body); its one action clears the
  // filters when any is set, else the search (a category alone always has programs).

  const keyOf = useCallback((p: LibraryProgram) => p.id, []);
  const textOf = useCallback((p: LibraryProgram) => `${p.name}, ${kindWord(t, p.kind)}, ${p.tagline}`, [t]);
  // The facts line, as parts: on a narrow card the last ones are left out, never wrapped.
  const metaOf = (p: LibraryProgram): string[] => [searching ? labelOf.get(p.category) : null, `${p.owner}/${p.repo}`, p.stack, licenceWord(t, p.license)].filter((x): x is string => !!x);
  const renderCard = (p: LibraryProgram) => (
    <PickCard
      title={p.name}
      mark={<ProgramMark name={p.name} size="lg" tint={tintOf(p.category)} />}
      end={<StatusPill>{kindWord(t, p.kind)}</StatusPill>}
      line={p.tagline}
      note={why(p) ? p.why : undefined}
      meta={metaOf(p).join(' · ')}
      // Drawn with the repository first: on a narrow card the parts left out are the last ones.
      metaParts={[`${p.owner}/${p.repo}`, p.stack, licenceWord(t, p.license), searching ? labelOf.get(p.category) : null].filter((x): x is string => !!x)}
      here={p.id === here ? t('gh.lib.here') : undefined}
    />
  );

  const title = searching ? t('gh.lib.results') : (rail.find((v) => v.value === current)?.label ?? t('gh.lib.all'));
  const Frame = narrow ? Stack : Row;
  return (
    <Frame gap={narrow ? 3 : 5} align={narrow ? 'stretch' : 'start'}>
      {narrow ? null : (
        <div className={s.rail}>
        <SectionMenuList role="group" aria-label={t('gh.lib.rail')}>
          {rail.map((v) => (
            <SectionMenuItem key={v.value} current={v.value === current} aria-current={v.value === current ? 'true' : undefined} disabled={searching && v.count === 0 && v.value !== ALL} onClick={() => set({ view: v.value })}>
              {t('gh.lib.railItem', { label: v.label, count: v.count })}
            </SectionMenuItem>
          ))}
        </SectionMenuList>
        </div>
      )}
      <div className={s.main}>
      <Stack gap={3}>
      <FilterChips filters={chips} onClearAll={clearFilters} />
      <AnatomySection
        id="gh-library"
        title={title}
        description={cat && !searching ? t('gh.lib.blurb', { blurb: cat.blurb, count: list.length }) : t('gh.lib.count', { count: list.length })}
        state={list.length ? { kind: 'ready' } : { kind: 'noMatch', onClear: filtered ? clearFilters : onClearSearch }}
      >
        <CardGrid label={title} items={shown} keyOf={keyOf} textOf={textOf} renderCard={renderCard} onPick={(id) => {
          const p = shown.find((x) => x.id === id);
          if (p) onPick(p);
        }} focusKey={focusKey} />
        {list.length > shown.length ? (
          <Row>
            <Button variant="secondary" literal onPress={() => onBrowse({ ...browse, shown: browse.shown + PAGE })}>
              {t('gh.lib.more', { count: Math.min(PAGE, list.length - shown.length) })}
            </Button>
          </Row>
        ) : null}
      </AnatomySection>
      </Stack>
      </div>
    </Frame>
  );
}

/** A pasted address as the one card in place of the library: its library program's card when the library holds
 *  the repository (its plain address, no ref or path), else the repository's own with a "?" mark and "Not in the
 *  library". Its press (or Enter in the box) opens Ready. */
export function AddressCard({ repo, lib, cardKey, focusKey, onPick }: { repo: Repo; lib: Lib | null; cardKey: string; focusKey?: string | undefined; onPick: () => void }) {
  const t = useStrings(strings);
  const program = lib && !repo.ref ? findByRepo(lib, repo) : undefined;
  const address = `${repo.owner}/${repo.name}`;
  const keyOf = useCallback(() => cardKey, [cardKey]);
  const textOf = useCallback(() => (program ? `${program.name}, ${kindWord(t, program.kind)}, ${program.tagline}` : `${address}, ${t('gh.notInLibrary')}`), [program, address, t]);
  const renderCard = () => (
    <PickCard
      title={program ? program.name : address}
      mark={<ProgramMark name={program ? program.name : '?'} size="lg" tint={program && lib ? categoryTint(lib, program.category) : undefined} />}
      end={program ? <StatusPill>{kindWord(t, program.kind)}</StatusPill> : undefined}
      line={program ? program.tagline : t('gh.notInLibrary')}
      meta={address}
    />
  );
  return <CardGrid label={t('gh.addressCard')} items={[repo]} keyOf={keyOf} textOf={textOf} renderCard={renderCard} onPick={onPick} focusKey={focusKey} />;
}
