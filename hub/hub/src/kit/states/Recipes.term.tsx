// The empty-state recipes in the terminal: the web's four, each the kit EmptyState underneath with the same words and
// actions. The only difference is OfflineState's "connection is back" signal: the web file listens on `window`, which
// the terminal refuses (TERM_GLOBAL: an OfflineState with onRetry stopped the page), so here it comes from the host
// (hostEnv().onLifecycle('online')), the one owner of that event on every platform.
import { useEffect } from 'react';
import type * as Web from './Recipes';
import { hostEnv } from '../../core/host-env';
import { Button } from '../controls/Button';
import { TextButton } from '../controls/Link';
import { useStrings } from '../strings';
import { EmptyState } from './States';
import stateStrings from './strings.en.json';

export type { FirstUseStateProps, NoMatchStateProps, NoAccessStateProps, OfflineStateProps } from './Recipes';

export const FirstUseState: typeof Web.FirstUseState = ({ icon, title, body, action, learn, hint, size = 'md' }) => (
  <EmptyState icon={icon} title={title} body={body} action={action} secondary={learn} hint={hint} size={size} />
);

export const NoMatchState: typeof Web.NoMatchState = ({ onClear, title, size = 'sm' }) => {
  const t = useStrings(stateStrings);
  const action = size === 'compact'
    ? <TextButton onPress={onClear}>{t('recipe.noMatch.clear')}</TextButton>
    : <Button icon="x" onPress={onClear}>{t('recipe.noMatch.clear')}</Button>;
  return <EmptyState icon="filter" title={title ?? t('recipe.noMatch.title')} body={t('recipe.noMatch.body')} action={action} size={size} />;
};

export const NoAccessState: typeof Web.NoAccessState = ({ body, action, title, size = 'md' }) => {
  const t = useStrings(stateStrings);
  return <EmptyState icon="lock" title={title ?? t('recipe.noAccess.title')} body={body ?? t('recipe.noAccess.body')} action={action} size={size} />;
};

export const OfflineState: typeof Web.OfflineState = ({ onRetry, retrying, size = 'md' }) => {
  const t = useStrings(stateStrings);
  useEffect(() => {
    if (!onRetry) return;
    return hostEnv().onLifecycle('online', () => onRetry());
  }, [onRetry]);
  const action = !onRetry ? undefined : size === 'compact'
    ? <TextButton onPress={onRetry} isDisabled={retrying}>{t('state.retry')}</TextButton>
    : <Button icon="reload" onPress={onRetry} busy={retrying}>{t('state.retry')}</Button>;
  return <EmptyState icon="globe" title={t('recipe.offline.title')} body={t('recipe.offline.body')} action={action} size={size} />;
};
