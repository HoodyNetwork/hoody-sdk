// firstPick.ts: a new computer in a realm that had none becomes the current computer once its create is proved
// Otherwise the person is told it is ready, with Make current.
//
// Contract, in plain words:
//   - markPress(project, name) at the press of Get a computer captures, for that create (its account, project and
//     name): the account and realm shown, core's computerChoiceRev, whether the person had chosen All computers
//     (noComputerChosen), and whether the realm was known empty. Known empty: the cached top bar list (computersPage)
//     is a whole answer, no read of it has failed since, and it holds no computer of the realm.
//   - afterProof(made, t) once the create is proved (a done answer, or Check again that proved it): one fresh read of
//     computersPage, and the new row found there by (name, project) in the realm, never in the shell's rendered list.
//     It selects that row (chooseComputer with auto: not the person's choice) only when every condition holds: the
//     row is listed; the account and realm are the press's; computerChoiceRev is unchanged (no pick by the person
//     since, even one ending where it started); the person had not chosen All computers; the realm was known empty;
//     the shown computer is none or already that row (the shell may have picked it first). Then the toast says it is
//     now the current computer. Otherwise, with the row listed, the toast says it is ready and offers Make current
//     (a person's choice); when it already is the current computer, the toast says so. A row not listed (or a read
//     that fails) shows nothing: an unknown create selects nothing. A proof with no press mark selects nothing.
//   - A mark is used once (taken by afterProof) and is kept only in memory, per account, project and name.
import { capture, chooseComputer, computerChoiceRev, computersPage, computersPageOf, noComputerChosen, pickComputer, queryClient, type ComputerRow } from '@core';
import { showToast } from '@kit';

export interface PressMark {
  readonly account: string | null;
  readonly realm: string;
  readonly rev: number;
  /** The person had chosen All computers (remembered as no computer). */
  readonly none: boolean;
  /** The realm was known to hold no computer at the press. */
  readonly empty: boolean;
}

export interface Made { readonly project: string; readonly name: string }

type T = (k: 'said.current' | 'first.ready' | 'menu.makeCurrent', v?: Record<string, string>) => string;

const marks = new Map<string, PressMark>();
const keyOf = (account: string | null, m: Made) => `${account ?? ''}\u0000${m.project}\u0000${m.name}`;

/** Whether the realm shown is known to hold no computer (see the contract). */
export function knownEmpty(): boolean {
  const c = capture();
  const st = queryClient.getQueryState(computersPage.key(undefined));
  if (!st || st.status !== 'success' || st.data === undefined) return false;
  try {
    const p = computersPageOf(st.data);
    return p.complete && !p.rows.some((r) => inRealm(r, c.realm));
  } catch {
    return false;
  }
}

function inRealm(r: unknown, realm: string): boolean {
  const row = r as ComputerRow;
  if (!row || typeof row.id !== 'string' || !row.id) return false;
  return pickComputer([row], { realm, remembered: row.id }) === row;
}

/** Captures the press of this create (see the contract). */
export function markPress(made: Made): PressMark {
  const c = capture();
  const m: PressMark = { account: c.account, realm: c.realm, rev: computerChoiceRev(), none: noComputerChosen(), empty: knownEmpty() };
  marks.set(keyOf(c.account, made), m);
  return m;
}

/** What afterProof did: chose the row, offered it (ready), or nothing (no listed row). */
export type ProofResult = 'chosen' | 'current' | 'ready' | 'none';

/** The create is proved: select the new computer or say it is ready (see the contract). */
export async function afterProof(made: Made, t: T): Promise<ProofResult> {
  const at = capture();
  const key = keyOf(at.account, made);
  const mark = marks.get(key);
  marks.delete(key);
  const fresh = await computersPage.readFresh(undefined);
  const now = capture();
  if (!fresh || now.account !== at.account) return 'none';
  // Only usable rows are judged (the list keeps whatever the answer held; a malformed entry is skipped, as the shell does).
  const usable = (r: unknown): r is ComputerRow & { name: string } =>
    !!r && typeof r === 'object' && typeof (r as { id?: unknown }).id === 'string' && typeof (r as { name?: unknown }).name === 'string';
  const row = (fresh.data.rows as readonly unknown[]).find((r) => usable(r) && r.name === made.name && r.project_id === made.project && inRealm(r, now.realm)) as (ComputerRow & { name: string }) | undefined;
  if (!row) return 'none';
  const shown = now.target?.container.id;
  const name = row.name;
  const ok = !!mark && mark.account === now.account && mark.realm === now.realm && mark.rev === computerChoiceRev() && !mark.none && mark.empty && (!shown || shown === row.id);
  if (ok || shown === row.id) {
    if (ok) chooseComputer(row, { auto: true });
    showToast({ title: t('said.current', { name }), tone: 'ok' });
    return ok ? 'chosen' : 'current';
  }
  // Make current is the person's choice, but only in the account and realm the toast was shown for: pressed after a
  // switch it does nothing (the row belongs to the earlier context).
  const shownFor = { account: now.account, realm: now.realm };
  showToast({ title: t('first.ready', { name }), tone: 'ok', action: { label: t('menu.makeCurrent'), onAction: () => {
    const c = capture();
    if (c.account === shownFor.account && c.realm === shownFor.realm) chooseComputer(row);
  } } });
  return 'ready';
}

/** Marks dropped (tests). */
export function resetFirstPick(): void { marks.clear(); }
