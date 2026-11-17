// The live mount's send policy, as a host mount builds it: every live mount is wired. What may leave is
// live-wire.ts's decision; this file only
// turns the host's options into its LiveWiring.
//
//   - The store: the host (the CLI, a launcher) opened the account's store (scripts/term/build/hub-store-open.ts) and
//     hands the opened area here. No store, or one that could not be used: `area` null, so every change is refused
//     unsent (NOT_DURABLE) and reads still work. The Hub never opens a file itself.
//   - The secret-screen row asks the mount's real screen, the same asking the secret fields use (run.ts
//     secretScreenFor, handed over once the renderer exists: TermBoot.screen). On a screen that cannot show a secret
//     (no TTY, the main screen, TERM unset or dumb) every send that would show one is refused unsent, reads included,
//     so a key shown only once is never made where it could not be shown; one warn toast says why and what to do.
//     On the alternate screen of a terminal nothing changes. Before the renderer exists (core's boot: nothing is
//     drawn, no page can ask) the boot's own reads go out as before.
//   - No passcode host yet: never locked.
//   - The per-request deadline is the host client's (the boot-token cleanup's clock); absent, REQUEST_DEADLINE_MS.
//   - The store's notice (it was reset, unreadable, missing: the opener's sentence) is one warn toast once core is up,
//     closed when the mount ends. Host text: cut to its bounds, never refused.
import { showToast, toastQueue } from '@kit/states/Toast.store';
import strings from '../shell/strings.en.json';
import type { TermBoot } from './lifecycle';
import type { LiveWiring } from './live-wire';
import type { SecretScreenAsk } from './secret-screen-ctx';

/** The deadline a host client is assumed to give each request when it names none. */
export const REQUEST_DEADLINE_MS = 60_000;

/** The account store as the host hands it to the mount (HubTermOptions.store). */
export interface LiveStoreHandoff {
  readonly area: LiveWiring['area'];
  /** When the host opened it (LiveWiring.storeOpenedAt). */
  readonly openedAt: number;
  /** What the opener has to tell the person (hub-store-open.ts storeNoticeToast), shown once as a toast. */
  readonly notice?: { readonly title: string; readonly body: string } | null;
}

export const NOTICE_TOAST_ID = 'term.store';
export const NOTICE_TOAST_MS = 20_000;
/** The one toast a refused secret send shows (showToast folds repeats into it), closed when the mount ends. */
export const SECRET_SCREEN_TOAST_ID = 'term.secret-screen';
export const SECRET_SCREEN_TOAST_MS = 12_000;
const NOTICE_TITLE_MAX = 40;
const NOTICE_BODY_MAX = 600;
const cut = (v: unknown, max: number): string => {
  const cps = Array.from(typeof v === 'string' ? v : '');
  return cps.length > max ? cps.slice(0, max - 1).join('') + '…' : cps.join('');
};

/** The boot, plus the store's notice shown once core is up and closed when the mount ends. */
export function withStoreNotice(boot: TermBoot, notice: LiveStoreHandoff['notice']): TermBoot {
  const title = notice ? cut(notice.title, NOTICE_TITLE_MAX) : '';
  if (!title) return boot;
  const body = cut(notice!.body, NOTICE_BODY_MAX);
  let key: string | null = null;
  return {
    ...boot,
    start: async (session, end) => {
      await boot.start(session, end);
      key = showToast({ id: NOTICE_TOAST_ID, tone: 'warn', title, ...(body ? { body } : {}) }, NOTICE_TOAST_MS);
    },
    dispose: async (reason) => {
      if (key !== null) { toastQueue().close(key); key = null; }
      return boot.dispose(reason);
    },
  };
}

export function liveWiringOf(o: { store?: LiveStoreHandoff; requestDeadlineMs?: number }, now: () => number = Date.now): LiveWiring {
  const deadline = o.requestDeadlineMs;
  let screen: SecretScreenAsk | null = null;
  let toast: string | null = null;
  return {
    area: o.store?.area ?? null,
    storeOpenedAt: o.store ? o.store.openedAt : now(),
    requestDeadlineMs: typeof deadline === 'number' && deadline > 0 ? deadline : REQUEST_DEADLINE_MS,
    // Asked at each admission; an asking that throws reads as no.
    secretReveal: () => {
      if (!screen) return true;
      try { return screen().reveal === true; } catch { return false; }
    },
    screen: (ask) => { screen = ask; },
    onSecretScreen: () => {
      toast = showToast({ id: SECRET_SCREEN_TOAST_ID, tone: 'warn', title: strings['live.secretScreen.title'], body: strings['live.secretScreen.body'] }, SECRET_SCREEN_TOAST_MS);
    },
    ended: () => {
      if (toast !== null) { toastQueue().close(toast); toast = null; }
    },
  };
}
