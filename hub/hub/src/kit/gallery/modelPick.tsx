// The one model picker in the gallery (/_kit?tab=modelpick&mp=<state>), one state per page so hub:shots frames each:
// the panel in saved mode with its thinking step, the field (named, inherit, needs a
// computer, disabled with its reason, with an error) and the chip whose panel commits each pick. The evidence is the
// real chat catalogue (catalogue7k, 'threeReady'); every commit answers locally, so nothing is sent anywhere.
// The flat ModelPicker (a chat's Session tab) has two states: `flat` is the catalogue where only Hoody Free is ready
// (7,077 models need setup: none is a row, one line leads to setup, a search finds them), `flatmany` has forty ready
// models (the list scrolls inside itself; the line and what follows stay in reach).
import { agent, providers, type ComputerRow } from '@core';
import { useMemo, useState } from 'react';
import { Button } from '../controls/Button';
import { AnatomySection } from '../layouts/anatomy/Section';
import { Row, Stack } from '../layouts/Stack';
import { useSearchParam } from '../nav';
import { evidence7k, FIXTURE_SCOPE } from '../pickers/fixtures/evidence7k';
import { ModelPicker, type ModelChoice } from '../pickers/ModelPicker';
import { ModelPickChip, ModelPickField, ModelPickPanel, type PickDraft, type PickOutcome } from '../pickers/ModelPick';
import type { ThinkingLevel } from '../pickers/modelPickLogic';
import type { ModelCatalogue } from '../pickers/useModelCatalogue';
import { useStrings } from '../strings';
import strings from './modelPick.strings.en.json';
import s from './models.module.css';

const STATES = ['panel', 'fields', 'chip', 'flat', 'flatmany'] as const;
type State = (typeof STATES)[number];
const isState = (v: unknown): v is State => typeof v === 'string' && (STATES as readonly string[]).includes(v);

const ROW: ComputerRow = { id: 'gallery-atlas', project_id: 'gallery' };
const LEVELS: ThinkingLevel[] = ['', 'off', 'on', 'low', 'medium', 'high', 'xhigh', 'max'];
// The Bot takes thinking off and on as switches (the caller says so; the picker offers none it is not told of).
const SWITCHES = ['off', 'on'] as const;
const FREE = providers.FREE;

// The evidence is built once per page load, as a page hands over evidence already read.
let built: providers.Evidence | null = null;
const catalogue = (): ModelCatalogue => {
  built ??= evidence7k('threeReady', { at: Date.now() });
  return { evidence: built, scope: FIXTURE_SCOPE, reading: false, failedAt: null, retry: () => undefined, pressRetry: () => undefined, retrying: false, attempt: () => ({ id: 0, minSeq: 0, alive: () => false, end: () => undefined }), setup: null };
};

// The flat picker's rows, as a chat's Session tab builds them (core agentChoices over the catalogue).
const MANY = 40;
let flatRows: Record<'flat' | 'flatmany', ModelChoice[]> | null = null;
function flat(state: 'flat' | 'flatmany', names: agent.AgentNames): ModelChoice[] {
  if (!flatRows) {
    const ev = evidence7k('freeOnly', { at: 0 });
    // Hoody Free under its public name (the sample catalogue's own label says more).
    const rows = agent.agentChoices({ cat: ev.catalogue.state === 'ok' ? ev.catalogue.value.cat : null, claude: null, names }).map((r) => (r.spec === FREE ? { ...r, label: providers.FREE_NAME } : r));
    let n = 0;
    // Made-up readiness for the long case: the first forty models that need setup count as ready.
    flatRows = { flat: rows, flatmany: rows.map((r) => (r.ready === 'needs_key' && n++ < MANY ? { ...r, ready: 'ready' as const } : r)) };
  }
  return flatRows[state];
}

