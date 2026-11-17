// TurnMenu: the ONE menu on a finished reply (the "⋯" in its footer), built on the kit ActionMenu. Hosts hand it item PROVIDERS, so a feature
// adds its item without rewriting another's (Fork here; Trim, "Remove what follows", joins the same list):
//   - a provider is a hook `(turn) => { items, aside? }`: `items` are ActionMenu actions (disabled reasons through useWhy), `aside` is anything
//     that must outlive the closing popover (a ConfirmDialog an item opened, a pending state), mounted beside the menu, not in it;
//   - `turnMenuOf(...providers)` is the `turnMenu` prop of SessionView / the Ask column; the providers are fixed for the menu's life (hooks);
//   - the menu tells the reply footer while it is open (useFooterMenuOpen), so the footer stays up while the pointer is in the popover.
// Fork: `forkItems(host)`. It navigates ONLY on an `opened` outcome (the create is settled); a refusal says why. An outcome that leaves a fork pending is a
// toast with Check again, and the reply's item becomes Check the fork until it is settled; tone and actions come from the outcome's `reason`, never its words.
// A press never makes a second create over a pending record.
import { Fragment, useEffect, useState, type ReactNode } from 'react';
import type { FaqItem } from '../layouts/Faq';
import { ActionMenu, type MenuAction } from '../overlays/Menu';
import { showToast } from '../states/Toast';
import { useStrings } from '../strings';
import { forkChanged, useForkChanges } from './forkList';
import { forkNow } from './forkNow';
import { useFooterMenuOpen } from './Reply';
import type { TurnMenu } from './SessionView';
import type { ActiveSource, ForkOutcome } from './source';
import strings from './ForkMenu.strings.en.json';
import { useWhy } from './why';

/** The reply a menu is for: its block key and the 0-based index of the completed turn it closes. */
export interface TurnTarget { key: string; turn: number }
/** What one provider adds for one reply. */
export interface TurnItems { items: readonly MenuAction[]; aside?: ReactNode }
export type TurnItemsHook = (t: TurnTarget) => TurnItems;

function TurnMenuButton({ target, providers }: { target: TurnTarget; providers: readonly TurnItemsHook[] }) {
  const t = useStrings(strings);
  const footerOpen = useFooterMenuOpen();
  const [open, setOpen] = useState(false);
  const sets = providers.map((p) => p(target));
  const items = sets.flatMap((x) => x.items);
  // The footer must not stay up for a menu that is gone.
  useEffect(() => () => footerOpen(false), [footerOpen]);
  return (
    <>
      {items.length > 0 && (
        <ActionMenu
          items={items}
          label={t('tm.more')}
          size="sm"
          // Frameless dots, as Copy beside it: a framed plate under every reply read as debris.
          plain
          isOpen={open}
          onOpenChange={(o) => { setOpen(o); footerOpen(o); }}
        />
      )}
      {sets.map((x, i) => (x.aside ? <Fragment key={i}>{x.aside}</Fragment> : null))}
    </>
  );
}

/** The `turnMenu` prop for a host: one menu per reply, with each provider's items in the order given. */
export function turnMenuOf(...providers: readonly TurnItemsHook[]): TurnMenu {
  return (t) => <TurnMenuButton key={t.key} target={t} providers={providers} />;
}

/** What Fork needs of its host. */
export interface ForkHost {
  /** The chat's source: its table decides whether Fork is offered, and it forks, checks and reads back. Null while there is nothing to fork. */
  source(): Pick<ActiveSource, 'can' | 'fork' | 'checkFork' | 'forks'> | null;
  /** Opens the new chat. Called ONLY for an `opened` outcome. False: this view has nowhere to open it. */
  open(sid: string): boolean;
  /** Shows the list of unconfirmed forks (the `full` outcome's action). Absent: the toast has no such action. */
  showForks?(): void;
  /** The question that explains unconfirmed forks (the AI tab's forkUnconfirmed): carried by the toasts of a fork that is gone or can't be confirmed. */
  faq?: FaqItem;
}

/** What a fork action is for: one finished reply (`turn`, the 0-based turn it closes) or the whole chat (`whole`). */
type ForkScope = { readonly whole: false; readonly turn: number } | { readonly whole: true };

/** The ONE fork action behind both items: the Fork / Check the fork item, its press, its Check and the toast of what either came to. The reply's
 *  item and the whole chat's differ only in the target (`fork({ turn })` / `fork()`), the pending row they match (a reply's turn / no turn) and
 *  their words; tone and actions come from the outcome's `reason` for both. Every toast has its own literal call site per wording, so the toast guard
 *  (Toast.calls.test.ts) reads each one. */
