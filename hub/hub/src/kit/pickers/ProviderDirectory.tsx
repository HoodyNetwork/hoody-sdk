// ProviderDirectory: the model chooser's "Set up a provider" view body, and AI Connect's provider choice
// (verb "connect", which lists Connected providers too). Providers only, never models.
//
// Contract:
//   - Sections, each an h4 and a list: Needs attention, Connected (connect only), Suggested, All providers · N, Other
//     ways. Each section with more rows than its page has its own pager; a page replaces the section's rows.
//   - Cards (Needs attention, Connected, Suggested): mark, name (full name in `title`), model count, the setup it
//     needs, the reason (attention only), Set up ("Set up OpenAI") and, with `onOpen`, "88 models ›".
//   - Rows (All providers): one ListItemButton per provider, its mark, name and facts ("88 models · API key"), named
//     "OpenAI · 88 models · API key" for readers, that opens the drill-in (or setup without one).
//   - A page change says the section's new range (a polite status line) and moves focus to its first new control.
//   - Other ways are always drawn, also while the catalogue cannot be read. `locked`: they are disabled (the
//     caller is saving), with "Wait for the save to finish".
//   - An included provider (Hoody AI) has nothing to set up: its facts say "Included with Hoody", and under verb
//     connect its button reads View ("View Hoody AI"); `onSetup` still receives it.
//   - `stale`: the evidence is an older answer kept after a failed read. The directory stays drawn under
//     "Checked {age} ago. Couldn't check again." with Try again.
import { providers } from '@core';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Button, cx } from '../controls/Button';
import { ListItemButton } from '../controls/ListItemButton';
import { Band } from '../states/Band';
import { useStrings } from '../strings';
import { ModelPager } from './ModelListbox';
import { PAGE, pageOf, pager, paged } from './modelPaging';
import { howOf } from './modelViews';
import { usePickerFocus } from './pickerFocus.web';
import { ProviderMark } from './ProviderMark';
import strings from './ModelChooser.strings.en.json';
import s from './ModelChooser.module.css';

type DirProvider = providers.DirProvider;

export interface ProviderDirectoryProps {
  evidence: providers.Evidence;
  purpose: providers.Purpose;
  verb: providers.Verb;
  current?: string | null;
  defaultSpec?: string | null;
  offer?: { endpoint?: boolean; claude?: boolean };
  /** The caller's generic word for a provider without a public label. */
  providerWord?: string;
  /** `fromId`: the control pressed, for the caller's focus restore. */
  onSetup: (providerId: string, fromId: string) => void;
  /** Open a provider's models (the drill-in). Without it, cards show no models link and rows set up. */
  onOpen?: (providerId: string, fromId: string) => void;
  onOtherWay: (way: providers.OtherWay) => void;
  locked?: boolean;
  /** Id prefix for the controls (focus restore by id). */
  idBase?: string;
  /** Controlled section pages (the chooser keeps them across a drill-in and Back); default: the directory's own. */
  pages?: DirPages;
  onPages?: (p: DirPages) => void;
  /** The evidence is an older answer kept after a failed read: the age band with Try again (`now`: the clock, tests). */
  stale?: { onRetry: () => void; now?: () => number };
}

type T = ReturnType<typeof useStrings<typeof strings>>;
type Section = 'attention' | 'connected' | 'all';
/** Each paged section's page (0-based). */
export type DirPages = Readonly<Record<Section, number>>;
export const NO_PAGES: DirPages = { attention: 0, connected: 0, all: 0 };

const nameOf = (p: DirProvider, word: string) => p.label || word;

/** How long ago an answer came, in the chooser's words ("less than a minute", "5 min", "2 h"). */
export function ageText(t: T, ms: number): string {
  const min = Math.floor(ms / 60000);
  if (min < 1) return t('age.now');
  if (min < 60) return t('age.min', { count: min });
  return t('age.hour', { count: Math.floor(min / 60) });
}