function FlatSample({ state }: { state: 'flat' | 'flatmany' }) {
  const t = useStrings(strings);
  const names = useMemo<agent.AgentNames>(() => ({ model: t('flat.model'), provider: t('flat.provider'), claude: t('flat.claude'), claudeDefault: t('flat.claudeDefault') }), [t]);
  const [value, setValue] = useState<string>(FREE);
  const [said, setSaid] = useState(t('said.none'));
  return (
    <AnatomySection id="mp-sample" title={t(`st.${state}`)} note={t('said', { what: said })} state={{ kind: 'ready' }}>
      <div className={s.frame} role="region" aria-label={t('frame')} data-gallery="model-pick">
        <Stack gap={3}>
          <ModelPicker
            label={t('label.chip')}
            showLabel
            models={flat(state, names)}
            value={value}
            current={FREE}
            onChange={setValue}
            onSetup={(m) => setSaid(t('flat.setup', { provider: m.providerLabel }))}
            onProviders={() => setSaid(t('flat.providers'))}
          />
          <Button variant="secondary" size="sm" onPress={() => setSaid(value)}>
            {t('flat.below')}
          </Button>
        </Stack>
      </div>
    </AnatomySection>
  );
}

export default function ModelPickTab() {
  const t = useStrings(strings);
  const [param, setParam] = useSearchParam('mp');
  const state: State = isState(param) ? param : 'panel';
  return (
    <Stack gap={5}>
      <AnatomySection id="mp-states" title={t('states')} description={t('desc')} state={{ kind: 'ready' }}>
        <Row gap={2} wrap>
          {STATES.map((st) => (
            <Button key={st} variant={st === state ? 'secondary' : 'ghost'} size="sm" aria-pressed={st === state} onPress={() => setParam(st)}>
              {t(`st.${st}`)}
            </Button>
          ))}
        </Row>
      </AnatomySection>
      {state === 'flat' || state === 'flatmany' ? <FlatSample key={state} state={state} /> : <Sample key={state} state={state} />}
    </Stack>
  );
}

function Sample({ state }: { state: Exclude<State, 'flat' | 'flatmany'> }) {
  const t = useStrings(strings);
  const cat = useMemo(catalogue, []);
  const computer = useMemo(() => ({ id: ROW.id, name: t('computer'), row: ROW }), [t]);
  const rules = useMemo(() => providers.rulesFor('bot'), []);
  const inheritRules = useMemo(() => providers.rulesFor('bot', { inherit: true }), []);
  const [value, setValue] = useState<PickDraft>({ spec: FREE, thinking: '' });
  const [draft, setDraft] = useState<PickDraft>(value);
  const [said, setSaid] = useState(t('said.none'));
  const commit = (d: PickDraft): PickOutcome => {
    setValue(d);
    setSaid(t('said.saved', { spec: d.spec || t('said.inherit'), level: d.thinking || t('said.default') }));
    return { kind: 'done' };
  };
  const common = { catalogue: cat, computer, rules, purpose: 'bot' as const, onCommit: commit };
  return (
    <AnatomySection id="mp-sample" title={t(`st.${state}`)} note={t('said', { what: said })} state={{ kind: 'ready' }}>
      <div className={s.frame} role="region" aria-label={t('frame')} data-gallery="model-pick">
        {state === 'panel' && (
          <ModelPickPanel
            {...common}
            id="gal-mp"
            label={t('label.bot')}
            value={value}
            draft={draft}
            onDraft={(d) => setDraft(d)}
            mode="saved"
            thinking={{ levels: LEVELS, inheritLabel: t('th.default'), switches: SWITCHES }}
            onCancel={() => setDraft(value)}
          />
        )}
        {state === 'fields' && (
          <Stack gap={4}>
            <ModelPickField {...common} label={t('label.bot')} value={value} resizeKey="gal-mp-bot" thinking={{ levels: LEVELS, inheritLabel: t('th.default'), switches: SWITCHES }} />
            <ModelPickField {...common} rules={inheritRules} label={t('label.delegate')} value={{ spec: '', thinking: '' }} inherit={{ label: t('inherit'), resolved: t('inherit.now') }} resizeKey="gal-mp-inherit" />
            <ModelPickField {...common} label={t('label.noComputer')} catalogue={null} computer={null} value={value} resizeKey="gal-mp-none" />
            <ModelPickField {...common} label={t('label.light')} value={value} resizeKey="gal-mp-off" disabledReason={t('why.off')} />
            <ModelPickField {...common} label={t('label.heavy')} value={value} resizeKey="gal-mp-err" error={t('why.error')} />
          </Stack>
        )}
        {state === 'chip' && (
          <Row gap={2} wrap>
            <ModelPickChip {...common} label={t('label.chip')} value={value} thinking={{ levels: LEVELS, inheritLabel: t('th.default'), switches: SWITCHES }} />
          </Row>
        )}
      </div>
    </AnatomySection>
  );
}
