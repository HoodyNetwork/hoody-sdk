// The action menu of a computer: the same items in the table row, the detail header and the keyboard.
import type { MenuEntry, Translate } from '@kit';
import type strings from '../strings.en.json';
import { type Caps, allows, allowedOps, bucket, type Op } from '../logic';
import { canTakeNow } from '../snapshots/logic';
import type { Computer } from '../types';
import { programUrl } from '../urls';

export type ComputerAction =
  | Op
  | 'makeCurrent'
  | 'rename'
  | 'realms'
  | 'ssh'
  | 'copy'
  | 'snapshot'
  | 'copyTerminal'
  | 'copyAgent'
  | 'openTerminal'
  | 'delete'
  | 'logs';

type T = Translate<typeof strings>;

/** Why an action that needs a running computer is off: the next step for the computer's status. */
export function notRunningReason(status: string | undefined, tt: T): string {
  if (/^stopping$/i.test(String(status ?? ''))) return tt('menu.waitStopping');
  switch (bucket(status)) {
    case 'stopped': return tt('menu.startFirst');
    case 'starting': return tt('menu.waitStarting');
    case 'paused': return tt('menu.resumeFirst');
    case 'failed': return tt('menu.restartFirst');
    case 'gone': return tt('menu.deleting');
    default: return tt('menu.notRunning');
  }
}

/** Why a computer that is not running cannot be started from here (no Start or Resume is offered): it has expired,
 *  this sign-in may not start it, or its state needs another step first. */
export function noStartReason(c: Pick<Computer, 'status' | 'server_expired'>, tt: T): string {
  if (c.server_expired === true) return tt('run.noStartExpired');
  const b = bucket(c.status);
  return b === 'paused' || (b === 'stopped' && !/^stopping$/i.test(String(c.status ?? ''))) ? tt('run.stoppedNoStart') : notRunningReason(c.status, tt);
}

/** Menu entries for a computer; items the session may not do are left out. */
export function computerMenu(
  c: Computer,
  caps: Caps,
  current: boolean,
  tt: T,
  onAction: (c: Computer, a: ComputerAction) => void,
  opts: { terminal: boolean; logs: boolean } = { terminal: true, logs: true },
): MenuEntry[] {
  const item = (id: ComputerAction, label: string, extra: { icon?: 'play' | 'stop' | 'reload' | 'pen' | 'realm' | 'key' | 'copy' | 'trash' | 'terminal' | 'check' | 'logs' | 'clock'; tone?: 'danger'; description?: string } = {}): MenuEntry => ({
    id,
    label,
    onAction: () => onAction(c, id),
    ...extra,
  });
  const lifecycle: MenuEntry[] = allowedOps(c, caps).map((op) =>
    item(op, tt(`menu.${op}`), { icon: op === 'stop' ? 'stop' : op === 'restart' ? 'reload' : 'play' }),
  );
  const out: MenuEntry[] = [];
  // The line under the label says what it does, in short (the head button's tooltip has the whole sentence).
  if (!current) out.push(item('makeCurrent', tt('menu.makeCurrent'), { icon: 'check', description: tt('menu.makeCurrent.note') }));
  if (opts.terminal) out.push(item('openTerminal', tt('menu.openTerminal'), { icon: 'terminal' }));
  out.push(...lifecycle);
  // See logs only where this load serves Logs (opts.logs: useOut().has.logs); else the entry would do nothing.
  if (opts.logs && c.status && /fail|error/i.test(c.status)) out.push(item('logs', tt('menu.logs'), { icon: 'logs' }));
  out.push('-');
  if (allows(caps, 'rename')) out.push(item('rename', tt('menu.rename'), { icon: 'pen' }));
  if (allows(caps, 'realms')) out.push(item('realms', tt('menu.realms'), { icon: 'realm' }));
  if (allows(caps, 'sshKey')) out.push(item('ssh', tt('menu.ssh'), { icon: 'key' }));
  if (allows(caps, 'copy')) out.push(item('copy', tt('menu.copy'), { icon: 'copy' }));
  // Left out for a key without the snapshot rights (taking one also needs the update right); off with its reason for a
  // computer neither running nor stopped.
  if (allows(caps, 'snapshot') && allows(caps, 'rename')) {
    const e = item('snapshot', tt('menu.snapshot'), { icon: 'clock' }) as Exclude<MenuEntry, '-'>;
    out.push(canTakeNow(c.status) ? e : { ...e, isDisabled: true, disabledReason: tt('menu.snapshotState') });
  }
  out.push('-');
  const link = (kind: 'terminal' | 'agent'): MenuEntry => {
    const e = (item(kind === 'terminal' ? 'copyTerminal' : 'copyAgent', tt(kind === 'terminal' ? 'menu.copyTerminal' : 'menu.copyAgent'), { icon: 'copy' })) as Exclude<MenuEntry, '-'>;
    const u = programUrl(c, kind);
    return u ? { ...e, copy: u } : { ...e, isDisabled: true, disabledReason: tt(kind === 'terminal' ? 'menu.noTerminal' : 'menu.noAgent') };
  };
  out.push(link('terminal'), link('agent'));
  if (allows(caps, 'delete')) {
    out.push('-');
    out.push(item('delete', tt('menu.delete'), { icon: 'trash', tone: 'danger' }));
  }
  return out;
}
