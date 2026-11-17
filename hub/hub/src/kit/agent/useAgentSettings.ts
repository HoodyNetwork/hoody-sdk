// The data behind AgentSettings: the computer's catalogue, Claude Code's set there, and (with a conversation) its
// settings. A change is sent once and decided by reading the conversation back (core agent sendField + the read).
//
// One thing at a time, one generation:
//   - the hook runs one operation at a time: the reads (catalogue, Claude Code, conversation), or one change with its
//     read-back, or one Check again. While any runs, `busy` is true and every control is disabled, so nothing
//     overlaps. The reads also report themselves one by one (`catalogueReading`, `claudeReading`), and `busyNoCat` is
//     `busy` without a catalogue read that is the only thing still running: a control that does not depend on the
//     Hoody catalogue (a Claude Code chat's model) is not held by a slow catalogue. `retryClaude` reads Claude Code's
//     set alone, under a generation of its own (an older answer of that read never replaces a newer one);
//   - every request captures the hook's generation, and an answer from another generation is dropped. Each new
//     operation, and a new computer or conversation, starts a new generation;
//   - an answer that core reports stale (its context ended while the hook stays) ends the operation: an unconfirmed
//     change becomes "may have gone through" with Check again, never done or failed (C9), and the reads run once more.
import { useEffect, useMemo, useRef, useState } from 'react';
import { agent, providers, type Target } from '@core';

export type FieldState = { kind: 'running' | 'done' | 'pending' | 'failed' | 'not_sent'; code?: string; change: agent.FieldValue } | null;

export interface AgentData {
  /** loading: the reads are out; failed: the catalogue read failed (rows show what is known). */
  phase: 'none' | 'loading' | 'done' | 'failed';
  cat: providers.Catalogue | null;
  catError: unknown;
  claude: agent.ClaudeSet | null;
  settings: agent.SessionSettings | null;
  /** The conversation read failed (settings stay null). */
  settingsError: unknown;
  fields: Record<agent.Field, FieldState>;
  /** An operation is running: every control waits. */
  busy: boolean;
  /** `busy`, except while the catalogue read is the only thing still running (see the header). */
  busyNoCat: boolean;
  /** The catalogue read is out. */
  catalogueReading: boolean;
  /** Claude Code's set is being read (the reads' or `retryClaude`'s). */
  claudeReading: boolean;
  /** An operation is running, from the moment it starts (`busy` lags a render). */
  active(): boolean;
  retry(): void;
  /** Read Claude Code's set again, alone: no other read, no change. Does nothing while that read is out. */
  retryClaude(): void;
  save(change: agent.FieldValue): void;
  check(field: agent.Field): Promise<boolean>;
}

const NO_FIELDS: Record<agent.Field, FieldState> = { effort: null, verbosity: null, yolo: null };
type State = Omit<AgentData, 'active' | 'retry' | 'retryClaude' | 'save' | 'check'>;
const EMPTY: State = {
  phase: 'none', cat: null, catError: null, claude: null, settings: null, settingsError: null, fields: NO_FIELDS,
  busy: false, busyNoCat: false, catalogueReading: false, claudeReading: false,
};

