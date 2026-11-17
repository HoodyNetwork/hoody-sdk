// The browser-alert engine. It turns NEW account notices into native
// alerts while the Hub is open in a tab the person is not looking at. There is no push service: an
// alert exists only because the summary poller saw a newer notice and this tab then read the unread
// list. The rules (freshNotices, planAlerts, addShown) live in core/alerts.ts with
// their tests; this file is the runner around them, with every effect injected.
//
// Contract, in plain words:
//   - start(uid) runs for one account; stop() ends it, and a stopped run alerts nothing, even from a
//     read already in flight. A run for an account that is no longer shown does nothing.
//   - First sight of an account in this browser (no `seen`) sets a baseline and alerts nothing: the
//     first look of a run asks the poller for a fresh summary and takes the baseline from that
//     answer, so turning alerts on never replays history.
//   - A newer latest_id makes one bounded read of the unread list down to the baseline. Only notices
//     newer than the baseline and never alerted before (any tab: the `shown` ring) are new. The
//     baseline moves only after a read that answered; a failed read advances nothing.
//   - Only a visible tab reads: a hidden tab marks the change for later and handles it when it comes
//     to the front. One read at a time; a change during a read is handled after it.
//   - Alerts must still be on after the read answers (switched off in another tab sends nothing). A
//     person who is looking (visible and focused) gets no alert, but the notices count as handled.
//   - Up to three notices alert one by one (oldest first); more become one "N new notices" alert.
//     Tags are the notice id, so two tabs never stack twins. The body is a fixed line: a notice body
//     can hold an address and an alert can sit on a lock screen.
//   - While a passcode is set (locked or not, read at each delivery) every batch is ONE alert with the count
//     ("New notice", "N new notices", "N+ new notices") and the fixed body: no notice title.
//     Every alert also carries that generic text, which showAlert uses if a passcode is set by the time it shows.
import { passcodeStored } from '@core';
import { addShown, freshNotices, planAlerts, type NotificationRow as Notice, type Seen } from '@core/shell';

export interface Summary {
  uid: string;
  unread_count: number;
  latest_id: string | null;
  latest_created_at: string | null;
}

export interface UnreadRead {
  state: 'ok' | 'stale' | 'error';
  rows: readonly Notice[];
  capped: boolean;
}

export interface AlertText {
  untitled: string;
  body: string;
  many: (n: number) => string;
  manyMore: (n: number) => string;
}

export interface EngineDeps {
  /** The account shown now, or null. */
  shownUid: () => string | null;
  /** The newest summary the poller holds. */
  summary: () => Summary | null;
  /** Ask the poller for a fresh summary now (the answer arrives through handle()). */
  refresh: () => void;
  /** Read the unread list, newest first, down to the first row `older` says is not new. */
  readSince: (older: (n: Notice) => boolean) => Promise<UnreadRead>;
  alertsOn: (uid: string) => boolean;
  seen: (uid: string) => Seen | null;
  setSeen: (uid: string, seen: Seen) => void;
  shown: (uid: string) => readonly string[];
  setShown: (uid: string, ids: readonly string[]) => void;
  hidden: () => boolean;
  /** Hidden, or another window has the focus. */
  away: () => boolean;
  show: (alert: { title: string; body: string; tag: string; onClick: () => void; generic: { title: string; body: string } }) => void;
  /** A click on an alert: bring the Hub forward at the inbox, if that account is still shown. */
  openInbox: (uid: string) => void;
  text: AlertText;
  /** A passcode is set for the shown account (default: core's stored record, read at each delivery). */
  passcodeSet?: () => boolean;
}

interface Run {
  uid: string;
  busy: boolean;
  again: boolean;
  later: boolean;
  asked: boolean;
}

export interface AlertEngine {
  start: (uid: string) => void;
  stop: () => void;
  /** A new summary arrived (or the tab came to the front). */
  handle: () => void;
  /** The tab's visibility changed. */
  visibility: () => void;
}

export function createAlertEngine(d: EngineDeps): AlertEngine {
  let run: Run | null = null;
  const live = (r: Run) => run === r && d.shownUid() === r.uid;

  function handle(r: Run | null = run): void {
    if (!r || !live(r)) return;
    const s = d.summary();
    if (!s || s.uid !== r.uid || typeof s.unread_count !== 'number') return;
    if (!d.alertsOn(r.uid)) return;
    const latest = s.latest_id ?? '';
    const at = latest ? (s.latest_created_at ?? '') : '';
    const last = d.seen(r.uid);
    if (!last) {
      if (!r.asked) {
        r.asked = true;
        d.refresh();
        return;
      }
      d.setSeen(r.uid, { id: latest, at });
      return;
    }
    if (last.id === latest) return;
    if (d.hidden()) {
      r.later = true;
      return;
    }
    if (r.busy) {
      r.again = true;
      return;
    }
    r.busy = true;
    const floor = last.at ? Date.parse(last.at) : Number.NaN;
    const older = (n: Notice) => {
      const t = n.at ? Date.parse(n.at) : Number.NaN;
      return n.id === last.id || (Number.isFinite(floor) && Number.isFinite(t) && t <= floor);
    };
    const settle = (res: UnreadRead | null) => {
      r.busy = false;
      if (!live(r) || !res || res.state !== 'ok') return;
      if (!d.alertsOn(r.uid)) return;
      const done = d.shown(r.uid);
      const fresh = freshNotices(res.rows, last, done);
      d.setSeen(r.uid, { id: latest, at });
      if (fresh.length) {
        d.setShown(r.uid, addShown(done, fresh.map((n) => n.id)));
        if (d.away()) deliver(r.uid, fresh, res.capped);
      }
      if (r.again) {
        r.again = false;
        handle(r);
      }
    };
    d.readSince(older).then(settle, () => settle(null));
  }

  function deliver(uid: string, fresh: Notice[], more: boolean): void {
    const plan = planAlerts(fresh, more);
    if (!plan) return;
    const onClick = () => d.openInbox(uid);
    const generic = { title: more ? d.text.manyMore(fresh.length) : fresh.length === 1 ? d.text.untitled : d.text.many(fresh.length), body: d.text.body };
    if (!Array.isArray(plan) || (d.passcodeSet ?? passcodeStored)()) {
      d.show({ ...generic, tag: `hub-n:${fresh[fresh.length - 1]?.id ?? ''}`, onClick, generic });
      return;
    }
    for (const a of plan) d.show({ title: a.notice.title || d.text.untitled, body: d.text.body, tag: `hub-n:${a.notice.id}`, onClick, generic });
  }

  return {
    start(uid) {
      if (d.shownUid() !== uid) return;
      if (run && run.uid === uid) return;
      run = { uid, busy: false, again: false, later: false, asked: false };
      handle(run);
    },
    stop() {
      run = null;
    },
    handle: () => handle(run),
    visibility() {
      if (run && run.later && !d.hidden()) {
        run.later = false;
        handle(run);
      }
    },
  };
}
