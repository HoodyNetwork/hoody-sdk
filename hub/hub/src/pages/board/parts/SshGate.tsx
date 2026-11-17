// The SSH tile's gate: its frame opens only while terminal-N on the computer still is that ssh connection.
// A frame attaching to a number the computer no longer has starts a plain shell there, and the tile would still be
// named user@host: commands meant for the host would run on the computer.
//
// Contract, in plain words:
//   - On mount and on every reload (reloadKey) it reads the computer's sessions once (termSessions readSessions).
//     terminal-N set up for that ssh (host, user and port, each compared on its own) and running → the children (the
//     frame). The same but not running (its ssh exited) → Reconnect: a plain reattach of that session, while it is
//     still listed with no process, runs ssh to the same host again (hoody-terminal: such an attach starts
//     ssh again; one that finds a process attaches to it; checked live on the real terminal). The card is one read old when Reconnect is pressed (the session may be reaped, then a plain attach
//     starts a local shell, or gain a process), so it states that rule (a session still listed with nothing running
//     starts ssh again when it opens), never what this press will run, and Reconnect opens the frame on a press, with
//     a reminder to read the prompt before typing. Not listed → "has ended", with Connect again.
//     Something else on N → "no longer goes there", no action but the tile's own card actions. The read failing →
//     Try again. Nothing is framed until a read or a press says so.
//   - Connect again creates terminal-N with the tile's ssh fields only (as Connect over SSH does), once, then reads
//     back. Its outcome unknown: locked, Check again reads back and never resends. The lock is kept per computer,
//     session and destination (memory only, this load), so a reload of the tile or closing and reopening it keeps
//     it, and settling it updates every gate of that destination shown. A read back finding that ssh there (or
//     something else) settles it; finding nothing there keeps it unknown (the first create may still land), says
//     only that nothing is listed now, and gives Connect again back beside Check again: a second create is safe
//     because every create is exclusive on the same number (shellChange createSession: whichever lands second is
//     refused and changes nothing). A refusal or a send that never left shows why and gives the action
//     back. A create answered "already there" is read back too, and an earlier unknown outcome stays kept until that
//     read finds the ssh or something else there (nothing listed, or a read failing, keeps it unknown). Any read
//     finding either settles the kept outcome it began under, a reload's read included.
//     The tile going away while it is unknown moves it to the kit's sticky notice (usePendingToast).
//   - Not closed here (needs the terminal service): the read and the frame's attach are two steps. A session reaped
//     between them (after minutes idle with no viewer) would let the attach start a plain shell. The fix is an
//     attach that refuses a missing number.
import { outcomeOf } from '@core';
import { Button, Outcome, usePendingToast, type OutcomeLike } from '@kit';
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { BoardComputer } from '../computers';
import { sshLabel, type Ssh } from '../sshRules';
import { readSessions, sameSsh } from '../termSessions';
import { createSession, started } from './shellChange';
import { useT } from './text';
import { TileCard } from './TileCard';

export interface SshGateProps {
  computer: BoardComputer;
  session: number;
  ssh: Ssh;
  /** The tile's name as shown. */
  name: string;
  reloadKey: number;
  /** The tile's own card actions (Close…). */
  actions: ReactNode;
  children: ReactNode;
}

type Seen = 'reading' | 'ok' | 'stopped' | 'ended' | 'other' | 'failed';

// Unknown Connect again outcomes by computer, session and destination (never the reload count), observed by every
// gate shown for that destination; `retry` once a read found nothing listed.
interface Kept { readonly o: OutcomeLike; readonly retry: boolean }
const pendingConnects = new Map<string, Kept>();
const listeners = new Set<() => void>();
const keepPending = (id: string, o: Kept | undefined) => {
  if (o) pendingConnects.set(id, o); else pendingConnects.delete(id);
  for (const f of listeners) f();
};
const subscribe = (f: () => void) => { listeners.add(f); return () => { listeners.delete(f); }; };
/** Tests: forget every kept Connect again. */
export function resetSshGates(): void { keepPending('', undefined); pendingConnects.clear(); }

const codeOf = (e: unknown): string => {
  const c = e && typeof e === 'object' ? (e as { code?: unknown; status?: unknown }) : null;
  return typeof c?.code === 'string' ? c.code : typeof c?.status === 'number' ? String(c.status) : '';
};

