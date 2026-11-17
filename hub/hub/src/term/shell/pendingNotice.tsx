// A change whose outcome is unknown (C9 pending), told by the terminal shell: the web's CoreNotices toast (shell/notices.tsx)
// with its words, one per context, an `unknown` toast that stays until closed, never a retry.
// The web stays quiet while a page shows that outcome itself, read from a DOM mark (data-outcome="pending") the
// terminal has no equivalent of. Here the page the change was sent from is the one that shows it: the toast waits until the
// person leaves that view (core's view generation moved since the change was captured) or a switch or account change
// took the page's outcome (the context generation moved), then shows. Nothing while a sign-out runs (the web's
// signingOut rule; the sign-out warning names open changes), and never to another account: a wait whose account is no
// longer the one shown is dropped unshown (the web's toast fires within 600 ms; an account end there is a page load).
// Nothing shows after the shell unmounts (the toast queue outlives it).
import { useEffect } from 'react';
import { onPending, realmName, snapshot, subscribe } from '@core/shell';
import { showToast } from '@kit/states/Toast';
import { type Translate, useStrings } from '@kit/strings';
import strings from '../../shell/strings.en.json';

type T = Translate<typeof strings>;

// The web's nameOf (shell/notices.tsx), the same words for the realm.
function nameOf(t: T, id: string): string {
  const n = realmName(id);
  return n.kind === 'alias' || n.kind === 'short' ? n.text : n.kind === 'all' ? t('top.realmAll') : t('notice.noRealm');
}

interface Wait { readonly realm: string; readonly vgen: number; readonly gen: number; readonly account: string | null }

export function TermPendingNotices(): null {
  const t = useStrings(strings);
  useEffect(() => {
    const waits = new Set<Wait>();
    let mounted = true;
    const show = (w: Wait): void => {
      if (!mounted || snapshot().account !== w.account) return;
      showToast({ tone: 'unknown', title: t('notice.pending', { realm: nameOf(t, w.realm) }), body: t('notice.pendingBody') });
    };
    const check = (): void => {
      if (waits.size === 0) return;
      const s = snapshot();
      for (const w of [...waits]) {
        if (s.loggingOut || s.account !== w.account) { waits.delete(w); continue; }
        if (s.vgen === w.vgen && s.gen === w.gen) continue;
        waits.delete(w);
        // A view change arrives while the shell renders the next page: the toast store updates after it.
        queueMicrotask(() => show(w));
      }
    };
    const offPending = onPending((n, from) => {
      if (n.signingOut) return;
      waits.add({ realm: n.realm, vgen: from.vgen, gen: from.gen, account: from.account });
      check();
    });
    const offCore = subscribe(check);
    return () => { mounted = false; waits.clear(); offPending(); offCore(); };
  }, [t]);
  return null;
}
