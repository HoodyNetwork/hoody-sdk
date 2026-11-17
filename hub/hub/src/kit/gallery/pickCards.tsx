// The kit PickCard, CardGrid and Monogram's lg/xl sizes and tints in the gallery (/_kit?tab=pieces). kit3.tsx
// mounts it. The cards sit as the library shows them, outermost (the library is in a drawer, a new surface), so they
// draw the cut corner and the ring along it. A pick marks that card "you were here" (Gitea at first); the standalone
// card (a pasted repository) clears it.
import { useCallback, useMemo, useState } from 'react';
import { Monogram, StatusPill, type RealmColor } from '../data/Display';
import { CardScopeReset } from '../layouts/CardEdge';
import { AnatomySection } from '../layouts/anatomy/Section';
import { Row, Stack } from '../layouts/Stack';
import { CardGrid } from '../pickers/CardGrid';
import { PickCard } from '../pickers/PickCard';
import { useStrings } from '../strings';
import strings from './pickCards.strings.en.json';

type T = ReturnType<typeof useStrings<typeof strings>>;
type Kind = 'web' | 'api' | 'terminal';
interface Sample {
  id: string;
  name: string;
  tint: RealmColor;
  kind: Kind;
  line: string;
  why?: string;
  meta: string;
}

// Made-up sample entries (gallery only); repository, stack and licence as the library shows them.
const samplesOf = (t: T): Sample[] => [
  { id: 'kuma', name: 'Uptime Kuma', tint: 'red', kind: 'web', line: t('kuma.line'), why: t('kuma.why'), meta: 'louislam/uptime-kuma · Node · MIT' },
  { id: 'gitea', name: 'Gitea', tint: 'green', kind: 'web', line: t('gitea.line'), why: t('gitea.why'), meta: 'go-gitea/gitea · Go · MIT' },
  { id: 'ollama', name: 'Ollama', tint: 'purple', kind: 'api', line: t('ollama.line'), why: t('ollama.why'), meta: 'ollama/ollama · Go · MIT' },
  { id: 'lazygit', name: 'lazygit', tint: 'yellow', kind: 'terminal', line: t('lazygit.line'), meta: 'jesseduffield/lazygit · Go · MIT' },
  { id: 'memos', name: 'Memos', tint: 'orange', kind: 'web', line: t('memos.line'), why: t('memos.why'), meta: `usememos/memos · Go · ${t('own')}` },
];

const TINTS: RealmColor[] = ['red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink'];

export function PickCardPieces() {
  const t = useStrings(strings);
  const samples = useMemo(() => samplesOf(t), [t]);
  const [picked, setPicked] = useState<string | undefined>('gitea');
  const keyOf = useCallback((x: Sample) => x.id, []);
  const textOf = useCallback((x: Sample) => `${x.name}, ${t(x.kind)}, ${x.line}`, [t]);
  return (
    <AnatomySection id="pick-cards" title={t('title')} description={t('gridNote')} state={{ kind: 'ready' }}>
      <Row gap={3} wrap>
        <Monogram name="Uptime Kuma" size="lg" />
        <Monogram name="Uptime Kuma" size="xl" />
        {TINTS.map((c) => (
          <Monogram key={c} name={c} size="lg" tint={c} />
        ))}
        <Monogram name="?" size="xl" />
      </Row>
      <CardScopeReset>
        <Stack gap={4}>
          <CardGrid
            label={t('grid')}
            items={samples}
            keyOf={keyOf}
            textOf={textOf}
            renderCard={(x) => (
              <PickCard
                title={x.name}
                mark={<Monogram name={x.name} size="lg" tint={x.tint} />}
                end={<StatusPill>{t(x.kind)}</StatusPill>}
                line={x.line}
                note={x.why}
                meta={x.meta}
                here={x.id === picked ? t('here') : undefined}
              />
            )}
            onPick={setPicked}
          />
          <PickCard title={t('pasted')} mark={<Monogram name="?" size="lg" />} line={t('unknown')} meta={t('pastedMeta')} onPress={() => setPicked(undefined)} />
        </Stack>
      </CardScopeReset>
    </AnatomySection>
  );
}
