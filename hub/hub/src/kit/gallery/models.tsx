// The model chooser in the gallery (/_kit?tab=models&mc=<state>): one state per page, so hub:shots --kit frames each
// one (ready free only / three / ready-read failed / catalogue failed, the Directory, the connect verb, a
// 598-model drill-in, search, consent, the Agent's default, loading, an older agent). The evidence is the real chat
// catalogue (catalogue7k); view.tsx loads this file lazily so the gallery's own chunk stays small.
import { providers } from '@core';
import { useMemo, useState } from 'react';
import { Button } from '../controls/Button';
import { Panel } from '../layouts/Layouts';
import { Row, Stack } from '../layouts/Stack';
import { useSearchParam } from '../nav';
import { evidence7k } from '../pickers/fixtures/evidence7k';
import { ModelBrowser, type OtherWayOrAi, type SetupRequest } from '../pickers/ModelBrowser';
import { ProviderDirectory } from '../pickers/ProviderDirectory';
import { useStrings } from '../strings';
import strings from './models.strings.en.json';
import s from './models.module.css';

const STATES = ['free', 'three', 'readyFailed', 'catFailed', 'dir', 'connect', 'drill', 'search', 'consent', 'agent', 'loading', 'legacy'] as const;
type State = (typeof STATES)[number];

interface Setup {
  scenario: Parameters<typeof evidence7k>[0];
  purpose: providers.Purpose;
  value: string;
  inherit?: boolean;
  claude?: boolean;
}

// Each state's sample: the scenario it reads and the caller it stands for. The views the shots open by acting
// (Directory, drill-in, search, consent) start from the Ready view of their scenario.
const SETUPS: Record<State, Setup> = {
  free: { scenario: 'freeOnly', purpose: 'bot', value: providers.FREE },
  three: { scenario: 'threeReady', purpose: 'bot', value: 'openai/chat-latest' },
  readyFailed: { scenario: 'readyReadFailed', purpose: 'bot', value: providers.FREE },
  catFailed: { scenario: 'catalogueFailed', purpose: 'bot', value: providers.FREE },
  dir: { scenario: 'threeReady', purpose: 'bot', value: providers.FREE },
  connect: { scenario: 'threeReady', purpose: 'bot', value: '' },
  drill: { scenario: 'freeOnly', purpose: 'bot', value: providers.FREE },
  search: { scenario: 'threeReady', purpose: 'bot', value: providers.FREE },
  consent: { scenario: 'threeReady', purpose: 'bot', value: providers.FREE },
  agent: { scenario: 'claudeRows', purpose: 'agent', value: '', inherit: true, claude: true },
  loading: { scenario: 'loading', purpose: 'bot', value: providers.FREE },
  legacy: { scenario: 'olderAgent', purpose: 'bot', value: providers.FREE },
};

const isState = (v: unknown): v is State => typeof v === 'string' && (STATES as readonly string[]).includes(v);

// Each state's evidence is built once per page load: switching back to a state measures the chooser opening on
// evidence already read (as a page hands it over), not the fixture's own parse.
const built = new Map<State, providers.Evidence>();
const evidenceOf = (state: State): providers.Evidence => {
  let ev = built.get(state);
  if (!ev) {
    const setup = SETUPS[state];
    ev = evidence7k(setup.scenario, { claude: setup.claude, at: Date.now() });
    built.set(state, ev);
  }
  return ev;
};

export default function ModelsTab() {
  const t = useStrings(strings);
  const [param, setParam] = useSearchParam('mc');
  const state: State = isState(param) ? param : 'free';
  return (
    <Stack gap={5}>
      <Panel title={t('states')} description={t('desc')}>
        <Row gap={2} wrap>
          {STATES.map((st) => (
            <Button key={st} variant={st === state ? 'secondary' : 'ghost'} size="sm" aria-pressed={st === state} onPress={() => setParam(st)}>
              {t(`mc.${st}`)}
            </Button>
          ))}
        </Row>
      </Panel>
      {/* A new key per state: each state starts from its own Ready view. */}
      <Sample key={state} state={state} />
    </Stack>
  );
}

function Sample({ state }: { state: State }) {
  const t = useStrings(strings);
  const setup = SETUPS[state];
  const ev = useMemo(() => evidenceOf(state), [state]);
  const rules = useMemo(() => providers.rulesFor(setup.purpose, { inherit: setup.inherit }), [setup]);
  const offer = useMemo(() => ({ claude: setup.claude }), [setup]);
  const [asked, setAsked] = useState<string>(t('asked.none'));
  const onSetup = (r: SetupRequest | string) => setAsked(t('asked.setup', { provider: typeof r === 'string' ? r : r.provider }));
  const onOtherWay = (way: OtherWayOrAi) => setAsked(t('asked.other', { way }));
  return (
    <Panel title={state === 'connect' ? t('connect') : t('title')}>
      <Stack gap={3}>
        <div className={s.frame} role="region" aria-label={t('frame')} data-gallery="model-chooser">
          {state === 'connect' ? (
            <ProviderDirectory evidence={ev} purpose={setup.purpose} verb="connect" onSetup={onSetup} onOtherWay={onOtherWay} idBase="gal-connect" />
          ) : (
            <ModelBrowser
              id="gal-mc"
              evidence={ev}
              computerName={t('computer')}
              value={setup.value}
              rules={rules}
              purpose={setup.purpose}
              offer={offer}
              onChoose={(c) => setAsked(c.kind === 'inherit' ? t('asked.inherit') : t('asked.choose', { spec: c.spec }))}
              onSetup={onSetup}
              onOtherWay={onOtherWay}
              onRetry={() => setAsked(t('asked.retry'))}
            />
          )}
        </div>
        <p className={s.asked}>{t('asked', { what: asked })}</p>
      </Stack>
    </Panel>
  );
}