export function SshGate({ computer, session, ssh, name, reloadKey, actions, children }: SshGateProps) {
  const t = useT();
  const id = computer.project_id + '\n' + computer.id + '\n' + session + '\n' + ssh.host + '\n' + ssh.user + '\n' + ssh.port;
  const key = id + '\n' + reloadKey;
  const [tries, setTries] = useState(0);
  const [seen, setSeen] = useState<{ key: string; v: Seen } | null>(null);
  const [busy, setBusy] = useState(false);
  // Reconnect pressed for this key: the frame opens on the stopped ssh session (a reload reads again).
  const [opened, setOpened] = useState<string | null>(null);
  const kept = useSyncExternalStore(subscribe, () => pendingConnects.get(id));
  const [local, setOutcome] = useState<OutcomeLike | undefined>(undefined);
  const outcome = kept?.o ?? local;
  const locked = outcome?.kind === 'pending' && !kept?.retry;
  const live = useRef(key);
  live.current = key;
  const to = sshLabel(ssh.user, ssh.host, ssh.port);
  const vars = { to, name, term: t('tile.name', { program: 'terminal', session }), computer: computer.name };

  // One read: what terminal-N is now, for this key.
  const look = async (k: string, signal?: AbortSignal): Promise<Seen | null> => {
    const at = id, held = pendingConnects.get(at);
    let v: Seen;
    try {
      const x = (await readSessions(computer, signal)).find((r) => r.n === session);
      v = !x ? 'ended' : x.offered && sameSsh(x.sshTo, ssh) ? (x.running ? 'ok' : 'stopped') : 'other';
    } catch { v = 'failed'; }
    // The ssh there or something else: an earlier create can no longer land (exclusive), so the kept unknown this
    // read began under settles, wherever the read came from. A newer kept outcome is left to its own read.
    if (held && (v === 'ok' || v === 'stopped' || v === 'other') && pendingConnects.get(at) === held) keepPending(at, undefined);
    if (signal?.aborted || live.current !== k) return null;
    setSeen({ key: k, v });
    return v;
  };
  useEffect(() => {
    const ac = new AbortController();
    setOutcome(undefined);
    void look(key, ac.signal);
    return () => ac.abort();
    // The key names computer, session, ssh and reload; the object changes with every list read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, tries]);

  const connect = async () => {
    if (busy || locked) return;
    const k = key, at = id;
    setBusy(true);
    setOutcome(undefined);
    let answer: unknown;
    try {
      answer = await createSession(computer, session, { ssh_host: ssh.host, ssh_user: ssh.user, ssh_port: ssh.port });
    } catch (e) {
      const kind = outcomeOf(e, true);
      const o: OutcomeLike = { kind, message: t(kind === 'pending' ? 'sshGate.unknown' : kind === 'failed' ? 'sshGate.refused' : 'sshGate.notSent', { to, code: codeOf(e) }) };
      if (kind === 'pending') keepPending(at, { o, retry: false });
      // Answered: no longer busy, even when a reload changed the key meanwhile.
      setBusy(false);
      if (live.current !== k) return;
      if (kind !== 'pending') setOutcome(o);
      return;
    }
    // Started by this create: an earlier unknown try can no longer land (every create is exclusive), so it settles.
    // "Already there": only the read below can settle it.
    const mine = started(answer);
    if (mine) keepPending(at, undefined);
    setBusy(false);
    if (live.current !== k) return;
    await look(k);
  };
  // Check again: a read back, never a resend. It settles the kept outcome whether the tile still shows it or not.
  // It speaks only for the kept outcome it began under: a newer Connect again's unknown is left to its own read.
  const check = async () => {
    const at = id, held = pendingConnects.get(at);
    const v = await look(key);
    if (v === null || v === 'failed') return false;
    const now = pendingConnects.get(at);
    // Nothing listed: still unknown, but Connect again may try the same number (see the contract).
    if (v === 'ended') { if (now === held) keepPending(at, { o: { kind: 'pending', message: t('sshGate.didNot', { to }) }, retry: true }); return false; }
    // The ssh there or something else: look settled the record it began under; a newer one stays.
    if (now !== undefined && now !== held) return false;
    keepPending(at, undefined);
    if (live.current.startsWith(at + '\n')) setOutcome(undefined);
    return true;
  };
  // The tile going away while the outcome is unknown moves it to the kit's sticky notice, with the same Check again.
  usePendingToast(outcome ?? null, check);

  const v = seen && seen.key === key ? seen.v : 'reading';
  if (v === 'ok' || (v === 'stopped' && opened === key)) return <>{children}</>;
  const card = (title: string, text: string, own: ReactNode) => (
    <TileCard
      icon="terminal"
      title={title}
      body={text || undefined}
      actions={<>{own}{actions}</>}
      note={outcome && <Outcome outcome={outcome} variant="block" {...(outcome.kind === 'pending' ? { onCheck: check } : {})} />}
    />
  );
  if (v === 'reading') return card(t('sshGate.checking', vars), '', null);
  if (v === 'failed') return card(t('sshGate.failedTitle', vars), t('sshGate.failedBody', vars), <Button variant="primary" onPress={() => setTries((n) => n + 1)}>{t('sshGate.retry')}</Button>);
  if (v === 'stopped') return card(t('sshGate.stoppedTitle', vars), t('sshGate.stoppedBody', vars), <Button variant="primary" onPress={() => setOpened(key)}>{t('sshGate.reconnect')}</Button>);
  if (v === 'other') return card(t('sshGate.otherTitle', vars), t('sshGate.otherBody', vars), null);
  return card(
    t('sshGate.endedTitle', vars),
    t('sshGate.endedBody', vars),
    <Button variant="primary" busy={busy} isDisabled={locked} onPress={() => { void connect(); }}>{t('sshGate.connect')}</Button>,
  );
}
