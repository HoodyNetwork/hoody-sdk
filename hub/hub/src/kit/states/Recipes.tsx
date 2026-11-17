// Empty-state recipes: the four empties every page meets, with the words and actions fixed so
// pages stop inventing their own. Each is an EmptyState (or its compact line) underneath.
import { useEffect, type ReactNode } from 'react';
import { Button } from '../controls/Button';
import { TextButton } from '../controls/Link';
import type { IconName } from '../icons';
import { useStrings } from '../strings';
import { EmptyState } from './States';
import stateStrings from './strings.en.json';

type Size = 'sm' | 'md' | 'compact';

export interface FirstUseStateProps {
  icon?: IconName;
  /** What the place is for ("Your computers live here"). */
  title: string;
  /** What you get, in one sentence: this is the only teaching the person sees. */
  body: ReactNode;
  /** The one primary action (an accent Button: "New computer"). Required: a first use always leads somewhere. */
  action: ReactNode;
  /** The Guide topic ("How computers work"), as a kit Link. */
  learn?: ReactNode;
  /** A keyboard hint (<Shortcut keys="n" /> plus words). */
  hint?: ReactNode;
  size?: Size;
  className?: string;
}

/** Nothing here yet, and the person has never made one: teach in a sentence, offer the first step. */
export function FirstUseState({ icon, title, body, action, learn, hint, size = 'md', className }: FirstUseStateProps) {
  return <EmptyState icon={icon} title={title} body={body} action={action} secondary={learn} hint={hint} size={size} className={className} />;
}

export interface NoMatchStateProps {
  /** Clears search and filters. The only action: nothing is wrong, the filters are too narrow. */
  onClear: () => void;
  /** Override the title ("No bots match "atlas""). */
  title?: string;
  size?: Size;
  className?: string;
}

/** Data exists but the search or filters hide all of it. Shown in place of the table body. */
export function NoMatchState({ onClear, title, size = 'sm', className }: NoMatchStateProps) {
  const t = useStrings(stateStrings);
  const action =
    size === 'compact' ? (
      <TextButton onPress={onClear}>{t('recipe.noMatch.clear')}</TextButton>
    ) : (
      <Button icon="x" onPress={onClear}>
        {t('recipe.noMatch.clear')}
      </Button>
    );
  return <EmptyState icon="filter" title={title ?? t('recipe.noMatch.title')} body={t('recipe.noMatch.body')} action={action} size={size} className={className} />;
}

export interface NoAccessStateProps {
  /** What to do instead, when the page knows (a link to switch realm, or who owns it). */
  body?: ReactNode;
  /** One way out (a kit Link back to the list, or "Switch realm"). */
  action?: ReactNode;
  title?: string;
  size?: Size;
  className?: string;
}

/** The thing exists but this login can't see it. Never says whether it exists when that would leak. */
export function NoAccessState({ body, action, title, size = 'md', className }: NoAccessStateProps) {
  const t = useStrings(stateStrings);
  return <EmptyState icon="lock" title={title ?? t('recipe.noAccess.title')} body={body ?? t('recipe.noAccess.body')} action={action} size={size} className={className} />;
}

export interface OfflineStateProps {
  /** Read again. Also runs on its own when the browser says the connection is back. */
  onRetry?: () => void;
  retrying?: boolean;
  size?: Size;
  className?: string;
}

/** No connection and nothing read yet. With older data on screen, use a warning Band instead. */
export function OfflineState({ onRetry, retrying, size = 'md', className }: OfflineStateProps) {
  const t = useStrings(stateStrings);
  useEffect(() => {
    if (!onRetry) return;
    const back = () => onRetry();
    window.addEventListener('online', back);
    return () => window.removeEventListener('online', back);
  }, [onRetry]);
  const action = !onRetry ? undefined : size === 'compact' ? (
    <TextButton onPress={onRetry} isDisabled={retrying}>
      {t('state.retry')}
    </TextButton>
  ) : (
    <Button icon="reload" onPress={onRetry} busy={retrying}>
      {t('state.retry')}
    </Button>
  );
  return <EmptyState icon="globe" title={t('recipe.offline.title')} body={t('recipe.offline.body')} action={action} size={size} className={className} />;
}
