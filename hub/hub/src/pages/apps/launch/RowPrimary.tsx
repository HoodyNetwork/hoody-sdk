// An opened app's main action, shared by the Apps list and the launcher's "Opened recently" section: a place to go
// (the app, its terminal, its screen or its address) is a real link; every other action runs through useApps' act, so a
// Files-marked row replans or goes to Files, a held or unknown row offers only Check, and Stop and Remove keep their
// confirms. The launcher adds no action path of its own.
import { Button, LinkButton, RowNote, useButtonLabelsWidth, useStrings } from '@kit';
import { type ReactElement, useMemo } from 'react';
import type { Action, LaunchView, OpenApp } from '../logic';
import { ACTION_KEY, launchOf, shortState } from '../parts/words';
import strings from '../strings.en.json';
import type { Apps } from './useApps';

export const LINK_ACTIONS: ReadonlySet<Action> = new Set(['open', 'terminal', 'screen', 'address']);
export const hrefFor = (r: OpenApp, a: Action): string | undefined => (a === 'open' ? r.urls[r.opensIn] : a === 'terminal' ? r.urls.terminal : a === 'screen' ? r.urls.screen : a === 'address' ? r.urls.web : undefined);

/** The look of every RowPrimary control, shared with the probe that measures them (useRowPrimaryWidth). */
const LOOK = { size: 'sm', variant: 'row' } as const;
/** A table cell's own side padding (kit DataTableLayout CELL_PAD, --sp-3 each side): the cell around the control. */
const CELL_PAD = 24;
const ACTS = Object.keys(ACTION_KEY) as Action[];

/**
 * The width a column of RowPrimary actions needs: the widest control any row can draw, in this
 * language, measured from kit Buttons drawn as RowPrimary draws them (kit useButtonLabelsWidth), plus the cell's padding.
 * The links (open, terminal, screen, address) are LinkButtons with their external icon; every other action is a Button,
 * measured idle and busy (the spinner takes the start icon's place). So the case, the tracking, a fallback face for a
 * script Geist Mono lacks and a font that loads late are the controls' own, not a canvas guess. Null until measured (the
 * fonts ready): the caller keeps its floor meanwhile. Render `probe` once beside the list that holds the controls.
 */
export function useRowPrimaryWidth(t: Apps['t']): { width: number | null; probe: ReactElement } {
  const links = useMemo(() => ACTS.filter((x) => LINK_ACTIONS.has(x)).map((x) => ({ label: t(ACTION_KEY[x] as 'act.open'), iconEnd: 'external' as const })), [t]);
  // 'wait' draws nothing (RowPrimary returns null); its key is Try again's, measured as 'retry'.
  const buttons = useMemo(() => ACTS.filter((x) => !LINK_ACTIONS.has(x) && x !== 'wait').flatMap((x) => [{ label: t(ACTION_KEY[x] as 'act.open') }, { label: t(ACTION_KEY[x] as 'act.open'), busy: true }]), [t]);
  const l = useButtonLabelsWidth(links, { ...LOOK, link: true });
  const b = useButtonLabelsWidth(buttons, LOOK);
  const width = l.width === null || b.width === null ? null : Math.max(l.width, b.width) + CELL_PAD;
  return {
    width,
    probe: (
      <>
        {l.probe}
        {b.probe}
      </>
    ),
  };
}

/** Actions a row never puts in its cell in place of a primary it can't draw: they end or remove the app. */
const NOT_IN_PLACE: ReadonlySet<Action> = new Set(['stop', 'stopAgain', 'remove']);

/** The action a row's cell draws: its primary, or, when that is a place with no address yet (an app that stopped with an
 *  error, whose terminal has no address), the first of its other actions that can be drawn and doesn't end the app. */
export function cellActionOf(r: OpenApp, v: Pick<LaunchView, 'primary' | 'more'>): Action | null {
  const drawable = (x: Action | null): x is Action => !!x && x !== 'wait' && (!LINK_ACTIONS.has(x) || !!hrefFor(r, x));
  if (!v.primary || v.primary === 'wait') return null;
  if (drawable(v.primary)) return v.primary;
  return v.more.find((x) => drawable(x) && !NOT_IN_PLACE.has(x)) ?? null;
}

/** The control carries data-row-primary: the row's own action, found by tests in any presentation (table cell or list line).
 *  A row with nothing to press while it is busy (starting, stopping, checking, a source warming) says so in the kit's
 *  row note instead of leaving the cell blank. */
export function RowPrimary({ a, r }: { a: Apps; r: OpenApp }) {
  const { t, rows, snap } = a;
  const tr = useStrings(strings);
  const v = launchOf(r, rows);
  const act = cellActionOf(r, v);
  if (!act) return v.tone === 'busy' ? <RowNote>{tr('row.busy', { state: shortState(tr, v.key) })}</RowNote> : null;
  if (LINK_ACTIONS.has(act)) {
    const href = hrefFor(r, act);
    return href ? (
      <LinkButton {...LOOK} href={href} iconEnd="external" data-row-primary="">
        {t(ACTION_KEY[act] as 'act.open')}
      </LinkButton>
    ) : null;
  }
  const busy = snap.patches.get(r.key)?.busy;
  return (
    <Button {...LOOK} busy={busy !== undefined} onPress={() => a.latest.current.act(r, act)} data-row-primary="">
      {t(ACTION_KEY[act] as 'act.open')}
    </Button>
  );
}
