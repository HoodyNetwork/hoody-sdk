// The AI page's api sends each call to the computer core shows at that moment (coreApi.ts: no target of its own). A flow
// that must stay on one computer (a held change, its read-back, its Check again) names the computer it was shown and sends
// through onlyOn: each call goes out only while core still shows that computer; after a switch it answers stale and sends
// nothing, so a read of another computer can never settle (or free) what was held for this one.
import { capture } from '@core';
import { GONE, type Api } from './api';

/** The computer core sends to now: its project and container id, '' with none. */
export function shownComputer(): string {
  const t = capture().target;
  return t ? `${t.project.id}\n${t.container.id}` : '';
}

/** `api` (the page's Api, or a part of it) with every call gated on `on` (a shownComputer() value): sent only while core
 *  still shows that computer, else answered stale with nothing sent. The check and the send run in the same turn, so a
 *  switch cannot land between them. */
// Typed as a Pick of the page's Api: a caller's own narrower method type (a success-only answer) is
// never promised, since after a switch every method answers GONE.
export function onlyOn<K extends keyof Api>(api: Pick<Api, K>, on: string): Pick<Api, K> {
  return new Proxy(api, {
    get(target, key, receiver) {
      const v: unknown = Reflect.get(target, key, receiver);
      if (typeof v !== 'function') return v;
      const f = v as (...args: unknown[]) => unknown;
      return (...args: unknown[]) => (shownComputer() === on ? f.apply(target, args) : Promise.resolve({ ok: false, err: GONE }));
    },
  });
}
