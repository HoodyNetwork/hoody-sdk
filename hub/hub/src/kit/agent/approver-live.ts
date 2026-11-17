// The page's one approver manager and its wiring to the page.
import { agent, capture, hostEnv, onBump } from '@core';
import { createApproverManager } from './approver';
import type { ApproverManager, ApproverRoutes } from './approver-types';

let shared: ApproverManager | null = null;
const HIDDEN_GAP_MS = 60_000;
/** The page's one approver manager, wired to the page: pagehide/freeze give the leases back (keepalive) and pageshow/resume take
 *  them again; a tab hidden for 60 s or more is a gap in the clocks; an account change (core's bump `account`, `signout`
 *  or `logout`) abandons the old account's capabilities. Callers do none of this. */
export function approvers(): ApproverManager {
  if (shared) return shared;
  const m = createApproverManager({
    api: (ref) => agent.approverApi(ref.target),
    routes: agent.approverRoutes as unknown as ApproverRoutes,
    account: () => { try { const a = capture().account; return a == null ? '' : String(a); } catch { return ''; } },
  });
  shared = m;
  if (hostEnv().browserPage === true) {
    let hiddenAt: { m: number; w: number } | null = null;
    const mono = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());
    window.addEventListener('pagehide', () => m.hide());
    window.addEventListener('pageshow', () => m.show());
    document.addEventListener('freeze', () => m.hide());
    document.addEventListener('resume', () => m.show());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') { hiddenAt = { m: mono(), w: Date.now() }; return; }
      const was = hiddenAt;
      hiddenAt = null;
      if (was !== null && (mono() - was.m >= HIDDEN_GAP_MS || Date.now() - was.w >= HIDDEN_GAP_MS)) m.gap();   // either clock: a stepped wall clock must not hide a gap
    });
  }
  onBump((reason) => { if (reason === 'account' || reason === 'signout' || reason === 'logout') m.accountChanged(); });
  return m;
}

/** Tests only: forget the page's manager. */
export function resetApproversForTests(): void { shared = null; }
