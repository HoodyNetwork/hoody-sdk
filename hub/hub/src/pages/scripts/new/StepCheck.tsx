// Step 4, "Check it". What goes live is the snapshot: the code plus the
// Hub-owned header lines, built before the check. The check validates those exact bytes on the bound computer and
// folder, and its verdict is held with {hash, compId, exec}: any change to them drops it at once, and only a verdict
// that holds for the current snapshot unlocks Continue. A check with no answer is "could not be checked", never ready.
// Ideas are rendered by the agent from their fields, so the Hub has no bytes to check: Check says so.
import { AnatomySection, Band, Button, CodeEditor, ComputerLink, Disclosure, Facts, InlineActions, ItemList, ProblemList, SubSection, TextButton, Verdict, VerdictMark, useStrings, type CodeEditorHandle, type Fact } from '@kit';
import { useEffect, useId, useRef, useState } from 'react';
import { useBoundSends, type Binding } from '../data';
import { changesOf, header, usesOf, verdictOf, type ErrorLine } from '../logic';
import strings from '../strings.en.json';
import { ScriptAddress } from '../parts/ScriptAddress';
import { verdictFor, verdictHolds, type Snapshot, type SnapshotVerdict } from './snapshot';
import s from '../parts/parts.module.css';
import f from './Flow.module.css';

/** What the person asked is shown whole up to this many lines and characters; only a longer one is folded to two lines, with a
 *  button under it that shows it all (a short one is never clamped: nothing of it is hidden without a way to see it). */
const ASK_LINES = 4;
const ASK_CHARS = 320;

/** Edits re-check after this pause in typing (manual edits re-check automatically, debounced). */
export const RECHECK_MS = 600;

export type Check =
  | { k: 'idle' }
  | { k: 'checking' }
  | { k: 'ready'; v: SnapshotVerdict; missing: string[] }
  | { k: 'needs_fix'; v: SnapshotVerdict; errors: ErrorLine[] }
  | { k: 'unknown' };

export interface UseCheck {
  check: Check;
  /** The verdict holds for the current snapshot: Continue may go on. */
  holds: boolean;
  again: () => void;
}

/** The check of one snapshot (null while its bytes are being built, or when they can't be: nothing is checked). `on`: the
 *  step is shown and the flow is not paused. `debounce`: the code is being typed. */
export function useCheck(b: Binding | null, snap: Snapshot | null, on: boolean, debounce = false): UseCheck {
  const sends = useBoundSends(b);
  const [check, setCheck] = useState<Check>({ k: 'idle' });
  const [round, setRound] = useState(0);
  const seq = useRef(0);
  const key = snap ? `${snap.hash}\u0000${snap.project}\u0000${snap.compId}\u0000${snap.exec}` : '';
  const run = useRef(sends.validate);
  run.current = sends.validate;
  useEffect(() => {
    const mine = ++seq.current;
    // A change drops the verdict at once, before the new check is sent.
    setCheck({ k: on && b && snap ? 'checking' : 'idle' });
    if (!on || !b || !snap) return;
    const go = () => {
      void run.current(snap.bytes).then(
        (r) => {
          if (seq.current !== mine) return;
          const v = verdictOf(r?.data ?? null);
          if (v.verdict === 'ready') setCheck({ k: 'ready', v: verdictFor(snap, v), missing: v.missing });
          else if (v.verdict === 'needs_fix') setCheck({ k: 'needs_fix', v: verdictFor(snap, v), errors: v.errors });
          else setCheck({ k: 'unknown' });
        },
        () => { if (seq.current === mine) setCheck({ k: 'unknown' }); },
      );
    };
    if (!debounce) { go(); return; }
    const id = setTimeout(go, RECHECK_MS);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the snapshot key, the binding's computer and a Check again are the trigger
  }, [key, on, b?.target.container.id, round]);
  const v = check.k === 'ready' ? check.v : null;
  return { check, holds: verdictHolds(v, snap), again: () => setRound((x) => x + 1) };
}

/** The inputs a build was made with that changed since: Check names them in one band. */
export type Changed = 'description' | 'route' | 'schedule' | 'computer';

