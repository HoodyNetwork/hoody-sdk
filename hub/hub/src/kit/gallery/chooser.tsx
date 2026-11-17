// The composed model chooser in the gallery (/_kit?tab=chooser&ch=<state>): one state per page, so hub:shots --kit
// frames each one (the setup step for an API key, ChatGPT sign-in, OpenRouter sign-in and an endpoint key,
// then the attempt confirming, couldn't confirm, and still needs setup). The computer is a sample: its reads and its
// provider calls are local fakes that answer from this file, so nothing is sent and every key typed here is dropped.
import { providers, type ComputerRow, type Target } from '@core';
import { useMemo, useState } from 'react';
import { Button } from '../controls/Button';
import { Panel } from '../layouts/Layouts';
import { Row, Stack } from '../layouts/Stack';
import { useSearchParam } from '../nav';
import { ModelChooser } from '../pickers/ModelChooser';
import { useModelCatalogue, type CatalogueReads } from '../pickers/useModelCatalogue';
import { useStrings } from '../strings';
import strings from './chooser.strings.en.json';
import s from './models.module.css';

const STATES = ['key', 'chatgpt', 'openrouter', 'endpoint', 'confirming', 'unconfirmed', 'still'] as const;
type State = (typeof STATES)[number];
const isState = (v: unknown): v is State => typeof v === 'string' && (STATES as readonly string[]).includes(v);

const TARGET: Target = { project: { id: 'gallery' }, container: { id: 'gallery-atlas' } };
const ROW: ComputerRow = { id: 'gallery-atlas', project_id: 'gallery' };
const FREE = providers.FREE;
// Sample sign-in links (the providers' public pages); the gallery never opens them.
const SIGNIN_GPT = 'https://auth.openai.com/codex/device';
const SIGNIN_OR = 'https://openrouter.ai/auth';

type Settled = providers.Settled<unknown>;
const ok = (body: unknown): Settled => ({ ok: true, body });
const failed: Settled = { ok: false, err: { kind: 'failed', code: 'unavailable', status: 503, retryAfter: null, details: {} } };
const status = (state: string, methods: string[]) => ({ state, via: state === 'ready' ? 'included' : 'stored_key', methods, alternatives: {}, output_cap: true, shares_with: [] });

/** What the sample computer answers after a key is saved, per state. */
type After = 'ready' | 'hold' | 'readyFailed' | 'still';
const AFTER: Record<State, After> = { key: 'ready', chatgpt: 'ready', openrouter: 'ready', endpoint: 'ready', confirming: 'hold', unconfirmed: 'readyFailed', still: 'still' };
// The model each state's In use card holds, so the shots open its setup step with one press.
const VALUE: Record<State, string> = {
  key: 'anthropic/claude-sonnet-5',
  chatgpt: 'openai/gpt-5',
  openrouter: 'openrouter/auto',
  endpoint: 'my-endpoint/large',
  confirming: 'anthropic/claude-sonnet-5',
  unconfirmed: 'anthropic/claude-sonnet-5',
  still: 'anthropic/claude-sonnet-5',
};

function bodies(set: boolean, after: After) {
  const anthropic = set && after !== 'still' ? 'ready' : 'needs_key';
  return {
    providers: {
      providers: [
        { id: 'hoody-ai', prefix: 'hoody-ai/', display_name: 'Hoody AI', status: status('ready', []) },
        { id: 'anthropic', prefix: 'anthropic/', display_name: 'Anthropic', status: status(anthropic, ['api_key']) },
        { id: 'openai', prefix: 'openai/', display_name: 'OpenAI', status: status('needs_key', ['api_key', 'signin']) },
        { id: 'openrouter', prefix: 'openrouter/', display_name: 'OpenRouter', status: status('needs_key', ['api_key', 'signin']) },
        { id: 'my-endpoint', prefix: 'my-endpoint/', display_name: 'My endpoint', custom: true, status: status('needs_key', ['api_key']) },
      ],
    },
    models: {
      models: [
        { spec: FREE, display_name: 'Hoody Free' },
        { spec: 'anthropic/claude-sonnet-5', display_name: 'Claude Sonnet 5' },
        { spec: 'anthropic/claude-haiku-5', display_name: 'Claude Haiku 5' },
        { spec: 'openai/gpt-5', display_name: 'GPT-5' },
        { spec: 'openrouter/auto', display_name: 'Auto router' },
        { spec: 'my-endpoint/large', display_name: 'Large' },
      ],
    },
    ready: { models: [FREE, ...(anthropic === 'ready' ? ['anthropic/claude-sonnet-5'] : [])].map((spec) => ({ spec })) },
  };
}

