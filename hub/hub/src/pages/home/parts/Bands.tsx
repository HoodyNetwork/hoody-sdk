// Offline, stale and partial cues above the dashboard. Offline wins over stale; partial is a quiet line.
import { Band, TextButton, formatDateTime, useStrings } from '@kit';
import strings from '../strings.en.json';
import type { Overview } from '../data';

export function Bands({ bands, onRetry }: { bands: Overview['bands']; onRetry: () => void }) {
  const t = useStrings(strings);
  if (bands.offline) {
    return (
      <Band tone="warn" actions={<TextButton onPress={onRetry}>{t('action.tryAgain')}</TextButton>}>
        {t('band.offline', { time: bands.lastDataAt ? formatDateTime(bands.lastDataAt) : '' })}
      </Band>
    );
  }
  if (bands.stale) {
    return (
      <Band tone="warn" actions={<TextButton onPress={onRetry}>{t('action.tryAgain')}</TextButton>}>
        {t('band.stale')}
      </Band>
    );
  }
  if (bands.partial !== undefined) {
    return (
      <Band tone="neutral" actions={<TextButton onPress={onRetry}>{t('action.tryAgain')}</TextButton>}>
        {t('band.partial', { count: bands.partial })}
      </Band>
    );
  }
  return null;
}
