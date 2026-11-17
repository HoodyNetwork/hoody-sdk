// What ChatGptSetup hands outside the Hub (web and terminal): "Open the sign-in page" opens the device sign-in address the
// agent's job gave, whole, and only one on OpenAI's own hosts that does not carry the code itself (providers.linkFor: the
// code is shown and typed, never sent in an address): any other gets no button and opens nothing. The flow itself
// (code once, lost answers, cancel, a stored login proving nothing) is pinned in ProviderSetup*.test.tsx.
import type { providers } from '@core';
import { scenarios } from '../scenario-types';
import { ChatGptSetup } from './ProviderSetup';

const DEVICE = 'https://auth.openai.com/codex/device';
const CODE = 'ABCD-1234';

/** An agent whose device sign-in job is pending with `uri`; the poll's wait never ends (the case reads the waiting step). */
function agent(uri: string): { api: providers.ProvidersApi; env: providers.Env } {
  const ok = (body: unknown) => Promise.resolve({ ok: true as const, body });
  const api = {
    auth: () => ok({ auth: { oauth_stored: false } }),
    oauthStart: () => ok({ job_id: 'j1', user_code: CODE, verification_uri: uri }),
    oauthPoll: () => ok({ state: 'pending', user_code: CODE, verification_uri: uri }),
    oauthCancel: () => ok({}),
  } as unknown as providers.ProvidersApi;
  let keys = 0;
  const env: providers.Env = {
    sleep: (ms) => (ms === 0 ? Promise.resolve() : new Promise<void>(() => undefined)),
    now: () => 1_000_000,
    hidden: () => false,
    visible: () => Promise.resolve(),
    newKey: () => `idem-${++keys}`,
    digest: () => Promise.resolve(null),
    alive: () => true,
  };
  return { api, env };
}

const cbs = { onConnected: () => undefined, onBack: () => undefined };

export default [
  scenarios('ChatGptSetup', ChatGptSetup, {
    ignored: {},
    unsupported: {
      failedText: 'a refusal\'s wording: ProviderSetup.test.tsx', onConnected: 'the job ending complete: ProviderSetup.test.tsx',
      onBack: 'Back and a cancelled sign-in: ProviderSetup*.test.tsx',
    },
    cases: [
      {
        name: 'Open the sign-in page opens the job\'s device address whole',
        props: () => ({ ...agent(DEVICE), ...cbs }),
        covers: ['api', 'env'],
        steps: [{ press: { role: 'button', name: 'Open the sign-in page' } }],
        expect: { opened: [DEVICE] },
      },
      {
        name: 'an address that carries the code gets no button and opens nothing',
        props: () => ({ ...agent(`${DEVICE}?user_code=${CODE}`), ...cbs }),
        covers: ['api', 'env'],
        steps: [],
        expect: { opened: 0, nodes: [{ target: { role: 'group', name: 'Your code' } }, { target: { role: 'button', name: 'Open the sign-in page' }, absent: true }] },
      },
    ],
  }),
];
