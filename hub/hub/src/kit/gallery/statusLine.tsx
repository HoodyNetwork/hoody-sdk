// The kit StatusLine (kit/states/StatusLine) in the gallery (/_kit?tab=overlays #status-line): one
// line that stays mounted while Next step walks it from empty through three words and back to empty, so a screen
// reader hears each change; Start over sits after it, so the spec can see that the empty line leaves no gap. overlays.tsx mounts it; kit/states/statusline.spec.ts reads it.
import { useState } from 'react';
import { Button } from '../controls/Button';
import { AnatomySection } from '../layouts/anatomy/Section';
import { Stack } from '../layouts/Stack';
import { StatusLine } from '../states/StatusLine';
import { useStrings } from '../strings';
import strings from './statusLine.strings.en.json';

const STEPS = [null, 's.starting', 's.reading', 's.done'] as const;

export function StatusLinePieces() {
  const t = useStrings(strings);
  const [i, setI] = useState(0);
  const step = STEPS[i % STEPS.length];
  return (
    <AnatomySection id="status-line" title={t('title')} state={{ kind: 'ready' }}>
      <Stack gap={2}>
        <Button variant="secondary" onPress={() => setI((n) => n + 1)}>
          {t('next')}
        </Button>
        <StatusLine>{step ? t(step) : null}</StatusLine>
        <Button variant="secondary" onPress={() => setI(0)}>
          {t('again')}
        </Button>
      </Stack>
    </AnatomySection>
  );
}
