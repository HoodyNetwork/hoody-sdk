// "Launch an app" in a narrow panel (the Board's Add a program step): Find, Options and one Open on a given
// computer, then the launch handed to the host as a place to show it (a Placement), never sent twice.
//
// Contract, in plain words:
//   - Open goes through useApps, so the C9 hold is the one Programs uses: an app still starting or unknown on that
//     computer holds a second Open, from here or from Programs.
//   - Once the Open is answered (placement.ts): a terminal or screen app is placed as its terminal or display, a
//     web app as its web port once a read gives it. An unknown outcome with a handle is placed too:
//     the tile shows "may still be starting" with Check (LaunchHold) and turns live only on proof.
//   - A web app still starting without a port, or an unknown outcome without a handle, stays in the panel with
//     Check; a web app's terminal can be placed instead (or opened in a new tab, below).
//   - An Open held by an earlier launch of the same app places nothing by itself: the panel says so, with Check,
//     and "Add it as a tile" when that launch has a terminal.
//   - A launch that definitely didn't start places nothing: the panel says why, with Try again.
//   - An access code is shown here and the tile waits for "Add the tile", so the code is not lost by the panel
//     closing on its own.
//   - Leaving mid-launch places nothing; the launch stays listed (Programs, Apps tab) and keeps holding re-Opens.
//   - A place the Board refuses to give an address (board links tileHostFits: a host label still too long after
//     core's short form) is never placed or offered as a tile: the panel says so (a held launch and a web app's
//     waiting terminal too) and offers the launch in a new tab at its own address, when that address is known.
//   - With `cwd` (Launch an app here): every Open from this panel is an `apphere` plan built by
//     planFor/toLaunch, so the app runs in that folder and its row restarts only through that plan. A folder
//     the plan refuses opens nothing: the row says it didn't start.
//   - With `q` (the Board's Add a program step, where this panel sits under the computer's own programs): the host
//     draws the one search field and gives its words; Find draws none. `onDetail` tells the host when the panel shows
//     something other than Find (an app's Options, or a launch being followed), so the host shows the panel alone.
import type { Target } from '@core';
import type { IconName } from '@kit';
import type { ReactNode } from 'react';
import { Button, LinkButton, OutcomeBanner, SecretField, Spinner, useNow, useStrings } from '@kit';
import { useEffect, useRef, useState } from 'react';
import { agentById } from '../agents';
import { heldOpen, type Item } from '../logic';
import { tileFits } from '../parts/board';
import { elapsedOf, useArrival } from '../parts/arrival';
import { isOpening, recoverHere, type OpenOpts, type RecoverFor, type Recovery } from '../parts/live';
import { ops } from '../parts/ops';
import { launchOf } from '../parts/words';
import strings from '../strings.en.json';
import { OptionsPanel } from '../parts/OptionsDrawer';
import { AgentGuide } from './AgentsPane';
import { AppsDialogs, openWithOptions } from './Dialogs';
import { FindPane, type FindView } from './FindPane';
import type { FindOutcome } from './findOutcome';
import l from './launch.module.css';
import { planFor, toLaunch } from './openWith/plan';
import { placementOf, type Placement } from './placement';
import { useApps, type Apps } from './useApps';

/** The host shows the launcher's parts as section cards of tiles (the Board's Add a program): which part, the host's
 *  mark for an icon, and the counts the host's tabs show. */
export interface LauncherCards {
  show: 'apps' | 'recent' | 'all' | 'github';
  mark: (icon: IconName) => ReactNode;
  /** The host's mark for a thing with no icon: its name's first letter. */
  letter: (name: string) => ReactNode;
  /** The host's class for a grid of tiles (its column width). */
  grid: string;
  /** `ready`: how many programs the catalogue installs in one press, with nothing typed (null: not known now). */
  /** `outcome`: how far the search of the words now in the field got (findOutcome), so the host claims "nothing
   *  found" only once every place answered for them; `q`: the words that outcome was judged for (a host whose field
   *  holds other words reads it as still looking). */
  onCounts: (c: { apps: number; recent: number; ready: number | null; outcome: FindOutcome; q: string }) => void;
  /** From GitHub ('github'): the Ready step's key the host keeps, and its change. */
  gh?: string | undefined;
  onGh?: ((key: string | undefined) => void) | undefined;
  /** The press on Install from GitHub: the host shows From GitHub. */
  toGitHub?: (() => void) | undefined;
  /** From GitHub's one box, drawn by the host: what it holds, its clearing by the library, and the library's size
   *  once read (the host's hint). */
  ghText?: string | undefined;
  onGhText?: ((text: string) => void) | undefined;
  onLibraryCount?: ((count: number) => void) | undefined;
}

