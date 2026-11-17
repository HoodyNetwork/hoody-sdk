// UnreachableState: the one state for a computer that did not answer a read. A page shows it when core's
// reachOf(error) says 'unreachable'; any other failure keeps the page's ErrorState. It says what is known (the name,
// when the computer last answered, only when that is known) and offers Try again. It is never an empty state: a
// computer that did not answer has told us nothing about what it holds.
import type { ReactNode } from 'react';
import { Button, cx } from '../controls/Button';
import { TextButton } from '../controls/Link';
import { formatRelative } from '../format';
import { Icon } from '../icons';
import { useStrings } from '../strings';
import { ErrorDetails, useErrorInfo } from './ErrorDetails';
import { EmptyState } from './States';
import stateStrings from './strings.en.json';
import s from './States.module.css';

export interface UnreachableStateProps {
  /** The computer's shown name; without one the words say "This computer". */
  computer?: string;
  /** When this page last had an answer from the computer (ms since the epoch, e.g. a read's dataUpdatedAt). Shown
   *  only when it is a real past moment; otherwise nothing is said about it. */
  lastSeen?: number;
  /** Reads again (a kit Button: pointer, touch and keyboard). */
  onRetry: () => void;
  retrying?: boolean;
  /** One more way out the page knows ("Open Computers"), beside Try again. */
  secondary?: ReactNode;
  /** The rejection: its facts sit behind Details, for support. */
  error?: unknown;
  /** `compact`: one line plus Try again, for widgets and small regions. */
  size?: 'sm' | 'md' | 'compact';
  /** The clock "last answered" is measured against (tests); defaults to now. */
  now?: number;
  className?: string;
}

export function UnreachableState({ computer, lastSeen, onRetry, retrying, secondary, error, size = 'md', now, className }: UnreachableStateProps) {
  const t = useStrings(stateStrings);
  const info = useErrorInfo(error);
  const at = now ?? Date.now();
  const title = computer ? t('unreach.titleNamed', { computer }) : t('unreach.title');
  const seen = typeof lastSeen === 'number' && Number.isFinite(lastSeen) && lastSeen > 0 && lastSeen <= at;
  const body = seen ? `${t('unreach.lastSeen', { when: formatRelative(lastSeen, at) })} ${t('unreach.why')}` : t('unreach.why');
  if (size === 'compact') {
    return (
      <p className={cx(s.compact, className)} role="status" data-reach="unreachable">
        <Icon name="warn" size="sm" className={s.compactIcon} />
        <span className={s.compactText}>{title}</span>
        <span className={s.compactSep} aria-hidden="true">
          ·
        </span>
        <TextButton onPress={onRetry} isDisabled={retrying}>
          {t('state.retry')}
        </TextButton>
        {info && <ErrorDetails error={info} mode="button" />}
      </p>
    );
  }
  return (
    // The kit's EmptyState draws the frame (its heading included); this adds the status role and the Details fold.
    <div className={className} role="status" data-reach="unreachable">
      <EmptyState
        icon="warn"
        size={size}
        title={title}
        body={body}
        action={
          <Button icon="reload" onPress={onRetry} busy={retrying}>
            {t('state.retry')}
          </Button>
        }
        secondary={secondary}
      />
      {info && <ErrorDetails error={info} mode="button" className={s.errorDetails} />}
    </div>
  );
}
