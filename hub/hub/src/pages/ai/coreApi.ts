// The real Api: the provider calls come from @core's providers, and every other call is one declared route
// sent the same way, through core's api() (admission, realm rules, C9 outcomes, secret scrubbing). Never
// rejects: an answer is {ok, body} or {ok:false, err} with a normalised Outcome. Reads are always fresh (core
// keeps no cache here); a change is sent once.
import { capture, providers, type CallInput, type Route } from '@core';
import type { Api, TermApi, TermOwned } from './api';
import { routes } from './routes';

// Index 0 of the terminal routes: the computer's own terminal program, read from without a setup terminal.
const IDX = 0;
// The provider reads and changes (and the settling call) are @core's providers.
const { call } = providers;

const realmOf = (realm: string | null): { realm?: string } => (realm === null ? {} : { realm });

export function coreApi(): Api {
  const read = (route: Route, input: CallInput = {}) => call(route, input, false);
  const write = (route: Route, input: CallInput = {}) => call(route, input, true);
  const at = (o: TermOwned) => ({ index: o.n });
  // The terminal calls. With `target` each goes to that computer; without, to the one core shows when it is sent.
  const term = (target?: CallInput['target']): TermApi => {
    const on = (input: CallInput): CallInput => (target ? { ...input, target } : input);
    return {
      termCaps: () => read(routes.termCaps, on({ index: IDX })),
      termCreate: (n, user) => write(routes.termCreate, on({ index: n, query: { terminal_id: n }, body: { terminal_id: n, exclusive: true, user, wait_until_display: false } })),
      termWait: (o) => write(routes.termWait, on({ ...at(o), body: { mode: 'stable', debounce_ms: 500, timeout_ms: 8000 } })),
      termWrite: (o, input) => write(routes.termWrite, on({ ...at(o), body: { input, enter: true } })),
      termDelete: (o) => write(routes.termDelete, on({ ...at(o), params: { n: o.n }, query: { incarnation: o.inc } })),
    };
  };
  return {
    ...providers.providersApi(),
    agents: (realm) => read(routes.agents, { realm }),
    bots: (realm) => read(routes.bots, { realm }),
    acp: (realm) => read(routes.acp, { realm }),
    acpDefault: (realm) => read(routes.acpDefault, { realm }),
    jev: (realm) => read(routes.jev, realmOf(realm)),
    jevModels: () => read(routes.jevModels),

    customCreate: (body, idem) => write(routes.customCreate, { body, idem }),
    customPatch: (pid, body) => write(routes.customPatch, { params: { pid }, body }),
    customDelete: (pid) => write(routes.customDelete, { params: { pid } }),
    agentModel: (realm, agent, model) => write(routes.agentModel, { params: { name: agent }, body: { model }, realm }),
    acpEnabled: (realm, enabled) => write(routes.acpEnabled, { body: { enabled }, realm }),
    acpDefaultPut: (realm, agent) => write(routes.acpDefaultPut, { body: { delegated_agent: agent }, realm }),
    jevPut: (realm, _guard, body) => write(routes.jevPut, { body, ...realmOf(realm) }),

    ...term(),
    termSessions: () => read(routes.termSessions, { index: IDX }),
    termOn: (target) => term(target ?? capture().target),
  };
}