export interface StepCheckProps {
  way: 'ai' | 'idea' | 'write';
  computer: string;
  /** The computer's id: its name links to its page (the id is never shown). */
  compId?: string;
  /** The computer's Exec origin ('' when not known): the whole address the script will answer at is this plus the route. */
  origin?: string;
  /** The public link's name, when one is asked for. */
  linkName?: string | null;
  description: string;
  summary: string;
  route: string;
  schedule: string | null;
  link: boolean;
  /** The address answers another script now: this one takes it over. */
  taken: boolean;
  snap: Snapshot | null;
  /** The schedule cannot be placed in the code's header: there are no bytes to check. */
  unplaceable?: boolean;
  check: UseCheck;
  /** An idea: its name and the fields as filled. */
  idea?: { title: string; fields: Array<{ label: string; value: string }> };
  changed: Changed[];
  code: string;
  onCode: (v: string) => void;
  onFix: (problems: string[]) => void;
  onBuildAgain: () => void;
  onKeep: () => void;
  /** The code was edited by the person: Build again asks first. */
  codeEdited: boolean;
}

/** The step draws the draft's own snapshot (its bytes, the changes worked out from them, the idea's fields as typed): nothing
 *  here is a list the Hub reads, so it is ready when drawn. The check's answer has its own live line below. */
const READY = { kind: 'ready' } as const;

