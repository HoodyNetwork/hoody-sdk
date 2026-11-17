// ModelPicker: the kit's flat model picker (the full chooser, with search and setup, is ModelChooser). PickerPanel in
// single mode, one group per provider with its readiness word (Ready / Can't tell), ensembles last, and tags for the
// current model, the computer's default and the recommended one.
//
// Contract:
//   - `models` undefined means still loading. The picker keeps no pick of its own: `value` in, `onChange` out.
//   - The list holds only what can be picked now: ready models, models whose readiness can't be told, and the current
//     model whatever its state (it may be the one that lost its connection). A model whose provider needs setup is not
//     a row. One line under the list says more models come with a provider, with `onProviders` as its action.
//   - While a search is typed, up to SETUP_MATCHES needs-setup models that match show under "Needs setup"; the line
//     under the list counts the rest. Such a model never reaches onChange. With `onSetup`, picking it asks for setup of
//     that provider (the caller opens its setup step and picks the model once it answers). Without onSetup the
//     row is disabled and says where to connect.
//   - Past `maxRows` rows the list scrolls inside itself (PickerPanel maxRows); the search and the line stay put.
//   - Readiness is the caller's truth (core providers: never invented); 'unknown' reads "Can't tell".
//   - "Current" marks `current` (what runs now; default: `value`), so a pick not yet applied is never called current.
//   - The search stays inside the panel (no URL, no page re-render).
//   - Ensembles show only with `fusion` (the caller says they run there); Claude Code rows (source claude_code,
//     from core agent choices) form their own group, after the providers.
import { useMemo, useState, type ReactNode } from 'react';
import { TextButton } from '../controls/Link';
import { useStrings } from '../strings';
import { groupModels, type ModelChoice } from './modelPickerLogic';
import { filterItems } from './pickerLogic';
import { PickerPanel, type PickerItem } from './PickerPanel';
import strings from './ModelPicker.strings.en.json';
import s from './ModelPicker.module.css';

/** Needs-setup models a search shows at most. */
export const SETUP_MATCHES = 5;
/** Rows shown before the list scrolls inside itself. */
const MAX_ROWS = 5;

export type { ModelChoice, ModelReady } from './modelPickerLogic';

export interface ModelPickerProps {
  /** The accessible name of the list ("Model"). */
  label: string;
  showLabel?: boolean;
  models: readonly ModelChoice[] | undefined;
  value: string;
  onChange: (spec: string) => void;
  /** What runs now (tagged "Current"), when `value` may hold a pick not applied yet. Default: `value`. */
  current?: string;
  /** The spec the computer uses when nothing is set (tagged). */
  defaultSpec?: string;
  /** Ensembles run where this picker chooses: show them (default: hidden). */
  fusion?: boolean;
  /** A needs-setup model was picked: open setup for its provider. */
  onSetup?: (model: ModelChoice) => void;
  /** Opens the place where a provider is set up (the action of the line under the list). */
  onProviders?: () => void;
  /** Rows shown before the list scrolls inside itself (default 5). */
  maxRows?: number;
  /** The last stop ("Connect another provider"). */
  renderCreate?: () => ReactNode;
  /** The readiness read failed: rows stay, a compact error with Retry shows above them. */
  status?: { error?: unknown; onRetry?: () => void; details?: ReactNode };
  isDisabled?: boolean;
  /** Why the picker is disabled now: the action of the line under the list then stays a keyboard stop and says it. */
  disabledReason?: string;
  className?: string;
}