export interface AppLauncherProps {
  cards?: LauncherCards | undefined;
  /** The computer the app runs on (a Board tile's computer). */
  target: Target;
  /** The launch has a place to show (a terminal, a display or a web port). Called at most once per launch, with the
   *  key of the launch this panel follows (Open with's Launch an app here takes that launch, never one at the place). */
  onPlaced: (p: Placement, key: string) => void;
  /** Launch an app here: the folder every Open from this panel runs in (absolute, from Files). */
  cwd?: string;
  /** The words of the host's own search field: Find searches them and draws no field of its own. */
  q?: string;
  /** The panel left Find (true: an app's Options or a launch is shown) or is back on it (false). Also called once on mount. */
  onDetail?: (open: boolean) => void;
}

/** The panel's actions with every Open made an `apphere` plan in `cwd` (none: unchanged). Restart and Open again of
 *  such a row run through the place pressing them, only on `target` (the computer the folder was chosen on). */
export function useHere(a: Apps, cwd: string | undefined, target: Target): Apps {
  const raw = useRef(a.latest.current);
  raw.current = a.latest.current;
  const latest = useRef(a.latest.current);
  if (!cwd) return a;
  const on: RecoverFor = { project: target.project.id, computer: target.container.id };
  const here = (item: Item, o: OpenOpts = {}): Item => {
    const pl = planFor({ p: 'apphere', item, o, cwd });
    // Its plan again for Restart and Open again: nothing to claim, so nothing to drop unsent.
    const recovery: Recovery = {
      prepare: async (at) => (recoverHere(at, on) ? { ok: true, go: () => at.launch(here(item, o), o), unsent: async () => 'none' as const } : { ok: false }),
    };
    // A folder the plan refuses: an unsealed marked item, which live.ts refuses unsent (the row says why).
    return (pl.ok ? toLaunch(pl.plan, { label: item.name, recovery })?.item : undefined) ?? { ...item, p: 'apphere' };
  };
  const open = (item: Item, o: OpenOpts = {}) => raw.current.open(here(item, o), o);
  const launch = (item: Item, o: OpenOpts = {}, reopen = false) => raw.current.launch(here(item, o), o, reopen);
  latest.current = { ...a.latest.current, open, launch };
  return { ...a, open, launch, latest };
}