export default function ChooserTab() {
  const t = useStrings(strings);
  const [param, setParam] = useSearchParam('ch');
  const state: State = isState(param) ? param : 'key';
  return (
    <Stack gap={5}>
      <Panel title={t('states')} description={t('desc')}>
        <Row gap={2} wrap>
          {STATES.map((st) => (
            <Button key={st} variant={st === state ? 'secondary' : 'ghost'} size="sm" aria-pressed={st === state} onPress={() => setParam(st)}>
              {t(`ch.${st}`)}
            </Button>
          ))}
        </Row>
      </Panel>
      {/* A new key per state: each state starts from a computer nothing was saved on. */}
      <Sample key={state} state={state} />
    </Stack>
  );
}

function Sample({ state }: { state: State }) {
  const t = useStrings(strings);
  const after = AFTER[state];
  // The sample computer: the first read finds nothing set up; once a key is saved, reads answer per state.
  const world = useMemo(() => {
    let saved = false;
    const reads = (): CatalogueReads => {
      const set = saved;
      const wait = set && after === 'hold' ? new Promise<never>(() => undefined) : Promise.resolve();
      const b = bodies(set, after);
      const catalogue = {
        providers: () => wait.then(() => ok(b.providers)),
        models: (q: { ready?: boolean } = {}) => wait.then(() => (q.ready ? (set && after === 'readyFailed' ? failed : ok(b.ready)) : ok(b.models))),
        auth: () => Promise.resolve(ok({ auth: { ready: false } })),
      } as unknown as providers.CatalogueReader;
      return { catalogue };
    };
    const none = () => Promise.resolve(failed);
    const api: providers.ProvidersApi = {
      version: () => Promise.resolve(ok({ capabilities: [{ name: providers.CAPS.device, supported: true, available: true }] })),
      providers: none,
      provider: (pid) => Promise.resolve(pid === 'my-endpoint' ? ok({ provider: { id: pid, display_name: 'My endpoint', definition_rev: 'rev-1' } }) : failed),
      auth: () => Promise.resolve(ok({ auth: { ready: false } })),
      catalogue: none as never,
      // The sign-ins wait for the person: a sample code and link, and a job that never finishes.
      oauthPoll: () => Promise.resolve(ok({ state: 'pending' })),
      pkcePoll: () => Promise.resolve(ok({ state: 'pending', needs_code: true, verification_uri: SIGNIN_OR })),
      pkceStart: () => Promise.resolve(ok({ job_id: 'gallery-or', verification_uri: SIGNIN_OR })),
      pkceCode: none,
      pkceCancel: none,
      keyPut: (_pid, body) => {
        body.api_key = '';
        saved = true;
        return Promise.resolve(ok({ check: 'valid' }));
      },
      keyDelete: none,
      authTest: none,
      authDefault: none,
      oauthStart: () => Promise.resolve(ok({ job_id: 'gallery-gpt', user_code: 'ABCD-1234', verification_uri: SIGNIN_GPT })),
      oauthCancel: none,
      signOut: none,
    };
    return { reads, api };
  }, [after]);
  const cat = useModelCatalogue(TARGET, { reads: world.reads });
  const rules = useMemo(() => providers.rulesFor('bot'), []);
  const [value, setValue] = useState(VALUE[state]);
  const [chosen, setChosen] = useState(t('chosen.none'));
  return (
    <Panel title={t('title')}>
      <Stack gap={3}>
        <div className={s.frame} role="region" aria-label={t('frame')} data-gallery="model-chooser">
          <ModelChooser
            id="gal-ch"
            label={t('title')}
            catalogue={cat}
            computer={{ id: ROW.id, name: t('computer'), row: ROW }}
            value={value}
            rules={rules}
            purpose="bot"
            onChoose={(c) => {
              if (c.kind === 'model') setValue(c.spec);
              setChosen(c.kind === 'model' ? c.spec : t('chosen.inherit'));
            }}
            api={() => world.api}
            go={() => undefined}
          />
        </div>
        <p className={s.asked}>{t('chosen', { what: chosen })}</p>
      </Stack>
    </Panel>
  );
}