function useForkAction(host: ForkHost, scope: ForkScope): TurnItems {
  const t = useStrings(strings);
  const why = useWhy();
  const [busy, setBusy] = useState(false);
  // An open menu reads the pending forks again when one is made, checked or hidden elsewhere (another reply, the band, another tab).
  useForkChanges();
  const src = host.source();
  if (!src || !src.fork) return { items: [] };
  const fork = src.fork.bind(src);
  const can = src.can('fork');
  const whole = scope.whole;
  const n = scope.whole ? '' : String(scope.turn + 1);
  const pendingRow = src.checkFork
    ? (src.forks?.() ?? []).find((x) => x.parent !== null && (scope.whole ? x.turn === null : x.turn === scope.turn))
    : undefined;
  const run = (go: () => Promise<ForkOutcome>) => {
    setBusy(true);
    void go().then(settle, () => undefined).finally(() => { setBusy(false); forkChanged(); });
  };
  const press = () => run(() => (scope.whole ? fork() : fork({ turn: scope.turn })));
  const check = (k1: string) => run(() => src.checkFork!(k1));
  /** Shows what a fork or a Check came to: tone and actions come from the reason alone. */
  function settle(raw: ForkOutcome): void {
    const o = forkNow(raw);
    if (o.k === 'opened') {
      if (!host.open(o.sid)) {
        if (whole) showToast({ title: t('tm.wholeMade'), tone: 'ok' });
        else showToast({ title: t('tm.forkMade', { n }), tone: 'ok' });
      }
      return;
    }
    if (o.k === 'unknown') {
      const k1 = o.k1;
      const again = { label: t('tm.checkAgain'), onAction: () => { check(k1); return true; } };
      if (whole) showToast({ id: 'fork:whole', title: t('tm.wholeUnknown'), body: o.words, tone: 'unknown', action: again });
      else showToast({ id: `fork:${n}`, title: t('tm.forkUnknown', { n }), body: o.words, tone: 'unknown', action: again });
      return;
    }
    if (o.reason === 'none') {
      if (whole) showToast({ title: t('tm.wholeNone'), body: o.words, tone: 'info', action: { label: t('tm.wholeFork'), onAction: () => { press(); return true; } } });
      else showToast({ title: t('tm.forkNone', { n }), body: o.words, tone: 'info', action: { label: t('tm.fork'), onAction: () => { press(); return true; } } });
    } else if (o.reason === 'busy' || o.reason === 'untracked') {
      if (whole) showToast({ title: t('tm.wholeRefused'), body: o.words, tone: 'info' });
      else showToast({ title: t('tm.forkRefused', { n }), body: o.words, tone: 'info' });
    } else if (o.reason === 'gone' || o.reason === 'unconfirmed') {
      const faq = host.faq ? { item: host.faq, label: t('tm.faq') } : undefined;
      if (whole) showToast({ title: t('tm.wholeRefused'), body: o.words, tone: 'warn', faq });
      else showToast({ title: t('tm.forkRefused', { n }), body: o.words, tone: 'warn', faq });
    } else if (o.reason === 'full' && host.showForks) {
      const show = host.showForks;
      const showAction = { label: t('tm.showForks'), onAction: () => { show(); return true; } };
      if (whole) showToast({ title: t('tm.wholeRefused'), body: o.words, tone: 'error', action: showAction });
      else showToast({ title: t('tm.forkRefused', { n }), body: o.words, tone: 'error', action: showAction });
    } else {
      const retry = { label: t('tm.retry'), onAction: () => { press(); return true; } };
      if (whole) showToast({ title: t('tm.wholeRefused'), body: o.words, tone: 'error', action: retry });
      else showToast({ title: t('tm.forkRefused', { n }), body: o.words, tone: 'error', action: retry });
    }
  }
  const checking = !!pendingRow && !pendingRow.mine;
  const forking = busy || !!pendingRow?.mine;
  const item: MenuAction = checking
    ? {
      id: whole ? 'fork-whole-check' : 'fork-check',
      label: t('tm.check'),
      description: whole ? t('tm.wholeCheckDesc') : t('tm.checkDesc'),
      icon: 'share',
      isDisabled: busy,
      ...(busy ? { disabledReason: t('tm.checking') } : {}),
      onAction: () => check(pendingRow!.k1),
    }
    : {
      id: whole ? 'fork-whole' : 'fork',
      label: whole ? t('tm.wholeFork') : t('tm.fork'),
      description: whole ? t('tm.wholeForkDesc') : t('tm.forkDesc'),
      icon: 'share',
      isDisabled: !can.ok || forking,
      ...(!can.ok ? { disabledReason: why(can) } : forking ? { disabledReason: t('tm.forking') } : {}),
      onAction: press,
    };
  return { items: [item] };
}

/** Fork from here: the item for a finished reply. For a reply whose target already has an unconfirmed fork, the item is Check the fork. */
export function forkItems(host: ForkHost): TurnItemsHook {
  return function useForkItems(target) { return useForkAction(host, { whole: false, turn: target.turn }); };
}

/** Fork this chat: the item for the WHOLE chat (a chat-level menu, not a reply's). It forks with no turn (`fork()`), says so in whole-chat words, and
 *  settles exactly as the reply's item does; a chat whose whole-chat fork is unconfirmed offers Check the fork instead. A pending fork of a REPLY is
 *  a different target and does not turn this item into a Check. */
export function forkWholeItems(host: ForkHost): () => TurnItems {
  return function useForkWholeItems() { return useForkAction(host, { whole: true }); };
}