export function StepCheck(p: StepCheckProps) {
  const t = useStrings(strings);
  const [editing, setEditing] = useState(false);
  const [askReplace, setAskReplace] = useState(false);
  const [more, setMore] = useState(false);
  const firstProblem = useRef<HTMLLIElement | null>(null);
  const editor = useRef<CodeEditorHandle | null>(null);
  // A problem's line pressed while the code was folded: the editor opens, then selects that line.
  const [jumpLine, setJumpLine] = useState<number | null>(null);
  const { check } = p.check;
  // On problems, focus goes to the first one, never while the person is typing in the editor.
  const needsFix = check.k === 'needs_fix';
  useEffect(() => { if (needsFix && !editing) firstProblem.current?.focus(); }, [needsFix, editing]);
  useEffect(() => {
    if (jumpLine === null || !editing || !editor.current) return;
    editor.current.jumpTo(jumpLine);
    setJumpLine(null);
  }, [jumpLine, editing]);
  // What it installs: the computer's own check's list once it gave one for these bytes, else the code's imports. A ready
  // check of the previous snapshot (one render before useCheck drops it) holds no longer: its list is not these bytes'.
  const changes = p.way === 'idea' ? [] : changesOf(null, p.snap?.bytes ?? '', { taken: p.taken, ...(check.k === 'ready' && p.check.holds ? { installs: check.missing } : {}) });
  const runs = p.way === 'idea' ? null : p.schedule === null ? t('flow.where.onlyCalled') : `${p.schedule} UTC`;
  const longAsk = p.description.split('\n').length > ASK_LINES || p.description.length > ASK_CHARS;
  const asked = p.way === 'ai' && p.description.trim() !== '';
  const askId = useId();

  const unplaceable = p.unplaceable && p.way !== 'idea';
  const changedBand = p.changed.length > 0 && p.way === 'ai';
  const bytes = p.snap?.bytes ?? '';
  const uses = p.way === 'idea' ? null : usesOf(bytes);
  const keyed = header(bytes).d.tokens > 0;
  const lines = bytes ? bytes.split('\n').length : 0;
  const checkLabel = t('flow.check.verdict');
  // The check's answer as the step's top plate: one sentence, the one coloured phrase only when it found problems.
  const verdict =
    check.k === 'ready' ? <Verdict label={checkLabel} {...(check.missing.length > 0 ? { next: t('code.willInstall', { names: check.missing.join(', ') }) } : {})}>{t('flow.check.ready')}</Verdict>
    : check.k === 'needs_fix' ? <Verdict label={checkLabel}><VerdictMark tone="danger">{t('flow.check.problems', { n: check.errors.length })}</VerdictMark></Verdict>
    : check.k === 'unknown' ? <Verdict label={checkLabel}>{t('review.checkFailed')}</Verdict>
    : check.k === 'checking' ? <Verdict label={checkLabel}>{t('flow.check.checking', { computer: p.computer })}</Verdict>
    : null;
  const packages = check.k === 'ready' && p.check.holds ? (check.missing.length > 0 ? t('code.willInstall', { names: check.missing.join(', ') }) : t('flow.uses.packagesNone')) : t('flow.uses.packagesWait');
  // The step's heading takes focus on arrival (the wizard's first heading: the step has no field until Edit the code).
  return (
    <AnatomySection
      id="new-check"
      state={READY}
      title={t('flow.check.title')}
      description={t(p.way === 'idea' ? 'flow.check.leadIdea' : 'flow.check.lead')}
      notices={unplaceable || changedBand ? (
        <>
          {unplaceable ? <Band tone="danger" size="table" /* noDetails: the page's own check, the schedule can't be placed in this header; nothing was sent */>{t('flow.check.unplaceable')}</Band> : null}
          {changedBand ? (
            <Band
              size="table"
              actions={(
                <>
                  <Button size="sm" variant="primary" onPress={() => { if (p.codeEdited && !askReplace) { setAskReplace(true); return; } setAskReplace(false); p.onBuildAgain(); }}>{t('flow.built.again')}</Button>
                  <Button size="sm" onPress={() => { setAskReplace(false); p.onKeep(); }}>{t('flow.check.keep')}</Button>
                </>
              )}
            >
              {t('flow.check.changed', { what: p.changed.map((c) => t(`flow.check.input.${c}` as never)).join(', ') })}
            </Band>
          ) : null}
          {changedBand && askReplace ? <Band tone="warn" size="table" /* noDetails: building again replaces edited code; asked once, nothing was sent */>{t('flow.check.replaceEdited')}</Band> : null}
        </>
      ) : undefined}
    >
      {p.idea ? (
        <Verdict label={checkLabel}>{t('flow.check.ideaMade')}</Verdict>
      ) : (
        <>
          {/* The check's state through one polite region: re-checks while typing never move focus. */}
          <div role="status" aria-live="polite" /* reason: one polite region for the check's verdict plate, so re-checks while typing never move focus */>
            {verdict}
          </div>
          {check.k === 'unknown' ? <InlineActions size="md" actions={[{ id: 'check-again', label: t('flow.built.checkAgain'), onPress: p.check.again }]} /> : null}
          {check.k === 'needs_fix' ? (
            <>
              <ProblemList
                label={t('flow.check.problemsLabel')}
                problems={check.errors.map((pr, i) => ({ id: String(i), line: pr.line ?? null, message: pr.message }))}
                onJump={(line) => { setEditing(true); setJumpLine(line); }}
                firstRef={firstProblem}
              />
              <InlineActions
                size="md"
                label={t('flow.check.problemActions')}
                actions={[
                  ...(p.way === 'ai' ? [{ id: 'fix', label: t('flow.check.fix'), onPress: () => p.onFix(check.errors.map((pr) => (pr.line ? `line ${pr.line}: ` : '') + pr.message)) }] : []),
                  { id: 'edit', label: t('flow.check.edit'), onPress: () => setEditing(true) },
                ]}
              />
            </>
          ) : null}
        </>
      )}

      {p.way === 'ai' && (p.summary || asked) ? (
        <SubSection title={t('flow.check.written')} state={READY}>
          {/* Values are nodes, never strings: Facts would autolink a string (links, masked ids), and these are the person's
              words and the assistant's, shown as written. A fact holds no control, so the ask's More/Less sits under the
              sheet, tied to the ask (aria-controls, aria-expanded). */}
          <Facts
            columns={1}
            items={[
              ...(p.summary ? [{ label: t('flow.check.whatItDoes'), value: <>{p.summary}</> }] : []),
              ...(asked ? [{ label: t('flow.check.youAsked'), value: <span id={askId} className={longAsk && !more ? f.clamp2 : undefined}>{p.description}</span> }] : []),
            ] satisfies Fact[]}
          />
          {asked && longAsk ? <TextButton aria-controls={askId} aria-expanded={more} onPress={() => setMore((x) => !x)}>{t(more ? 'flow.check.less' : 'flow.check.more')}</TextButton> : null}
        </SubSection>
      ) : null}

      <SubSection title={t('flow.check.where')} state={READY}>
        <Facts
          columns={2}
          items={[
            // Values as nodes: Facts would autolink a string; the idea's name and the route are shown as written. The computer's
            // name links to its page in the Hub.
            ...(p.idea ? [{ label: t('flow.rail.what'), value: <>{p.idea.title}</> }] : []),
            { label: t('flow.rail.at'), value: <>{p.route}</>, mono: true },
            { label: t('flow.rail.on'), value: <ComputerLink name={p.computer} {...(p.compId ? { id: p.compId } : {})} variant="nav" /> },
            ...(runs ? [{ label: t('flow.rail.runs'), value: <>{runs}</> }] : []),
            ...(p.way === 'idea' ? [] : [{ label: t('flow.check.who'), value: <>{keyed ? t('flow.check.whoKey') : t('flow.check.whoNone')}</> }]),
            { label: t('flow.rail.link'), value: <>{p.link ? (p.linkName ? t('flow.check.linkWill', { name: p.linkName }) : t('flow.rail.linkOn')) : t('flow.rail.linkOff')}</> },
          ] satisfies Fact[]}
        />
      </SubSection>

      {/* The whole address the script will answer at, to read and copy. Nothing answers there before Make it live, so it is text
          with Copy under a heading that says so; the link that opens it is on "It's live". */}
      {p.origin ? (
        <SubSection title={t('flow.check.address')} state={READY}>
          <ScriptAddress origin={p.origin} path={p.route} label={t('new.address')} explain={false} />
        </SubSection>
      ) : null}

      {p.idea ? (
        <SubSection title={t('flow.check.ideaDetails')} state={READY}>
          {p.idea.fields.length > 0 ? <Facts columns={2} items={p.idea.fields.map((x) => ({ label: x.label, value: <>{x.value}</> }))} /> : null}
        </SubSection>
      ) : null}

      {uses ? (
        <SubSection title={t('flow.check.uses')} description={t('flow.check.usesNote')} state={READY}>
          <Facts
            columns={2}
            items={[
              { label: t('flow.uses.files'), value: <>{uses.writes ? t('flow.uses.filesWrite', { computer: p.computer }) : uses.files ? t('flow.uses.filesRead', { computer: p.computer }) : t('flow.uses.noneSeen')}</> },
              { label: t('flow.uses.builtins'), value: <>{uses.builtins.length > 0 ? t('flow.uses.builtinsSome', { names: uses.builtins.join(', ') }) : t('flow.uses.noneSeen')}</> },
              { label: t('flow.uses.packages'), value: <>{packages}</> },
              { label: t('flow.uses.calls'), value: <>{uses.hosts.length > 0 ? t('flow.uses.callsSome', { hosts: uses.hosts.join(', ') }) : uses.calls ? t('flow.uses.callsAny') : t('flow.uses.noneSeen')}</> },
              { label: t('flow.uses.ai'), value: <>{uses.ai ? t('flow.uses.aiSome') : t('flow.uses.noneSeen')}</> },
            ] satisfies Fact[]}
          />
        </SubSection>
      ) : null}

      {changes.length > 0 ? (
        <SubSection title={t('flow.check.worth')} state={READY}>
          <ItemList label={t('flow.check.worth')} items={changes.map((c) => ({ id: c.code, title: t(`change.${c.code}` as never, { detail: c.detail ?? '' } as never), leading: WARN_CHANGES.has(c.code) ? ('warn' as const) : ('info' as const) }))} />
        </SubSection>
      ) : null}

      {p.idea ? null : (
        <SubSection title={t('flow.check.code')} {...(lines > 0 ? { description: t('flow.check.codeLines', { count: lines }) } : {})} state={READY}>
          {editing ? (
            <CodeEditor
              ref={editor}
              label={t('new.code')}
              value={p.code}
              onChange={(v) => { setEditing(true); p.onCode(v); }}
              rows={16}
              lang="ts"
              problems={check.k === 'needs_fix' ? check.errors.map((pr) => ({ line: pr.line ?? null, message: pr.message })) : []}
              className={s.editor}
            />
          ) : (
            <Disclosure title={t('flow.built.seeCode')}>
              <CodeEditor label={t('new.code')} value={bytes} onChange={() => undefined} readOnly rows={16} lang="ts" className={s.editor} />
              <Button variant="ghost" onPress={() => setEditing(true)}>{t('flow.check.edit')}</Button>
            </Disclosure>
          )}
        </SubSection>
      )}
    </AnatomySection>
  );
}

/** Worth-knowing lines that warn (who can call it, what it spends, an address taken over, a script that won't answer);
 *  schedules and packages are calm facts. */
const WARN_CHANGES: ReadonlySet<string> = new Set(['protection_removed', 'public_spends_ai', 'public_changes_data', 'address_taken', 'turned_off']);
