// What OpenRouterSetup hands outside the Hub (web and terminal): "Open OpenRouter" opens the sign-in address the agent's
// job gave, whole (its code challenge and callback are the sign-in), and only an address on OpenRouter's own host
// (providers.pkceLink): any other gets no button and opens nothing. The flow itself (code once, never shown, lost answers,
// cancel) is pinned in OpenRouterSetup.test.tsx and ProviderSetup.openrouter.test.tsx.
import type { providers } from '@core';
import { scenarios } from '../scenario-types';
import { OpenRouterSetup } from './OpenRouterSetup';

const AUTH = 'https://openrouter.ai/auth?callback_url=http%3A%2F%2Flocalhost%3A53781%2Fcallback&code_challenge=abc&code_challenge_method=S256';

/** An agent whose sign-in job is pending with `uri`; the poll's wait never ends (the case reads the waiting step). */
function agent(uri: string): { api: providers.ProvidersApi; env: providers.Env } {
  const ok = (body: unknown) => Promise.resolve({ ok: true as const, body });
  const pending = () => ok({ state: 'pending', needs_code: true, verification_uri: uri });
  const api = {
    auth: () => ok({ auth: { oauth_stored: false } }),
    pkceStart: () => ok({ job_id: 'j1', verification_uri: uri }),
    pkcePoll: pending,
    pkceCode: () => ok({}),
    pkceCancel: () => ok({}),
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

export default [
  scenarios('OpenRouterSetup', OpenRouterSetup, {
    ignored: {},
    unsupported: {
      failedText: 'a refusal\'s wording: OpenRouterSetup.test.tsx', onSigned: 'the job ending complete: OpenRouterSetup.test.tsx',
      onBack: 'Back and a cancelled sign-in: OpenRouterSetup.test.tsx',
    },
    cases: [
      {
        name: 'Open OpenRouter opens the job\'s sign-in address whole',
        props: () => ({ ...agent(AUTH), onSigned: () => undefined, onBack: () => undefined }),
        covers: ['api', 'env'],
        steps: [{ press: { role: 'button', name: 'Open OpenRouter' } }],
        expect: { opened: [AUTH] },
      },
      {
        name: 'an address off OpenRouter\'s host gets no button and opens nothing',
        props: () => ({ ...agent('https://openrouter.example.net/auth?code_challenge=abc'), onSigned: () => undefined, onBack: () => undefined }),
        covers: ['api', 'env'],
        steps: [],
        expect: { opened: 0, nodes: [{ target: { role: 'button', name: 'Open OpenRouter' }, absent: true }, { target: { text: /cannot be opened from here/ } }] },
      },
    ],
  }),
];
