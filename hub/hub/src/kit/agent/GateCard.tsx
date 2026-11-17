// GateCard.tsx: the one place that needs the person. An approval or a question arrives as an inline
// card with the accent bar; Allow once is the only accent while it is open (key Y on the focused card, N for
// Deny). A decision stays pending until the agent answers; a lost answer replaces the buttons with "may have
// gone through · Check again" and nothing can be decided again meanwhile; once the gate no longer waits and no evidence
// says what happened, it says the answer was lost and offers only Check again or Dismiss (3.6). A helper's
// approval is answered here and says who asked; it covers one call only. A gate the Hub cannot answer (approver lease,
// policy changed, a host without helper approvals) sends the person to the Agent. Decided cards fold to one muted line.
import { useContext, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { GateAllowAll } from './gateAllowAll';
import { Button, cx } from '../controls/Button';
import { Link, TextButton } from '../controls/Link';
import { Tag } from '../data/Display';
import { Checkbox, TextField } from '../forms/fields';
import { RadioGroup } from '../forms/more';
import { formatNumber } from '../format';
import { Icon } from '../icons';
import { useStrings } from '../strings';
import { asLine, clean, gateInput, scrubSecrets, type InputPart, type WfName } from './code';
import { focusCard } from './focusCard';
import { ELSE, questionChoices } from './questionChoices';
import { windowLeft } from './takesText';
import { FoldedCode, Prose } from './Reply';
import strings from './Conversation.strings.en.json';
import modeStrings from './ApprovalMode.strings.en.json';
import s from './Conversation.module.css';

/** What a card needs of a gate (ask/logic.ts Gate is assignable). */
export interface GateQuestionView { id: string; question: string; options: string[] }
export interface GateView {
  kind: 'confirm' | 'question';
  invalid?: true;
  blocked?: 'policy';
  risk: string;
  // confirm
  tool?: string;
  params?: Record<string, unknown> | null;
  detail?: string;
  dirs?: string[];
  offerSession?: boolean;
  // question
  question?: string;
  options?: string[];
  placeholder?: string;
  questions?: GateQuestionView[];
}
export type GateChoice = 'once' | 'session' | 'deny';
/** A decided card folded to one line (ask/conv.ts Decided is assignable). An answered question: `text` is its question, `answer` the
 *  listed option sent, `typed` an answer the person wrote (shown only as "your own answer", never its words), `more` how many further
 *  questions the card asked. */
export interface DecidedView { kind: 'once' | 'session' | 'deny' | 'answered' | 'declined' | 'elsewhere' | 'ended'; tool: string; text: string; answer?: string; typed?: true; more?: number }

type T = ReturnType<typeof useStrings<typeof strings>>;

/** "Allow everything in this chat…" on the card: the host's context (gateAllowAll.ts, shared with the terminal build). */
export { GateAllowAll } from './gateAllowAll';

/** The agent's risk classes that have words. `unknown` is the agent having no class: it shows no chip. Any other
 *  text is shown as the agent wrote it. */
const RISK = { read: 'am.risk.read', write: 'am.risk.write', destructive: 'am.risk.destructive', high: 'am.risk.high', credential_access: 'am.risk.credential_access' } as const;
const riskKey = (risk: string): (typeof RISK)[keyof typeof RISK] | null => (Object.hasOwn(RISK, risk) ? RISK[risk as keyof typeof RISK] : null);

/** The card's frame and its parts, for the other cards an agent surface draws (a held-hooks notice). */
export function CardFrame({ label, children }: { label: string; children: ReactNode }) {
  return <section className={s.card} aria-label={label}>{children}</section>;
}
export function CardHead({ children }: { children: ReactNode }) {
  return <div className={s.cardHead}><h3 className={s.cardTitle}>{children}</h3></div>;
}
export function CardBody({ children }: { children: ReactNode }) {
  return <div className={s.cardBody}>{children}</div>;
}

const FILE_TOOLS = /^(write_file|write_minified_file|edit_file|edit_minified_file|delete_file)$/;
function actionKey(tool: string): 'agent.act.bash' | 'agent.act.file' | 'agent.act.workflow' | 'agent.act.tool' {
  return tool === 'bash' ? 'agent.act.bash' : FILE_TOOLS.test(tool) ? 'agent.act.file' : tool === 'upsert_workflow' ? 'agent.act.workflow' : 'agent.act.tool';
}

/** A name as the save card shows it: one shown as written says why (codes for what can't be seen, nothing to see, an edge space,
 *  a quote mark). */
const ODD_KEY = { blank: 'agent.workflow.oddBlank', edge: 'agent.workflow.oddEdge', quote: 'agent.workflow.oddQuote' } as const;
function wfName(t: T, x: WfName): string {
  if (!x.odd) return x.text;
  return t(x.why ? ODD_KEY[x.why] : 'agent.workflow.odd', { text: x.text });
}

function Part({ p }: { p: InputPart }) {
  const t = useStrings(strings);
  switch (p.k) {
    case 'wfNote': return <p className={s.kv}>{t(`agent.workflow.${p.note}`)}</p>;
    case 'wfStep': return <p className={s.kvFlow}><span className={s.kvStep} translate="no">{t('agent.workflow.stepName', { n: p.n, id: wfName(t, p.id) })}</span><span className={s.kvText}>{t(`agent.workflow.step.${p.kind}`, { arg: p.arg })}</span></p>;
    case 'wfNext': {
      // The end and Otherwise are the model's flags (read from the saved id), never a match on shown text; an answer always reads as one.
      const to = p.end ? t('agent.workflow.end') : p.falls ? t('agent.workflow.falls') : p.n > 0 ? t('agent.workflow.stepName', { n: p.n, id: wfName(t, p.to) }) : wfName(t, p.to);
      const label = p.answer ? t(p.answer.odd ? 'agent.workflow.answerOdd' : 'agent.workflow.answer', { answer: wfName(t, p.answer) }) : t(p.otherwise ? 'agent.workflow.otherwise' : 'agent.workflow.next');
      // A condition is its own element with its own label, so no step name can read as one.
      const test = p.test.text && <span className={s.kvIf}><span className={s.kvIfName}>{t('agent.workflow.onlyIf')}</span> <code className={s.icode} translate="no">{wfName(t, p.test)}</code></span>;
      return <p className={s.kvFlow}><span className={s.kvStep}>{label}</span><span className={s.kvText}>{to}{test}</span></p>;
    }
    case 'wfMore': return <p className={s.kv}>{t('agent.workflow.more', { n: p.n })}</p>;
    case 'warn': return <p className={s.cardWarn}>{p.text}</p>;
    case 'path': return <p className={s.cardPath} translate="no">{p.text}</p>;
    // Shown as written (marked): whole, never folded, so no mark sits below a fold.
    case 'code': return <FoldedCode text={clean(p.src, undefined, { code: true }).text.replace(/\n+$/, '')} lang={p.tag} path={p.path} whole={p.marked} />;
    case 'kv': return <p className={s.kv}><span className={s.kvName}>{p.name}</span><span className={s.kvValue} translate="no">{p.value}</span></p>;
    case 'rich': return <Prose text={p.text} />;
    case 'diff': {
      const text = p.parts.rows.map((r) => (r.t === '=' ? ' ' : r.t) + ' ' + r.s).join('\n');
      return (
        <>
          <FoldedCode text={text} lang="diff" whole={p.marked} />
          {p.cut > 0 && <p className={s.kv}>{t('agent.cutMore', { n: p.cut })}</p>}
        </>
      );
    }
  }
}

function Unknown({ onCheck, checkUnavailable, onDismiss, t }: { onCheck: () => void; checkUnavailable?: string; onDismiss?: () => void; t: T }) {
  return (
    <p className={s.cardUnknown}>
      <span>{t('agent.decisionUnknown')}</span>
      <span aria-hidden="true">·</span>
      <TextButton isDisabled={!!checkUnavailable} onPress={onCheck}>{t('agent.checkAgain')}</TextButton>
      {checkUnavailable && <span>{checkUnavailable}</span>}
      {onDismiss && <><span aria-hidden="true">·</span><TextButton onPress={onDismiss}>{t('agent.dismissDecision')}</TextButton></>}
    </p>
  );
}

const LOST = { once: 'agent.lost.allow', session: 'agent.lost.allow', deny: 'agent.lost.deny' } as const;
/** The answer was lost and the gate no longer waits: nothing says what happened, so only a read or Stop tracking. */
function Lost({ question, sent, onCheck, checkUnavailable, onDismiss, t }: { question: boolean; sent?: GateChoice; onCheck: () => void; checkUnavailable?: string; onDismiss?: () => void; t: T }) {
  return (
    <>
      <p className={s.cardUnknown}>{t(question ? 'agent.lost.answer' : sent ? LOST[sent] : 'agent.lost.decision')}</p>
      <div className={s.cardActions}>
        <Button variant="secondary" isDisabled={!!checkUnavailable} onPress={onCheck}>{t('agent.checkAgain')}</Button>
        {onDismiss && <TextButton onPress={onDismiss}>{t('agent.dismissDecision')}</TextButton>}
      </div>
      {checkUnavailable && <p className={s.cardUnknown}>{checkUnavailable}</p>}
    </>
  );
}

function InAgent({ agentUrl, t }: { agentUrl: string; t: T }) {
  return (
    <p className={s.cardUnknown}>
      <span>{t('agent.continueInAgent')}</span>
      {agentUrl && <Link href={agentUrl} target="_blank" rel="noopener noreferrer" iconEnd="external">{t('agent.openAgent')}</Link>}
    </p>
  );
}

export interface CardProps {
  gate: GateView;
  pending: boolean;
  unknown: boolean;
  /** Reported by the agent before its answerable identity: shown, not answerable yet. */
  addressing?: boolean;
  /** A helper's gate. `{ name }`: answered here, for this one call only, saying who asked ('' when unnamed). `true`: a host
   *  that cannot answer helpers at all; the card sends the person to the Agent. */
  helper?: boolean | { name: string };
  /** With `unknown`: the gate no longer waits and no evidence settled the decision: the answer was lost. */
  gone?: boolean;
  /** The decision this page sent, for the lost-answer words. */
  sent?: GateChoice;
  /** No decision can go yet: one is waiting for the other tabs (claiming), or earlier decisions still settle (full). */
  held?: 'claiming' | 'full' | null;
  /** The words for why this source cannot decide (read-only, a missing lease): the buttons wait and the line says why. */
  unavailable?: string;
  agentUrl: string;
  /** The person is typing in the composer: the card does not take focus. */
  typing: boolean;
  onDecide: (c: GateChoice, reason?: string) => void;
  onAnswer: (v: string | Record<string, string>) => void;
  onCheck: () => void;
  /** Why Check again cannot run (the source refuses the check): the control is disabled and the line says why. */
  checkUnavailable?: string;
  /** The person gives up on a decision no read could settle: the card is answerable again, nothing is sent. Only an
   *  active source offers it; without it the card has no Dismiss. */
  onDismiss?: () => void;
}

/** The open gate's card. */
export function GateCard(p: CardProps) {
  const t = useStrings(strings);
  const ref = useRef<HTMLElement>(null);
  const first = useRef(true);
  useEffect(() => {
    // Arrival: focus moves to the card's first enabled control (the shared rule, not a code block's Copy) unless the person is
    // typing. While the window is in the background it moves to the card itself, where no key decides: the browser gives
    // focus back there on return, and the first key typed then must not answer the gate.
    if (!first.current) return;
    first.current = false;
    if (p.typing || !ref.current) return;
    focusCard(ref.current, windowLeft() ? 'card' : 'control');
  }, [p.typing]);
  const blocked = p.gate.blocked === 'policy' || p.gate.invalid || p.helper === true;
  const busy = p.pending || p.unknown;
  // Not answerable yet: the buttons wait (as for a decision on its way) and a line says why. `unavailable` (the source
  // cannot decide) disables the controls without a spinner: nothing is on its way.
  const q = p.addressing || p.held ? { ...p, pending: true } : p;
  return (
    <section ref={ref} className={s.card} aria-label={p.gate.kind === 'confirm' ? t('agent.needsApproval') : t('agent.needsAnswer')} data-ask-gate>
      <span className={s.needsYou}>{t(p.helper ? 'agent.helperGate' : 'agent.needsYou')}</span>
      {p.gate.kind === 'confirm' ? <Approval {...q} blocked={!!blocked} t={t} /> : <Question {...q} blocked={!!blocked} t={t} />}
      {p.addressing && !blocked && <p className={s.cardUnknown}>{t('agent.gateAddressing')}</p>}
      {!p.addressing && p.held === 'full' && !blocked && <p className={s.cardUnknown}>{t('agent.gateHeldFull')}</p>}
      {p.unavailable && !p.addressing && !p.held && !busy && !blocked && <p className={s.cardUnknown}>{p.unavailable}</p>}
    </section>
  );
}

/** Who asked, for a helper's gate the Hub answers. */
function AskedBy({ helper, t }: { helper: CardProps['helper']; t: T }) {
  if (!helper || helper === true) return null;
  const name = clean(scrubSecrets(helper.name), 80).text.trim();
  return <p className={s.cardUnknown}>{name ? t('agent.helperAsked', { name }) : t('agent.helperAskedAnon')}</p>;
}

function Approval({ gate, pending, unknown, gone, sent, helper, unavailable, agentUrl, onDecide, onCheck, checkUnavailable, onDismiss, blocked, t }: CardProps & { blocked: boolean; t: T }) {
  const [reasonOpen, setReasonOpen] = useState(false);
  const [reason, setReason] = useState('');
  // The choice this card sent: while it is on its way that button is the busy one (it keeps focus), the others wait disabled.
  const [pressed, setPressed] = useState<GateChoice | null>(null);
  const decide = (c: GateChoice) => { setPressed(c); if (c === 'deny') onDecide(c, reason.trim() || undefined); else onDecide(c); };
  const busyOn = (c: GateChoice) => pending && (pressed ?? 'once') === c;
  const tool = gate.tool ?? '';
  // `ts`: a translation call the literal ratchet reads, so a label made only of its keys needs no `literal`.
  const ts = useStrings(modeStrings);
  const allowAll = useContext(GateAllowAll);
  const act = actionKey(tool);
  // The tool's own name, for a tool the card has no words for, and in what "for this session" covers (the agent keeps that
  // rule by tool name; by tool and action for the exec_ tools).
  const toolName = clean(scrubSecrets(tool), 60).text.trim();
  const riskWords = gate.risk === 'unknown' ? '' : riskKey(gate.risk) ? ts(riskKey(gate.risk)!) : clean(scrubSecrets(gate.risk), 60).text;
  // The folder line and the folders granted: keys hidden as the card's own parts do, then as written on one line (asLine): the command
  // runs in that folder, so it is approved as written too.
  const cwd = gate.params && typeof gate.params.cwd === 'string' && gate.params.cwd ? asLine(gate.params.cwd, 600) : null;
  // The folder shows once: on its line, never again as a "cwd" row.
  const parts = gateInput({ tool, params: gate.params, detail: gate.detail }).filter((x) => !(cwd && x.k === 'kv' && x.name === 'cwd'));
  const dir = cwd ? cwd.text : '';
  const dirs = (gate.dirs ?? []).map((d) => ({ raw: d, ...asLine(d, 300) }));
  // A command or path holding what a screen would hide or change shows as written, with marks: the card says so,
  // and Allow waits for the person to say they read that text. Y does not allow before that; Deny is always open. The tick holds for
  // the text it was given on: new text under the same card needs a new one. A blind part (marked, and still not shown exactly) cannot
  // be allowed here at all.
  const asShown = [...parts.flatMap((x) => ((x.k === 'code' || x.k === 'path' || x.k === 'kv' || x.k === 'diff' || x.k === 'wfMore') && x.marked ? [x] : [])), ...(cwd?.marked ? [cwd] : []), ...dirs.filter((d) => d.marked)];
  const marked = asShown.length > 0, blind = asShown.some((x) => !!x.blind);
  // Shown only because it is long (gateBounds.test.tsx): the card says that instead of naming hidden characters.
  const onlyLong = marked && asShown.every((x) => 'long' in x && !!x.long);
  // Signed on everything the card shows of the call, marked or not: no shown part can change under a tick.
  const sig = JSON.stringify([tool, gate.risk, !!gate.offerSession, !!helper, parts, dir, dirs.map((d) => d.text)]);
  const [seenSig, setSeenSig] = useState<string | null>(null);
  const allowShut = blind || (marked && seenSig !== sig);
  const busy = pending || unknown || !!unavailable;
  // A helper's approval covers its one call, whatever the gate offers.
  const session = gate.offerSession && !helper;
  const rootRef = useRef<HTMLDivElement>(null);
  // Add a reason removes the button that had focus: the new field takes it, so the keyboard does not fall back to the page.
  useEffect(() => { if (reasonOpen) rootRef.current?.querySelector('textarea')?.focus({ preventScroll: true }); }, [reasonOpen]);
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (busy || blocked || e.defaultPrevented || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
    // Y and N are bare keys: a browser or app shortcut (Ctrl, Alt, Meta), a held key and an IME composition never decide.
    if (e.ctrlKey || e.altKey || e.metaKey || e.repeat || e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) return;
    if (e.key === 'y' || e.key === 'Y') { e.preventDefault(); if (!allowShut) decide('once'); }
    else if (e.key === 'n' || e.key === 'N') { e.preventDefault(); decide('deny'); }
  };
  return (
    // The card's own keys (Y, N) while focus is inside it.
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div ref={rootRef} onKeyDown={onKey}>
      <div className={s.cardHead}>
        <h3 className={s.cardTitle}>{t('agent.allowTitle')}</h3>
        <span className={s.cardAct}>{t(act)}</span>
        {act === 'agent.act.tool' && toolName && <span className={s.cardAct} translate="no">{toolName}</span>}
        {riskWords && <Tag tone="warn">{riskWords}</Tag>}
      </div>
      <div className={s.cardBody}>
        {marked && <p className={s.cardWarn}>{t(blind ? (onlyLong ? 'agent.longBlind' : 'agent.asWrittenBlind') : onlyLong ? 'agent.longShown' : 'agent.asWritten')}</p>}
        {parts.map((x, i) => <Part key={i} p={x} />)}
        {dir && <p className={s.cardDir}>{t('agent.inFolder', { dir })}</p>}
        {gate.dirs && gate.dirs.length > 0 && (
          <ul className={s.chips} aria-label={t('agent.folders')}>
            {dirs.map((d) => <li key={d.raw} className={s.pathChip} translate="no">{d.text}</li>)}
          </ul>
        )}
        <AskedBy helper={helper} t={t} />
        {/* What a decision covers, above the buttons so a card scrolled to its end keeps them in view. */}
        {!helper && !blocked && !unknown && <p className={s.cardUnknown}>{t(session ? 'agent.coversSession' : 'agent.coversCall')}</p>}
        {session && !blocked && !unknown && (
          <p className={s.cardUnknown}>
            {tool === 'bash' ? ts('am.card.session.bash') : ts(tool.startsWith('exec_') ? 'am.card.session.action' : 'am.card.session.tool', { tool: toolName })}
          </p>
        )}
      </div>
      {/* A lost answer stays in front: a gate this Hub cannot decide now still owes the person what happened to the earlier decision. */}
      {unknown && gone ? <Lost question={false} sent={sent} onCheck={onCheck} checkUnavailable={checkUnavailable} onDismiss={onDismiss} t={t} /> : blocked ? <InAgent agentUrl={agentUrl} t={t} /> : unknown ? <Unknown onCheck={onCheck} checkUnavailable={checkUnavailable} onDismiss={onDismiss} t={t} /> : (
        <>
          {marked && !blind && <Checkbox label={t(onlyLong ? 'agent.longSeen' : 'agent.asWrittenSeen')} isSelected={seenSig === sig} onChange={(v) => setSeenSig(v ? sig : null)} isDisabled={busy} />}
          <div className={s.cardActions}>
            <Button variant="primary" shortcut="Y" busy={busyOn('once')} isDisabled={busy || allowShut} onPress={() => decide('once')}>{t('agent.allowOnce')}</Button>
            {session && <Button variant="secondary" busy={busyOn('session')} isDisabled={busy || allowShut} onPress={() => decide('session')}>{t('agent.allowSession')}</Button>}
            <Button variant="secondary" shortcut="N" busy={busyOn('deny')} isDisabled={busy} onPress={() => decide('deny')}>{t('agent.deny')}</Button>
            {!reasonOpen && <TextButton isDisabled={busy} onPress={() => setReasonOpen(true)}>{t('agent.addReason')}</TextButton>}
            {/* The widest choice only asks: the host's confirm names what it covers, and that confirm sends. It waits for the
                "I read this text" tick as Allow once does, since it would allow this very call. */}
            {allowAll && !helper && <TextButton isDisabled={busy || allowShut} onPress={allowAll}>{ts('am.card.all')}</TextButton>}
          </div>
          {reasonOpen && <TextField label={t('agent.reason')} multiline rows={2} maxLength={500} value={reason} onChange={setReason} isDisabled={busy} />}
        </>
      )}
    </div>
  );
}

// A radio's value names the choice without ever equalling another (questionChoices.ts). The picks and typed texts are Maps
// keyed by question id: a question id is any string, `constructor` included, and a plain object would answer it from its prototype.
function Question({ gate, pending, unknown, gone, helper, unavailable, agentUrl, onAnswer, onCheck, checkUnavailable, onDismiss, blocked, t }: CardProps & { blocked: boolean; t: T }) {
  const groups = gate.questions && gate.questions.length
    ? gate.questions.map((q) => ({ id: q.id, text: q.question, options: q.options }))
    : [{ id: '', text: gate.question ?? '', options: gate.options ?? [] }];
  const [picked, setPicked] = useState<ReadonlyMap<string, string>>(new Map());
  const [other, setOther] = useState<ReadonlyMap<string, string>>(new Map());
  const put = (m: ReadonlyMap<string, string>, id: string, v: string): ReadonlyMap<string, string> => new Map(m).set(id, v);
  // The answer is what the card shows: the text field while it is shown (Something else picked, or no options), else the picked option.
  // Text typed under Something else and left behind by a later pick is hidden, so it is never sent.
  const value = (g: { id: string; options: string[] }): string => {
    const v = picked.get(g.id);
    if (g.options.length === 0 || v === ELSE) return (other.get(g.id) ?? '').trim();
    return v?.startsWith('o') ? v.slice(1) : '';
  };
  const ready = groups.every((g) => value(g));
  const busy = pending || unknown || !!unavailable;
  const send = () => {
    if (!ready || busy) return;
    if (groups.length === 1 && !groups[0]?.id) onAnswer(value(groups[0] as { id: string; options: string[] }));
    else onAnswer(Object.fromEntries(groups.map((g) => [g.id, value(g)])));
  };
  return (
    <div>
      <div className={s.cardHead}><h3 className={s.cardTitle}>{t('agent.questionTitle')}</h3></div>
      <div className={s.cardBody}>
        {groups.map((g, gi) => (
          <div key={g.id || gi} className={s.qGroup}>
            <Prose text={(groups.length > 1 ? `${gi + 1}. ` : '') + clean(scrubSecrets(g.text), 4000).text} />
            {g.options.length > 0 && (
              <RadioGroup
                label={groups.length > 1 ? t('agent.questionN', { n: gi + 1 }) : t('agent.questionTitle')}
                className={s.qRadios}
                isDisabled={busy || blocked}
                value={picked.get(g.id)}
                onChange={(v: string) => setPicked((m) => put(m, g.id, v))}
                options={questionChoices(g.options, (o) => clean(scrubSecrets(o), 300).text, t('agent.somethingElse'))}
              />
            )}
            {(g.options.length === 0 || picked.get(g.id) === ELSE) && (
              <TextField label={groups.length > 1 ? t('agent.somethingElseFieldN', { n: gi + 1 }) : t('agent.somethingElseField')} placeholder={gate.placeholder ? clean(scrubSecrets(gate.placeholder), 200).text : undefined} value={other.get(g.id) ?? ''} onChange={(v) => setOther((m) => put(m, g.id, v))} isDisabled={busy || blocked} />
            )}
          </div>
        ))}
        <AskedBy helper={helper} t={t} />
      </div>
      {unknown && gone ? <Lost question onCheck={onCheck} checkUnavailable={checkUnavailable} onDismiss={onDismiss} t={t} /> : blocked ? <InAgent agentUrl={agentUrl} t={t} /> : unknown ? <Unknown onCheck={onCheck} checkUnavailable={checkUnavailable} onDismiss={onDismiss} t={t} /> : (
        <div className={s.cardActions}>
          <Button variant="primary" busy={pending} isDisabled={!ready || busy} onPress={send}>{t('agent.sendAnswer')}</Button>
        </div>
      )}
    </div>
  );
}

const D_ICON = { once: 'check', session: 'check', deny: 'x', answered: 'arrow-right', declined: 'x', elsewhere: 'arrow-right', ended: 'x' } as const;
/** A decided card, folded to one muted line. */
export function DecidedLine({ d }: { d: DecidedView }) {
  const t = useStrings(strings);
  const act = d.tool ? t(actionKey(d.tool)) : '';
  const text = d.text ? clean(scrubSecrets(d.text), 200).text.split('\n')[0] : '';
  // An answered question names its question, then the option sent; an answer the person typed is never shown (it may hold a secret).
  const said = d.kind !== 'answered' ? '' : d.answer !== undefined ? clean(scrubSecrets(d.answer), 200).text.split('\n')[0] : d.typed ? t('agent.d.ownAnswer') : '';
  const more = d.kind === 'answered' && d.more ? t('agent.d.moreAnswers', { count: d.more, n: formatNumber(d.more) }) : '';
  return (
    <p className={cx(s.decided, d.kind === 'deny' && s.decidedNo)}>
      <Icon name={D_ICON[d.kind]} size="sm" />
      <span className={s.decidedWhat}>{t(`agent.d.${d.kind}`)}</span>
      {act && d.kind !== 'deny' && <><span aria-hidden="true">·</span><span>{act}</span></>}
      {text && <><span aria-hidden="true">·</span><span className={s.decidedText} translate="no">{text}</span></>}
      {said && <><span aria-hidden="true">·</span><span translate={d.answer !== undefined ? 'no' : undefined}>{said}</span></>}
      {more && <><span aria-hidden="true">·</span><span>{more}</span></>}
    </p>
  );
}