export function ModelPicker({ label, showLabel, models, value, current = value, onChange, defaultSpec, fusion, onSetup, onProviders, maxRows = MAX_ROWS, renderCreate, status, isDisabled, disabledReason, className }: ModelPickerProps) {
  const t = useStrings(strings);
  const [query, setQuery] = useState('');
  const { listed, setup, away, bySpec } = useMemo(() => {
    const listed: PickerItem[] = [];
    const setup: PickerItem[] = [];
    const map = new Map<string, ModelChoice>();
    // One model of each provider that has rows left out (the line under the list names a lone one).
    const away = new Map<string, ModelChoice | null>();
    if (!models) return { listed: undefined, setup, away, bySpec: map };
    for (const g of groupModels(fusion ? models : models.filter((m) => m.source !== 'fusion'), current)) {
      const provider = g.fusion ? t('mp.ensembles') : g.label;
      const group = t('mp.group', { provider, state: t(`mp.state.${g.ready}`) });
      for (const m of g.models) {
        map.set(m.spec, m);
        const tags = [m.spec === current && t('mp.current'), m.spec === defaultSpec && t('mp.default'), m.recommended && t('mp.recommended')].filter(Boolean).join(' · ');
        const needs = m.ready === 'needs_key';
        // Kept in the list whatever its state: what runs now, and what is picked.
        const held = m.spec === current || m.spec === value;
        if (needs && !held && !away.has(g.id)) away.set(g.id, g.fusion ? null : m);
        (needs && !held ? setup : listed).push({
          id: m.spec,
          label: m.label,
          group: needs && !held ? t('mp.needsSetup') : group,
          facts: tags || undefined,
          // The provider's name stays searchable under the "Needs setup" heading too.
          keywords: [m.providerLabel],
          description: needs && onSetup ? t('mp.setup', { provider: m.providerLabel }) : undefined,
          isDisabled: needs && !onSetup,
          disabledReason: needs && !onSetup ? t('mp.setupNone', { provider: m.providerLabel }) : undefined,
        });
      }
    }
    return { listed, setup, away, bySpec: map };
  }, [models, value, current, defaultSpec, fusion, onSetup, t]);

  // A search also finds models that need setup: the first few matches, after the ones that can be picked.
  const matches = useMemo(() => (query.trim() === '' ? [] : filterItems(setup, query)), [setup, query]);
  const items = useMemo(() => (listed ? [...listed, ...matches.slice(0, SETUP_MATCHES)] : undefined), [listed, matches]);
  const over = matches.length - SETUP_MATCHES;

  // One provider holds every model left out: the line names it and sets that one up.
  const lone = away.size === 1 ? [...away.values()][0] : null;
  const more = () => (
    <>
      {setup.length > 0 && (
        <p className={s.more}>
          {over > 0 ? t('mp.moreMatches', { count: over }) : lone ? t('mp.moreOne', { provider: lone.providerLabel }) : t('mp.more')}
          {lone && onSetup ? (
            <TextButton literal onPress={() => onSetup(lone)} isDisabled={isDisabled} disabledReason={isDisabled ? disabledReason : undefined}>
              {t('mp.moreActionOne', { provider: lone.providerLabel })}
            </TextButton>
          ) : onProviders ? (
            <TextButton onPress={onProviders} isDisabled={isDisabled} disabledReason={isDisabled ? disabledReason : undefined}>
              {t('mp.moreAction')}
            </TextButton>
          ) : null}
        </p>
      )}
      {renderCreate?.()}
    </>
  );

  const pick = (ids: string[]) => {
    const spec = ids[0];
    const m = spec === undefined ? undefined : bySpec.get(spec);
    if (!m) return;
    // Setup first: the current model may be the one that lost its connection.
    if (m.ready === 'needs_key') {
      onSetup?.(m);
      return;
    }
    if (m.spec !== value) onChange(m.spec);
  };

  return (
    <PickerPanel
      label={label}
      showLabel={showLabel}
      items={items}
      mode="single"
      value={value ? [value] : []}
      onChange={pick}
      onQuery={setQuery}
      searchTally={(count) => t('mp.shown', { count })}
      maxRows={maxRows}
      searchable
      searchLabel={t('mp.search')}
      emptyText={setup.length > 0 ? t('mp.noneReady') : t('mp.empty')}
      renderCreate={setup.length > 0 || renderCreate ? more : undefined}
      status={status && status.error !== undefined ? { error: status.error, onRetry: status.onRetry, title: t('mp.error'), details: status.details } : undefined}
      isDisabled={isDisabled}
      className={className}
    />
  );
}
