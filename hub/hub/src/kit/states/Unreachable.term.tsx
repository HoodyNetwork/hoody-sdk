// UnreachableState in the terminal. `compact` is one line that WRAPS: the mark and the title, then Try again and
// Details as a group that moves to the next row whole when the row is short, so no separator dot is drawn. `sm` and `md`
// are the kit EmptyState with Try again, the page's other way out and Details in its one action row, so Details sits
// in the card. The words and the "last answered" rule are the web's.
import type * as Web from './Unreachable';
import { Box, Text } from '@term/prim';
import { Button } from '../controls/Button';
import { TextButton } from '../controls/Link';
import { formatRelative } from '../format';
import { Icon } from '../icons';
import { useStrings } from '../strings';
import { ErrorDetails } from './ErrorDetails';
import { useErrorInfo } from './errorDetails.pure';
import { EmptyState } from './States';
import stateStrings from './strings.en.json';

export type { UnreachableStateProps } from './Unreachable';

export const UnreachableState: typeof Web.UnreachableState = ({ computer, lastSeen, onRetry, retrying, secondary, error, size = 'md', now }) => {
  const t = useStrings(stateStrings);
  const info = useErrorInfo(error);
  const at = now ?? Date.now();
  const title = computer ? t('unreach.titleNamed', { computer }) : t('unreach.title');
  const seen = typeof lastSeen === 'number' && Number.isFinite(lastSeen) && lastSeen > 0 && lastSeen <= at;
  const body = seen ? `${t('unreach.lastSeen', { when: formatRelative(lastSeen, at) })} ${t('unreach.why')}` : t('unreach.why');
  const details = info ? <ErrorDetails error={info} mode="button" /> : null;
  if (size === 'compact') {
    return (
      <Box dir="row" wrap gapX={2} shrink={0} sem={{ role: 'status' }}>
        <Box dir="row" gap={1} shrink={1}>
          <Icon name="warn" tone="faint" />
          <Text colour="muted" shrink={1}>{title}</Text>
        </Box>
        <Box dir="row" gap={2} shrink={0}>
          <TextButton onPress={onRetry} isDisabled={retrying}>{t('state.retry')}</TextButton>
          {details}
        </Box>
      </Box>
    );
  }
  return (
    <Box dir="column" shrink={0} sem={{ role: 'status' }}>
      <EmptyState
        icon="warn"
        size={size}
        title={title}
        body={body}
        action={<Button icon="reload" onPress={onRetry} busy={retrying}>{t('state.retry')}</Button>}
        secondary={<>{secondary}{details}</>}
      />
    </Box>
  );
};
