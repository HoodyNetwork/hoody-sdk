// The status of each source while a query runs: searching, then the rows it adds to the list ("Nix: 7", 0 included),
// or Didn't answer / Getting ready; the catalogue's own apps as "Ready to install: N", so the chips add up to the list's
// total (a failed or warming source that lists rows shows its count beside its words). Try again for the failed ones, and the toggle for what is left out (libraries, plugins, data).
import { Button, StatusPill, useStrings, type Tone } from '@kit';
import type { FindResult, FindSource, SourceStatus } from '../logic';
import strings from '../strings.en.json';
import s from './parts.module.css';
import { sourceWord } from './words';

const TONE: Record<SourceStatus['state'], Tone> = { searching: 'info', done: 'ok', failed: 'danger', warming: 'warn' };

export interface SourceStripProps {
  view: FindResult;
  showAll: boolean;
  onToggleAll: () => void;
  onRetry: (kinds: FindSource[]) => void;
}

export function SourceStrip({ view, showAll, onToggleAll, onRetry }: SourceStripProps) {
  const t = useStrings(strings);
  const failed = view.statuses.filter((x) => x.state === 'failed').map((x) => x.source);
  return (
    <div className={s.strip} role="group" aria-label={t('src.strip')}>
      {view.catalogue > 0 ? (
        <StatusPill tone="ok" dot>
          {t('src.count', { source: t('src.catalogue'), count: view.catalogue })}
        </StatusPill>
      ) : null}
      {view.statuses.map((x) => (
        <StatusPill key={x.source} tone={TONE[x.state]} dot>
          {x.state === 'done'
            ? t('src.count', { source: sourceWord(t, x.source), count: x.count })
            : x.count > 0
              // A source that failed (rows kept from before) or is still getting ready can list rows: its count shows
              // with its words, so the chips still add up to the total.
              ? t('src.countState', { source: sourceWord(t, x.source), count: x.count, state: t(`src.state.${x.state}` as 'src.state.failed') })
              : t('src.chip', { source: sourceWord(t, x.source), state: t(`src.state.${x.state}` as 'src.state.failed') })}
        </StatusPill>
      ))}
      {failed.length > 0 ? (
        <Button size="sm" variant="secondary" icon="reload" onPress={() => onRetry(failed)}>
          {t('src.retry')}
        </Button>
      ) : null}
      {view.hidden > 0 || showAll ? (
        <Button size="sm" variant="ghost" icon="eye" onPress={onToggleAll}>
          {showAll ? t('src.hidden.hide') : t('src.hidden.show', { count: view.hidden })}
        </Button>
      ) : null}
    </div>
  );
}