function stateWords(t: T, cat: providers.Catalogue | null, p: DirProvider): string {
  if (p.pay === 'included') return t('dir.included');
  if (p.state === 'not_checked') return t('dir.notChecked');
  if (p.state === 'stored') return t('dir.keyStored');
  return cat ? t(`dir.how.${howOf(cat, p.id)}`) : t('dir.how.ai');
}

/** The id a provider's controls carry, for focus restore. */
export const dirControlId = (base: string, kind: 'setup' | 'open' | 'row', providerId: string): string => `${base}-${kind}-${providerId.replace(/[^\w-]/g, '_')}`;

export function ProviderDirectory({ evidence, purpose, verb, current, defaultSpec, offer, providerWord, onSetup, onOpen, onOtherWay, locked, idBase = 'mc-dir', pages: givenPages, onPages, stale }: ProviderDirectoryProps) {
  const t = useStrings(strings);
  const word = providerWord ?? t('mc.provider');
  const dir = useMemo(() => providers.directory(evidence, { purpose, verb, current, defaultSpec, offer }), [evidence, purpose, verb, current, defaultSpec, offer]);
  const cat = evidence.catalogue.state === 'ok' ? evidence.catalogue.value.cat : null;
  const [own, setOwn] = useState<DirPages>(NO_PAGES);
  const pages = givenPages ?? own;
  const setPages = onPages ?? setOwn;
  const [live, setLive] = useState('');
  // A page change asks for focus on the section's first control, once that page is drawn.
  const rootRef = useRef<HTMLDivElement>(null);
  const pf = usePickerFocus(rootRef);
  const [focusAsk, setFocusAsk] = useState<{ token: number; section: Section } | null>(null);
  useLayoutEffect(() => {
    if (focusAsk) pf.toFirst(`${idBase}-rows-${focusAsk.section}`, 'button:not([disabled])');
  }, [focusAsk, idBase, pf]);
  const setPage = (k: Section, total: number, size: number, page: number) => {
    const pg = pager(total, size, page);
    setPages({ ...pages, [k]: pg.page });
    setLive(t('page.live', { from: pg.from, to: pg.to, total }));
    setFocusAsk((f) => ({ token: (f?.token ?? 0) + 1, section: k }));
  };

  const card = (p: DirProvider, attention: boolean) => {
    const name = nameOf(p, word);
    const view = verb === 'connect' && p.pay === 'included';
    return (
      <li key={p.id} data-mc-row="" data-provider={p.id}>
        <div className={cx(s.card, attention && s.cardAttention)}>
          <div className={s.cardTop}>
            <ProviderMark id={p.id} name={name} />
            <span className={s.cardName} title={name}>
              {name}
            </span>
            <span className={s.cardSetup}>
              <Button variant="secondary" size="sm" id={dirControlId(idBase, 'setup', p.id)} isDisabled={locked} aria-label={t(view ? 'dir.viewFor' : 'dir.setupFor', { provider: name })} onPress={() => onSetup(p.id, dirControlId(idBase, 'setup', p.id))}>
                {t(view ? 'dir.view' : 'dir.setup')}
              </Button>
            </span>
          </div>
          <span className={s.cardFacts}>
            {t('dir.models', { count: p.models })} · {stateWords(t, cat, p)}
          </span>
          {attention && p.reason && <p className={s.reason}>{t(`dir.why.${p.reason}`)}</p>}
          {onOpen && (
            <span>
              <Button variant="ghost" size="sm" id={dirControlId(idBase, 'open', p.id)} iconEnd="chevron-right" aria-label={t('dir.modelsOf', { models: t('dir.models', { count: p.models }), provider: name })} onPress={() => onOpen(p.id, dirControlId(idBase, 'open', p.id))}>
                {t('dir.models', { count: p.models })}
              </Button>
            </span>
          )}
        </div>
      </li>
    );
  };

  const pagerOf = (k: Section, title: string, total: number, size: number) =>
    paged(total, size) ? (
      <ModelPager
        pg={pager(total, size, pages[k])}
        navLabel={t('page.nav', { section: title })}
        range={t('page.range', { from: pager(total, size, pages[k]).from, to: pager(total, size, pages[k]).to, total })}
        prev={t('page.prev')}
        next={t('page.next')}
        onPage={(p) => setPage(k, total, size, p)}
        idBase={`${idBase}-${k}`}
      />
    ) : null;

  const section = (k: Section | 'suggested', title: string, rows: DirProvider[], size: number, attention = false) => {
    if (!rows.length) return null;
    const shown = k === 'suggested' ? rows.slice(0, size) : pageOf(rows, size, pages[k]);
    const hid = `${idBase}-h-${k}`;
    return (
      <section className={s.section} aria-labelledby={hid}>
        <h4 id={hid} className={s.sectionTitle}>
          {title}
        </h4>
        <ul className={s.cards} id={`${idBase}-rows-${k}`}>
          {shown.map((p) => card(p, attention))}
        </ul>
        {k !== 'suggested' && pagerOf(k, title, rows.length, size)}
      </section>
    );
  };

  const allTitle = t('dir.allCount', { count: dir.all.length });
  const allRows = pageOf(dir.all, PAGE.all, pages.all);

  return (
    <div ref={rootRef} className={s.browser}>
      {stale && evidence.catalogue.state === 'ok' && (
        <Band
          tone="warn"
          size="table"
          actions={
            <Button variant="secondary" size="sm" onPress={stale.onRetry}>
              {t('read.retry')}
            </Button>
          }
        >
          {t('read.age', { age: ageText(t, (stale.now ?? Date.now)() - evidence.at) })}
        </Band>
      )}
      {!dir.available && <p className={s.state}>{t('dir.unavailable')}</p>}
      {section('attention', t('dir.attention'), dir.attention, PAGE.attention, true)}
      {section('connected', t('dir.connected'), dir.connected, PAGE.connected)}
      {section('suggested', t('dir.suggested'), dir.suggested, PAGE.suggested)}
      {dir.all.length > 0 && (
        <section className={s.section} aria-labelledby={`${idBase}-h-all`}>
          <h4 id={`${idBase}-h-all`} className={s.sectionTitle}>
            {allTitle}
          </h4>
          <ul className={s.rows} id={`${idBase}-rows-all`}>
            {allRows.map((p) => {
              const name = nameOf(p, word);
              const models = t('dir.models', { count: p.models });
              const how = stateWords(t, cat, p);
              const rid = dirControlId(idBase, 'row', p.id);
              return (
                <li key={p.id} data-mc-row="" data-provider={p.id}>
                  <ListItemButton
                    id={rid}
                    leading={<ProviderMark id={p.id} name={name} />}
                    meta={t('dir.facts', { models, how })}
                    isDisabled={locked && !onOpen}
                    onPress={() => (onOpen ? onOpen(p.id, rid) : onSetup(p.id, rid))}
                  >
                    {name}
                  </ListItemButton>
                </li>
              );
            })}
          </ul>
          {pagerOf('all', t('dir.all'), dir.all.length, PAGE.all)}
        </section>
      )}
      {dir.other.length > 0 && (
        <section className={s.section} aria-labelledby={`${idBase}-h-other`}>
          <h4 id={`${idBase}-h-other`} className={s.sectionTitle}>
            {t('dir.other')}
          </h4>
          <ul className={s.actions}>
            {dir.other.map((way) => (
              <li key={way} data-mc-row="">
                <Button variant="secondary" size="sm" id={`${idBase}-other-${way}`} isDisabled={locked} onPress={() => onOtherWay(way)}>
                  {way === 'endpoint' ? t('dir.endpoint') : t('dir.claude')}
                </Button>
              </li>
            ))}
          </ul>
          {locked && <p className={s.state}>{t('save.wait')}</p>}
        </section>
      )}
      <div role="status" aria-live="polite" className={s.srOnly}>
        {live}
      </div>
    </div>
  );
}