export function AppLauncher({ target, onPlaced, cwd, q: hostQ, onDetail, cards }: AppLauncherProps) {
  const t = useStrings(strings);
  // The launch this panel follows: listed by this panel's Open, or the earlier one that held it.
  const [following, setFollowing] = useState<{ key: string; held: boolean } | null>(null);
  // The words typed in Find, kept across Options and Back to the list.
  const [q, setQ] = useState('');
  // Ready apps or coding agents, kept across a launch and Back to the list.
  const [view, setView] = useState<FindView>('find');
  // The tiles' "Choose options before opening": kept here, so it holds across an app's Options and back (the list,
  // and the part that drew the switch, are not shown meanwhile).
  const [optionsFirst, setOptionsFirst] = useState(false);
  const placed = useRef(new Set<string>());
  const a = useHere(useApps({
    target,
    nav: {
      selected: following?.key,
      select: () => undefined,
      onListed: (key) => setFollowing({ key, held: false }),
      onHeld: (key) => setFollowing({ key, held: true }),
    },
  }), cwd, target);
  const row = following ? a.rows.find((r) => r.key === following.key) : undefined;
  const run = row ? a.snap.runs.get(row.key) : undefined;
  const code = row ? a.snap.patches.get(row.key)?.accessCode : undefined;
  const p = row ? placementOf(row, run, isOpening(row.key)) : {};
  const detail = !!a.options || !!(following && row);
  useEffect(() => {
    onDetail?.(detail);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per change of what the panel shows
  }, [detail]);
  // The Board's own host check (parts/board.ts tileFits, shared with the Apps list's Put on Board).
  const fits = (to: Placement | undefined): boolean => !!to && tileFits(target, to);
  const place = (to: Placement, key: string) => {
    if (placed.current.has(key)) return;
    placed.current.add(key);
    onPlaced(to, key);
  };
  // This panel's own launch, answered, with a place and no code to copy first: placed at once. A launch that asks
  // for a code (even once the code is wiped) or one followed through an earlier held Open waits for Add.
  const auto = row && following && !following.held && fits(p.now) && !row.asksCode ? p.now : null;
  const autoKey = auto && row ? `${row.key}|${JSON.stringify(auto)}` : '';
  useEffect(() => {
    if (auto && row) place(auto, row.key);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per launch and place
  }, [autoKey]);

  if (!following || !row) {
    // Options inline: this panel sits in the Board's dialog, which opens no drawer.
    return (
      <div className={cards && !a.options ? l.bare : l.panel}>
        {a.options ? (
          <OptionsPanel item={a.options.item} onClose={() => a.setOptions(null)} onOpen={openWithOptions(a)} />
        ) : (
          <FindPane a={a} target={target} variant="list" initialQ={hostQ ?? q} onQuery={setQ} view={cards?.show === 'github' ? 'github' : view} onView={setView} cwd={cwd} search={hostQ === undefined} cards={cards} optionsFirst={optionsFirst} onOptionsFirst={setOptionsFirst} {...(cards?.onGh ? { gh: cards.gh, onGh: cards.onGh } : {})} />
        )}
        <AppsDialogs a={a} options="inline" />
      </div>
    );
  }

  const busy = a.snap.patches.get(row.key)?.busy;
  const back = (
    <Button variant="ghost" size="sm" onPress={() => setFollowing(null)}>
      {t('launcher.back')}
    </Button>
  );
  const check = (
    <Button size="sm" busy={busy === 'check'} onPress={() => void a.check(row)}>
      {t('act.check')}
    </Button>
  );
  const addTerminal = (label: 'launcher.addHeld' | 'launcher.addTerminal', primary = false) =>
    fits(p.terminal) ? (
      <Button size="sm" {...(primary ? { variant: 'primary' as const } : {})} onPress={() => place(p.terminal as Placement, row.key)}>
        {t(label)}
      </Button>
    ) : null;
  // A place the Board can't show: the launch's own address, in a new tab (none for a place that fits).
  const tabHref = (to: Placement | undefined) => (!to || fits(to) ? undefined : to.kind === 'display' ? row.urls.screen : row.urls.terminal);
  const openTab = (to: Placement | undefined, primary = false) => {
    const href = tabHref(to);
    return href ? (
      <LinkButton size="sm" {...(primary ? { variant: 'primary' as const } : {})} href={href} iconEnd="external">
        {t('launcher.openTab')}
      </LinkButton>
    ) : null;
  };
  // Why no tile was added, beside that link: a web app's waiting terminal is named as its terminal.
  const noTile = (to: Placement | undefined) =>
    to && !fits(to) ? (
      <p className={l.line} role="status" /* reason: a one-line note why no tile is added; the new-tab link is beside it */>
        {t(to.kind === 'terminal' && row.opensIn !== 'terminal' ? 'launcher.noTileTerminal' : 'launcher.noTile', { name: row.name })}
      </p>
    ) : null;

  let body;
  if (following.held && heldOpen(row)) {
    body = (
      <>
        <OutcomeBanner kind="pending" title={t('launcher.held', { name: row.name })} body={t('launcher.unknownBody')} onCheck={() => void a.check(row)} checking={busy === 'check'} />
        {noTile(p.terminal)}
        <div className={l.actions}>
          {back}
          {addTerminal('launcher.addHeld', true)}
          {openTab(p.terminal)}
        </div>
      </>
    );
  } else if (row.state === 'not_started' && row.code === 'source_warming') {
    // A source still getting ready: the same Open runs again by itself (live.ts), nothing to press.
    body = <Opening name={row.name} phase={row.phase} at={row.key} />;
  } else if (row.state === 'not_started') {
    const v = launchOf(row, a.rows);
    const agent = v.key === 'agents.notInstalled' ? agentById(row.agent) : undefined;
    body = (
      <>
        <OutcomeBanner kind="failed" title={t('launcher.failed', { name: row.name })} body={t(v.key as 'st.notStarted', { name: row.name })} />
        {agent ? <AgentGuide a={a} x={agent} /> : null}
        <div className={l.actions}>
          {back}
          <Button size="sm" variant="primary" onPress={() => a.act(row, 'retry')}>
            {t('act.retry')}
          </Button>
        </div>
      </>
    );
  } else if (p.now && !fits(p.now)) {
    body = (
      <>
        {code ? <SecretField label={t('insp.code')} value={code} description={t('launcher.codeNote')} onWipe={() => ops.unset(row.key, 'accessCode')} /> : null}
        {noTile(p.now)}
        <div className={l.actions}>
          {back}
          {row.state === 'unknown' ? check : null}
          {openTab(p.now, true)}
        </div>
      </>
    );
  } else if (p.now && (row.asksCode || following.held)) {
    body = (
      <>
        {code ? (
          <SecretField label={t('insp.code')} value={code} description={t('launcher.codeNote')} onWipe={() => ops.unset(row.key, 'accessCode')} />
        ) : row.asksCode ? (
          <p className={l.line} role="status" /* reason: a one-line note that the code was wiped; Add is beside it */>
            {t('launcher.codeGone')}
          </p>
        ) : null}
        <div className={l.actions}>
          {back}
          <Button size="sm" variant="primary" onPress={() => place(p.now as Placement, row.key)}>
            {t('launcher.addTile')}
          </Button>
        </div>
      </>
    );
  } else if (p.now) {
    // Placed by the effect above; the host closes the panel.
    body = <Opening name={row.name} phase={row.phase} at={row.key} />;
  } else if (row.state === 'unknown') {
    body = (
      <>
        <OutcomeBanner kind="pending" title={t('launcher.unknown', { name: row.name })} body={t('launcher.unknownBody')} onCheck={() => void a.check(row)} checking={busy === 'check'} />
        <div className={l.actions}>{back}</div>
      </>
    );
  } else if (!run || isOpening(row.key)) {
    body = <Opening name={row.name} phase={row.phase} at={row.key} />;
  } else if (row.state === 'stopped' || row.state === 'exited') {
    const v = launchOf(row, a.rows);
    body = (
      <>
        <p className={l.line} role="status" /* reason: a one-line hint that the launch ended; nothing to retry */>
          {t(v.key as 'st.done', { name: row.name })}
        </p>
        <div className={l.actions}>{back}</div>
      </>
    );
  } else {
    // Admitted, a web app whose page is not ready yet: its port comes with a read (the watch, or Check).
    body = (
      <>
        <p className={l.line} role="status" /* reason: a one-line hint while the page starts; Check is beside it */>
          {t('launcher.waitWeb', { name: row.name })}
        </p>
        {noTile(p.terminal)}
        <div className={l.actions}>
          {back}
          {check}
          {addTerminal('launcher.addTerminal')}
          {openTab(p.terminal)}
        </div>
      </>
    );
  }
  return (
    <div className={l.panel}>
      {body}
      <AppsDialogs a={a} options="inline" />
    </div>
  );
}

// The machine's step while the Open is out (core's phase), else the plain line.
const PHASES: Record<string, 'launcher.phase.resolve' | 'launcher.phase.create' | 'launcher.phase.execute'> = {
  resolve: 'launcher.phase.resolve',
  create: 'launcher.phase.create',
  execute: 'launcher.phase.execute',
};

export function Opening({ name, phase, at }: { name: string; phase?: string | undefined; at: string }) {
  const t = useStrings(strings);
  const key = phase ? PHASES[phase] : undefined;
  const line = key ? t(key, { name }) : t('launcher.opening', { name });
  // The time since this tab sent the Open (not spoken: it would speak every second).
  const since = useArrival(at);
  const now = useNow(since !== undefined);
  const e = since === undefined ? null : elapsedOf(now, since);
  // The line's words are the status, said once; the spinner is only the mark (a labelled Spinner before the same words
  // is said twice in the terminal, whose Spinner draws its label).
  return (
    <p className={l.line}>
      <Spinner /> <span role="status" /* reason: the line of an Open under way; its elapsed time beside it is not spoken */>{line}</span>
      {e ? <span className={l.elapsed} aria-hidden="true">{t(e.key, e.v)}</span> : null}
    </p>
  );
}
