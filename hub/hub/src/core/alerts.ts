// alerts.ts: browser alerts (the native notifications a tab raises) and the discovery hints, shared by the
// notifications page and the shell's alert runner.
//
// Contract, in plain words:
//   - The pure half: alertStatus(env, stored) walks the permission states (unsupported, broken, blocked, ask, off,
//     on); cleanAlertText makes admin text safe for a native alert; hintWanted/hintSection decide the hints;
//     freshNotices/planAlerts/addShown are the alert engine's decisions. Each takes a BrowserEnv, so tests drive
//     every browser without one.
//   - The impure half: readEnv() reads the browser once; the per-account, per-browser choices live under the
//     registered keys hub_notify:<uid>:alerts|hints (kept at sign-out) and hub_notify_seen:|hub_notify_shown:<uid>
//     (removed at sign-out), through localSetting. The account is the caller's uid, never core's shown account.
//   - Nothing asks for permission unless enableAlerts() is called from a click: a prompt is never a page-load
//     surprise. showAlert builds one native alert; a browser that refuses to build one from a page is remembered
//     browser-wide ('broken') until a later success.
//   - While a passcode is stored for the shown account (locked or not), showAlert shows only the caller's `generic`
//     text (a count and a fixed line), else the bare product name: decided at delivery, right before the page alert
//     is built and again after the worker fallback's await.
import { hostEnv } from './host-env';
import { passcodeStored } from './applock';
import { apiOrigin, isStandalone } from './origin';
import { supportOf, alertStatus, TITLE_MAX, BODY_MAX, cleanAlertText, getChoice, setChoice, isBroken, flagBroken, clearBroken, GENERIC_ALERT } from './alerts.pure';
export { platformOf, supportOf, alertStatus, firstHelp, TITLE_MAX, BODY_MAX, cleanAlertText, HINT_KINDS, SECTIONS, isHintKind, isSectionId, hintWanted, hintSection, MAX_SINGLE_ALERTS, SHOWN_RING, freshNotices, planAlerts, addShown, getChoice, setChoice, readList, isBroken, flagBroken, clearBroken, disableAlerts, GENERIC_ALERT } from './alerts.pure';
export type { AlertNotice, BrowserEnv, PlatformInfo, WhyUnsupported, AlertState, AlertStatus, HintKind, SectionId, Seen, AlertPlan, EnableResult, AlertInfo, ShowResult } from './alerts.pure';
import type { BrowserEnv, AlertStatus, EnableResult, AlertInfo, ShowResult } from './alerts.pure';

const ALERT_ICON = '/auth/favicon-96x96.png';

/** A browser alert's icon: the served Hub's own. The standalone Hub (one HTML file, any origin or a file) has no /auth/
 *  folder of its own, so it names the chosen Hoody's icon when that Hoody is https, else none (the browser's own). */
export function alertIcon(standalone: boolean, hoody: string | null): string | undefined {
  if (!standalone) return ALERT_ICON;
  return hoody && hoody.startsWith('https://') ? hoody + ALERT_ICON : undefined;
}

export function readEnv(): BrowserEnv {
  // A host that is not a page (a terminal) has no browser alerts: it reads as a browser without the API.
  const h = hostEnv().browserPage ? hostEnv().alertHost : null;
  if (!h) return { hasNotification: false, permission: undefined, secure: false, ua: '', platform: '', touch: 0, standalone: false };
  return h.facts();
}

/** The page's Notification constructor, undefined where the host has no alerts. */
const pageNotification = (): typeof Notification | undefined => hostEnv().alertHost?.Notification;

export function currentStatus(uid: string, env: BrowserEnv = readEnv()): AlertStatus {
  return alertStatus(env, {
    alerts: getChoice(uid, 'alerts'),
    broken: isBroken(),
  });
}

/** Ask for permission (call from a click only) and switch alerts on for this account in this browser. */
export function enableAlerts(
  uid: string,
  env: BrowserEnv = readEnv(),
  N: typeof Notification | undefined = pageNotification(),
): Promise<EnableResult> {
  const s = currentStatus(uid, env);
  if (s.state === 'unsupported' || s.state === 'broken' || s.state === 'blocked')
    return Promise.resolve({
      state: s.state,
      remembered: true,
      answer: s.perm,
    });
  const done = (answer: string): EnableResult => {
    let remembered = true;
    if (answer === 'granted') {
      remembered = setChoice(uid, 'alerts', 'on');
      setChoice(uid, 'seen', ''); // a fresh start: what arrived while alerts were off never alerts
    }
    const next = currentStatus(uid, answer === 'granted' ? { ...env, permission: 'granted' } : env);
    return { state: next.state, remembered, answer };
  };
  if (s.perm === 'granted') return Promise.resolve(done('granted'));
  return new Promise((resolve) => {
    let finished = false;
    const fin = (p: unknown) => {
      if (finished) return;
      finished = true;
      resolve(done(p === 'granted' || p === 'denied' ? p : 'default'));
    };
    try {
      if (!N) return fin('default');
      const r = N.requestPermission(fin) as Promise<NotificationPermission> | undefined;
      if (r && typeof r.then === 'function') r.then(fin, () => fin('default'));
    } catch {
      fin('default');
    }
  });
}

/**
 * Build one native alert. `ctor`: this browser will not build an alert from a page (Android Chrome); it is
 * remembered browser-wide so the Hub stops offering what cannot work, and cleared by a later success.
 */
export async function showAlert(
  o: AlertInfo,
  env: BrowserEnv = readEnv(),
  N: typeof Notification | undefined = pageNotification(),
): Promise<ShowResult> {
  if (!supportOf(env).ok || !N) return { ok: false, reason: 'unsupported' };
  if (env.permission !== 'granted') return { ok: false, reason: 'denied' };
  const h = hostEnv().alertHost;
  // Read at delivery, every time: a passcode set while this ran makes the alert generic.
  const text = (): { title: string; opts: NotificationOptions } => {
    const root = h ? h.textDir() : { lang: '', dir: '' };
    const g = passcodeStored() ? (o.generic ?? GENERIC_ALERT) : o;
    return {
      title: cleanAlertText(g.title, TITLE_MAX) || 'Hoody',
      opts: {
        body: cleanAlertText(g.body, BODY_MAX),
        tag: o.tag?.slice(0, 80),
        lang: root.lang || undefined,
        dir: root.dir === 'rtl' || root.dir === 'ltr' ? root.dir : undefined,
        icon: alertIcon(isStandalone(), apiOrigin()),
      },
    };
  };
  try {
    const { title, opts } = text();
    const n = new N(title, opts);
    n.onclick = () => {
      try {
        h?.focus();
        n.close();
      } catch {
        /* best effort */
      }
      o.onClick?.();
    };
    clearBroken();
    return { ok: true, via: 'page' };
  } catch {
    // Some engines (Android Chrome) throw "Illegal constructor": the only door is a service worker registration
    // the Hub does not ship. Use one if the site already has it; otherwise this browser cannot alert from a page.
    try {
      const reg = await h?.workerRegistration();
      if (reg) {
        const { title, opts } = text();
        await reg.showNotification(title, opts);
        clearBroken();
        return { ok: true, via: 'worker' };
      }
    } catch {
      /* fall through */
    }
    flagBroken();
    return { ok: false, reason: 'ctor' };
  }
}

/** The tab is out of the person's sight: hidden, or another window has the focus. */
export function isAway(doc?: Document): boolean {
  if (!doc) return hostEnv().alertHost?.away() ?? false;
  try {
    return doc.hidden || !doc.hasFocus();
  } catch {
    return false;
  }
}
