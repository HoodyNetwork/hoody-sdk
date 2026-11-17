// The kit ComputerPicker in the gallery (/_kit?tab=pieces): a picked computer, nothing picked yet, and a list still
// loading, side by side for shots. kit3.tsx mounts it.
import { useMemo, useState } from 'react';
import { Row } from '../layouts/Stack';
import { Panel } from '../layouts/Layouts';
import { ComputerPicker, type ComputerChoice } from '../pickers/ComputerPicker';
import { useStrings } from '../strings';
import strings from './computerPicker.strings.en.json';
import s from './computerPicker.module.css';

// Made-up sample computers (gallery only): names, realms, places, flags and colours are sample data; the state words
// and the reason a row is off come from the strings file. Colours as the API keeps them: blue, white (the mark's ring
// keeps it visible), amber; cedar has none (no mark).
// Sample computer colours are API data, not Hub colours (a recorded exception, exceptions.ts).
const COLOUR = { atlas: '#3B82F6', borealis: '#FFFFFF', long: '#F59E0B' } as const;
type T = ReturnType<typeof useStrings<typeof strings>>;
const sampleOf = (t: T): ComputerChoice[] => [
  { id: 'atlas', name: 'atlas', color: COLOUR.atlas, realm: { name: 'Personal', color: 'teal' }, running: true, state: t('running'), place: 'Singapore · sg-2', flag: '🇸🇬' },
  { id: 'borealis', name: 'borealis', color: COLOUR.borealis, realm: { name: 'Work', color: 'purple' }, running: false, state: t('stopped'), place: 'Frankfurt · de-1', flag: '🇩🇪' },
  { id: 'cedar', name: 'cedar', realm: { name: 'Work', color: 'purple' }, state: t('paused'), place: 'Helsinki · fi-1', flag: '🇫🇮', disabledReason: t('startFirst') },
];

// A long realm name in a narrow place: the name gives way down to a few characters, then the realm is cut; nothing leaves the field.
const longOf = (t: T): ComputerChoice[] => [
  { id: 'long', name: 'build-runner-eu-west-nightly', color: COLOUR.long, realm: { name: 'Research and development, Frankfurt office', color: 'orange' }, running: true, state: t('running'), place: 'Frankfurt · de-1', flag: '🇩🇪' },
];

export function ComputerPickerPieces() {
  const t = useStrings(strings);
  const SAMPLE = useMemo(() => sampleOf(t), [t]);
  const LONG = useMemo(() => longOf(t), [t]);
  const [picked, setPicked] = useState<string | undefined>('atlas');
  const [none, setNone] = useState<string | undefined>(undefined);
  return (
    <Panel title={t('title')}>
      <Row gap={4} wrap align="start">
        <ComputerPicker label={t('picked')} computers={SAMPLE} value={picked} onChange={setPicked} />
        <ComputerPicker label={t('none')} computers={SAMPLE} value={none} onChange={setNone} />
        <ComputerPicker label={t('loading')} computers={undefined} value={undefined} onChange={() => undefined} />
        <div className={s.narrow}>
          <ComputerPicker label={t('long')} computers={LONG} value="long" onChange={() => undefined} />
        </div>
      </Row>
    </Panel>
  );
}
