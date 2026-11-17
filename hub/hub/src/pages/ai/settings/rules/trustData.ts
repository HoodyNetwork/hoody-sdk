// The one send of a hook-trust acknowledgement, on the settings session (Session.ts). It is part
// of the hook change (hooksData.ts useHookWrite): same lock, same held notice, same rule that a lost answer is held as unknown and
// ends only by the person's Stop tracking after a fresh listing. Before anything is sent the hooks are read again inside the
// change: only the set the person reviewed (same hash, same unverifiable targets, still pending) is acknowledged, else nothing is
// sent ('TRUST_CHANGED'). The acknowledgement carries the REVIEWED hash. The agent answers every refusal with the same bare 400
// (a moved hash, the wrong risk kind, nothing to trust), so a 400 reads as "nothing was recorded" and no prose is parsed.
import { api, type Ctx } from '@core';
import { hooksBlockOf } from './hooks';
import { sameReview, ackBody, type Review } from './trust';
import { rulesRoutes, hookRoutes } from './routes';
import { SessionError, settingsSessions, type Hold, type SettingsAt } from './Session';
import { sessionCode, unreadable, unsent } from './data';

export interface TrustVars extends SettingsAt { hold: Hold; review: Review }

/** One send of one acknowledgement: the fresh read, then the acknowledgement, once. The answer is only "ok"; the rest is read back. */
export async function sendTrust(v: TrustVars, ctx: Ctx): Promise<{ ok: true }> {
  // Whether the acknowledgement left in the run that ended last: a session that ends after that point leaves its outcome unknown.
  let sent = false;
  try {
    const r = await settingsSessions().run(v.hold, async (sid, alive) => {
      sent = false;
      let raw: unknown;
      try {
        // recovers: a lost answer to this read is "not sent" here, so core must not announce a change that may have gone through.
        raw = await api(rulesRoutes.list, { target: v.target, realm: v.realm, query: { session_id: sid }, ctx, recovers: true });
      } catch (e) {
        throw unsent(e);
      }
      const block = hooksBlockOf(raw);
      if (!block) throw unsent(new Error('hooks'), 'HOOKS_UNREADABLE');
      if (!sameReview(v.review, block)) throw unsent(new Error('hooks changed'), 'TRUST_CHANGED');
      // The hold or the session ended while the hooks were being read: nothing is sent.
      if (!alive()) throw new SessionError('superseded');
      sent = true;
      // Handed back as data, so the session manager sees a finished run and has nothing to replace and re-run.
      try {
        return { ok: true as const, v: await api(hookRoutes.ackTrust, { target: v.target, realm: v.realm, body: ackBody({ sessionId: sid, review: v.review }), ctx }) };
      } catch (e) {
        return { ok: false as const, e };
      }
    });
    if (!r.ok) throw r.e;
    if ((r.v as { status?: unknown } | null)?.status !== 'ok') throw unreadable('TRUST_UNREADABLE');
    return { ok: true };
  } catch (e) {
    if (e instanceof SessionError) {
      // An acknowledgement that had left when its session ended may have been recorded: it is held, never reported as not sent.
      if (sent && e.kind !== 'lost') throw unreadable(sessionCode(e));
      throw unsent(e, sessionCode(e));
    }
    throw e;
  }
}
