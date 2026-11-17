// A Board tile placed for a launch whose outcome is not proven yet: instead of the program it shows
// "may still be starting" with Check, and the program only once a read proves the launch (or the person dismisses
// it through the warned Dismiss, which also lifts the hold on a second copy).
//
// Contract, in plain words:
//   - The tile is matched to a launch by its computer and its place (terminal N, display N, web port), among this
//     session's launches and the recent list (so a reload still knows it). No match: the children, untouched.
//   - Held = unknown (an Open, Stop or read whose outcome was not confirmed, or a stored launch not read back yet)
//     or an Open still in flight. Anything a read proved (starting, running, ended) shows the children.
//   - Check is one status read (useApps check); it never sends the launch again. Dismiss asks first.
//   - Only a matched tile mounts the launcher's machine (useApps); every other tile costs one store lookup.
//   - Files launches: an unresolved Open-with launch at the place (an Open-with hold
//     there, or a marked row, that is not listed yet, still opening, or reads unknown: foreign_record included)
//     blocks the frame whatever a newer row there says, since a launch's time is stamped before it got its number.
//     The tile shows that launch's card (the oldest first) and Check reads that launch's own handle with its own
//     tag. The newest-row rule below applies only once none is unresolved. Its card's words are the row's (wordsFor).
//   - The launch card: at the place a screen or web app shows in (its display, its web port; never its
//     terminal tile, which is its terminal), a launch this tab sent (parts/arrival.ts) that is proven starting or
//     running but not there yet (no `ready`) shows what is happening instead of an empty display or a refused page:
//     its step, what it waits for, the time since Open, and after 15 s that a download, if it needs one, takes longer.
//     "Show the display now" shows the program and sends nothing. One that ended before it was there (exited,
//     not_started) says so in the row's own words, with Show only: no Try again (a second Open lands on another
//     display or port, which this tile does not show) and no Dismiss (a terminal it left keeps the row's own Remove).
//     A terminal app, a launch read back after a reload or another tab's launch: the program.
import type { Target } from '@core';
import { Button, OutcomeBanner, Spinner, Stack, cx, useNow, useStrings, type OutcomeKind } from '@kit';
import { attemptsVersion, subscribeAttempts } from '@core';
import { useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { LIVE } from '../data';
import { marked, view, type OpenApp } from '../logic';
import { elapsedOf, shown as showNow, useArrival } from '../parts/arrival';
import { isOpening } from '../parts/live';
import { owKey, recentKey } from '../parts/recent';
import strings from '../strings.en.json';
import { AppsDialogs } from './Dialogs';
import l from './launch.module.css';
import { heldAt, storedAt, useLaunchMatched } from './match';
import { rowSentence } from './openWith/useOpenWith';
import { runAt, type Placement } from './placement';
import { useApps } from './useApps';

export interface LaunchHoldProps {
  /** The tile's computer. */
  target: Target;
  /** The tile's place on it. */
  at: Placement;
  /** The tile's program, shown when no unproven launch is there. */
  children: ReactNode;
}

export function LaunchHold({ target, at, children }: LaunchHoldProps) {
  // The rule the Board's useLaunchHeld uses too (match.ts: the store and another tab's writes are followed).
  const matched = useLaunchMatched(target.project.id, target.container.id, at, LIVE);
  if (!matched) return <>{children}</>;
  return (
    <Held target={target} at={at}>
      {children}
    </Held>
  );
}

function Held({ target, at, children }: LaunchHoldProps) {
  const t = useStrings(strings);
  const a = useApps({ target, keepCodes: true, nav: { select: () => undefined } });
  const cid = target.container.id;
  // The newest launch at this place (a terminal number is reused once its launch ended).
  const row = useMemo(() => {
    let best: OpenApp | undefined;
    for (const r of a.rows) {
      const run = a.snap.runs.get(r.key);
      if (run && runAt(run, cid, at) && (!best || r.startedAt > best.startedAt)) best = r;
    }
    return best;
  }, [a.rows, a.snap.runs, cid, at]);
  const holds = useSyncExternalStore(subscribeAttempts, attemptsVersion);
  // The Open-with holds at this place (their rows may not be listed yet).
  const held0 = useMemo(
    () => heldAt(target.project.id, cid, at, LIVE),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- holds: a hold changed
    [holds, target.project.id, cid, at],
  );
  // Held mounts only on a match, so no row yet means the match is still being read in. A stored launch or an
  // Open-with hold here that this view has not listed yet (a reload, another tab reusing the terminal) may also be
  // newer than every listed row. Either way the program stays out until the row is listed and says whether it is
  // proven.
  const unread = useMemo(() => {
    const known = new Set<string>();
    const knownOw = new Set<string>();
    // A hidden row (removed, or its hold went) is not listed: a hold still kept there must list again first.
    for (const [key, r] of a.snap.runs) {
      if (a.snap.forgotten.has(key)) continue;
      known.add(recentKey(r));
      knownOw.add(owKey(r));
    }
    // A hold is listed only by its whole identity: a row at its place and command with another tag is another launch.
    return storedAt(a.snap, target.project.id, cid, at, LIVE).some((r) => !known.has(recentKey(r))) || held0.some((r) => !knownOw.has(owKey(r)));
  }, [a.snap, target.project.id, cid, at, held0]);
  // The unresolved Open-with launches at this place, oldest first: a listed row of a hold there, or a marked row
  // there, that is still opening or reads unknown. One of them blocks the frame whatever the newest row says.
  const blocking = useMemo(() => {
    const holdKeys = new Set(held0.map(owKey));
    const out: OpenApp[] = [];
    for (const r of a.rows) {
      const run = a.snap.runs.get(r.key);
      if (!run || !runAt(run, cid, at) || a.snap.forgotten.has(r.key)) continue;
      if (!holdKeys.has(owKey(run)) && !marked(r)) continue;
      if (r.state === 'unknown' || r.state === 'starting' || isOpening(r.key)) out.push(r);
    }
    return out.sort((x, y) => x.startedAt - y.startedAt);
  }, [a.rows, a.snap.runs, a.snap.forgotten, cid, at, held0]);
  if (!row || unread) {
    return (
      <Frame label={t('hold.loading')}>
        <Loader step={t('hold.loading')} />
      </Frame>
    );
  }
  // An unresolved Open-with launch here comes first (its own card and Check); otherwise the newest row decides.
  const shown = blocking[0] ?? row;
  const held = blocking.length > 0 || row.state === 'unknown' || isOpening(row.key);
  if (!held) return <Arrival row={row} at={at}>{children}</Arrival>;
  const reading = a.snap.patches.get(shown.key)?.busy === 'check';
  const checking = shown.code === 'checking' || reading;
  // A Files launch says what its row says (wordsFor), so a record of another launch is never "may still be
  // starting" here and "can't tell" there.
  const title = marked(shown) ? rowSentence(shown) : t('hold.title', { name: shown.name });
  return (
    <Frame label={t('hold.title', { name: shown.name })}>
      {checking ? (
        <Loader step={t('hold.checking', { name: shown.name })} />
      ) : (
        <OutcomeBanner kind="pending" title={title} body={t('hold.body')} onCheck={() => void a.check(shown)} checking={reading} />
      )}
      <div className={l.actions}>
        <Button size="sm" variant="ghost" onPress={() => a.askForget(shown)}>
          {t('act.dismiss')}
        </Button>
      </div>
      <AppsDialogs a={a} />
    </Frame>
  );
}

/** Every state of a held tile in one centred frame on the tile's own theme surface: the tile body is
 *  the app window's colour, so the card never draws on it. */
function Frame({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={l.hold} role="group" aria-label={label}>
      <Stack gap={3} className={l.frame}>
        {children}
      </Stack>
    </div>
  );
}

/** The loader: a large spinner, the step as its title, then what follows it (the wait, the time, Show). */
function Loader({ step, children }: { step: string; children?: ReactNode }) {
  return (
    <Stack gap={2} align="center" className={l.loader}>
      <Spinner size="lg" label={step} />
      <p className={l.title} aria-hidden="true">
        {step}
      </p>
      {children}
    </Stack>
  );
}

/** The launch card's case for a row: `wait` while a screen or web app this tab sent is proven starting or running
 *  but not there yet, `ended` when it ended before it was there, null otherwise (the program shows). */
export function arrivalKind(row: Pick<OpenApp, 'state' | 'opensIn' | 'ipv6Only' | 'code'>, since: number | undefined, at: Placement): 'wait' | 'ended' | null {
  if (since === undefined) return null;
  // Only where the app itself shows: a screen app's display, a web app's port (its terminal tile is its terminal).
  if (!(row.opensIn === 'screen' && at.kind === 'display') && !(row.opensIn === 'web' && at.kind === 'port')) return null;
  // A terminal the launch may have left behind keeps the row's own Remove flow, never this card.
  if (row.code === 'terminal_left' || row.code === 'terminal_replaced') return null;
  if (row.state === 'starting' || row.state === 'started' || (row.state === 'running' && !row.ipv6Only)) return 'wait';
  if (row.state === 'exited' || row.state === 'not_started') return 'ended';
  return null;
}

/** The first start of an app may download it: said once the wait passes this. */
export const SLOW_MS = 15000;

function Arrival({ row, at, children }: { row: OpenApp; at: Placement; children: ReactNode }) {
  const t = useStrings(strings);
  const since = useArrival(row.key);
  const kind = arrivalKind(row, since, at);
  const now = useNow(kind === 'wait');
  if (!kind || since === undefined) return <>{children}</>;
  const web = row.opensIn === 'web';
  if (kind === 'ended') {
    const v = view(row);
    const outcome: OutcomeKind = row.state === 'not_started' ? 'not_sent' : v.tone === 'bad' ? 'failed' : 'done';
    return (
      <Frame label={t(v.key as 'st.notStarted', { name: row.name })}>
        <OutcomeBanner
          // noDetails: no request failed; the computer reported the app's own end (its state and exit code)
          kind={outcome}
          title={t(v.key as 'st.notStarted', { name: row.name })}
          body={t('card.again')}
        />
        <div className={l.actions}>
          <Button size="sm" variant="secondary" onPress={() => showNow(row.key)}>
            {t(web ? 'card.showPageEnded' : 'card.showScreenEnded')}
          </Button>
        </div>
      </Frame>
    );
  }
  const step = row.state === 'starting' ? t('st.starting', { name: row.name }) : t('card.starting', { name: row.name });
  const e = elapsedOf(now, since);
  const elapsed = t(e.key, e.v);
  return (
    <Frame label={step}>
      <Loader step={step}>
        <p className={l.wait}>{t(web ? 'card.waitWeb' : 'card.waitScreen')}</p>
        <p className={cx(l.wait, l.elapsed)}>{elapsed}</p>
        {now - since >= SLOW_MS ? <p className={l.wait}>{t('card.slow')}</p> : null}
        <Button size="sm" variant="secondary" onPress={() => showNow(row.key)}>
          {t(web ? 'card.showPage' : 'card.showScreen')}
        </Button>
      </Loader>
    </Frame>
  );
}