/** `session`: the conversation, or null for a draft. */
export function useAgentSettings(target: Target | null, session: string | null, claudeCode: boolean): AgentData {
  const where = target ? `${target.project.id}|${target.container.id}|${target.container.server_name ?? ''}` : '';
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `where` is the target's identity
  const apis = useMemo(() => (target ? { p: providers.providersApi(target), a: agent.agentApi(target) } : null), [where]);
  const gen = useRef(0);
  const live = useRef(true);
  const running = useRef(false);
  // Claude Code's set is read by the reads and by retryClaude: the newest request of the two decides, and one at a time.
  const claudeGen = useRef(0);
  const claudeOut = useRef(false);
  const [st, setSt] = useState<State>(EMPTY);

  /** `catOnly`: this operation is the reads and none of them but the catalogue's will be running. */
  const start = (nonCat = true): number => {
    running.current = true;
    setSt((x) => ({ ...x, busy: true, busyNoCat: nonCat }));
    return ++gen.current;
  };
  const current = (g: number) => live.current && g === gen.current;
  const end = (g: number) => {
    if (!current(g)) return;
    running.current = false;
    setSt((x) => ({ ...x, busy: false, busyNoCat: false, catalogueReading: false }));
  };

  /** Claude Code's set, newest request wins; `g`: the operation that asked (null: retryClaude alone). */
  const readClaudeSet = (g: number | null): Promise<unknown> => {
    const cg = ++claudeGen.current;
    claudeOut.current = true;
    setSt((x) => ({ ...x, claudeReading: true }));
    return agent.readClaude(apis!.a).then((r) => {
      if (!live.current || cg !== claudeGen.current) return;
      claudeOut.current = false;
      setSt((x) => ({ ...x, claudeReading: false, ...(!r.stale && (g === null || g === gen.current) ? { claude: r.set } : {}) }));
    }, () => {
      if (!live.current || cg !== claudeGen.current) return;
      claudeOut.current = false;
      setSt((x) => ({ ...x, claudeReading: false }));
    });
  };

  const settingsFrom = (r: Awaited<ReturnType<typeof agent.readSettings>>) =>
    (x: State): State => (r.settings ? { ...x, settings: r.settings, settingsError: null } : { ...x, settingsError: r.err && !r.err.ok ? r.err.err : true });

  /** The reads, as one operation. `force`: run even while another operation is marked running (its recovery). */
  const read = (force = false) => {
    if (!apis || (running.current && !force)) return;
    const g = start(claudeCode || !!session);
    setSt((x) => ({ ...x, phase: 'loading', catalogueReading: true }));
    const catalogue = apis.p.catalogue().then((r) => {
      if (current(g)) setSt((x) => ({ ...x, phase: r.ok ? 'done' : 'failed', cat: r.ok ? r.body : null, catError: r.ok ? null : r.err, catalogueReading: false }));
    });
    const others: Promise<unknown>[] = [];
    if (claudeCode) others.push(readClaudeSet(g));
    if (session) {
      others.push(agent.readSettings(apis.a, session).then((r) => {
        if (current(g) && !r.stale) setSt(settingsFrom(r));
      }));
    }
    // Without the catalogue the operation is no longer holding what does not depend on it.
    void Promise.all(others).then(() => { if (current(g)) setSt((x) => ({ ...x, busyNoCat: false })); }, () => { if (current(g)) setSt((x) => ({ ...x, busyNoCat: false })); });
    void Promise.all([catalogue, ...others]).then(() => end(g), () => end(g));
  };

  const retryClaude = () => {
    if (!apis || !claudeCode || claudeOut.current) return;
    void readClaudeSet(null);
  };

  // A new computer or conversation starts over: nothing of the old one is kept.
  useEffect(() => {
    live.current = true;
    gen.current += 1;
    claudeGen.current += 1;
    claudeOut.current = false;
    running.current = false;
    setSt({ ...EMPTY, phase: apis ? 'loading' : 'none' });
    read();
    return () => {
      live.current = false;
      gen.current += 1;
      claudeGen.current += 1;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- read is this render's; the Api and conversation decide
  }, [apis, session, claudeCode]);

  const setField = (field: agent.Field, fs: FieldState) => setSt((x) => ({ ...x, fields: { ...x.fields, [field]: fs } }));

  /** Core said stale while the hook stays: the change may have gone through. End this operation, read once more. */
  const lost = (g: number, change: agent.FieldValue) => {
    if (!current(g)) return;
    setField(change.field, { kind: 'pending', change });
    gen.current += 1;
    running.current = false;
    read(true);
  };

  /** Read the conversation back for `change` and decide it. Resolves true only when the read showed it. */
  const readBack = async (g: number, change: agent.FieldValue): Promise<boolean> => {
    if (!apis || !session) return false;
    const r = await agent.readSettings(apis.a, session);
    if (!current(g)) return false;
    if (r.stale) {
      lost(g, change);
      return false;
    }
    const saved = r.settings !== null && r.settings[change.field] === change.value;
    setSt((x) => ({ ...settingsFrom(r)(x), fields: { ...x.fields, [change.field]: { kind: saved ? 'done' : 'pending', change } } }));
    end(g);
    return saved;
  };

  const save = (change: agent.FieldValue) => {
    if (!apis || !session || running.current) return;
    const g = start();
    setField(change.field, { kind: 'running', change });
    void agent.sendField(apis.a, session, change).then((r) => {
      if (!current(g)) return;
      if (r.state === 'stale') return lost(g, change);
      if (r.state === 'failed') {
        setField(change.field, { kind: r.err.kind === 'not_sent' ? 'not_sent' : 'failed', code: r.err.code, change });
        end(g);
        return;
      }
      void readBack(g, change);
    });
  };

  // Check again: one read, nothing sent. True only when the read proved the change.
  const check = async (field: agent.Field): Promise<boolean> => {
    const f = st.fields[field];
    if (!apis || !session || !f || f.kind !== 'pending' || running.current) return false;
    const g = start();
    return readBack(g, f.change);
  };

  return { ...st, active: () => running.current, retry: () => read(), retryClaude, save, check };
}
