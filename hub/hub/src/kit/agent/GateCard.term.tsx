// GateCard.term: the approval and question cards in a terminal. Same props, same callbacks and the same rules as the web
// card (decisions stay pending until the agent answers; a lost answer offers only Check again / Stop tracking; a blocked
// gate sends the person to the Agent; text shown as written must be acknowledged before Allow), plus three terminal
// safety rules, because a terminal has no pointer hover and keys arrive in bursts:
//   1. Impossible to miss: a bordered card in the warning colour titled "! Needs you", the exact action in words, then
//      what runs (command, file, diff) whole or folded as on the web.
//   1b. Impossible to forge: its headline is drawn in reverse video, which nothing in a transcript can produce (agent text
//      reaches the screen through safeText, which strips every escape, and markdown styles are bold, italic, underline and
//      colour only), and SessionView.term draws the card in its own area below the transcript's scroll, never inside it. A
//      reply that prints a look-alike frame stays plain text in the transcript (hostile.term.test.tsx).
//   2. Focus lands on the SAFE choice. On arrival (the person is not typing) focus goes to Deny, never to Allow. Deny is
//      also first in the row, so Tab order starts there. While the person types in the composer, focus stays there.
//   3. A new card ignores presses for GATE_ARM.ms (gateArm.ts) after it first draws: a key already on its way (Enter
//      typed into the composer a moment before, a held key) cannot answer it. The card says so while it lasts.
// Keys inside the card: y = Allow once, n = Deny (bare keys only; a held key's repeats never decide), Enter / Space press
// the focused button. Nothing outside the card (the composer, the transcript) answers it.
import { useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';
import type * as Web from './GateCard';
import type { CardProps, GateChoice, DecidedView } from './GateCard';
import { Box, Text } from '@term/prim';
import { Pressable, focusInk, type Focusable, type Key } from '@term/kit';
import { Link, TextButton } from '../controls/Link';
import { Checkbox, TextField } from '../forms/fields';
import { formatNumber } from '../format';
import { RadioGroup } from '../forms/more';
import { useStrings } from '../strings';
import { asLine, clean, gateInput, scrubSecrets, type InputPart, type WfName } from './code';
import { GATE_ARM, gateArmed } from './gateArm';
import { ELSE, questionChoices } from './questionChoices';
import { FoldedCode, Prose } from './Reply';
import strings from './Conversation.strings.en.json';

export type { GateQuestionView, GateView, GateChoice, DecidedView, CardProps } from './GateCard';
// The web card's "Allow everything" context, from its shared module: the terminal card offers no such choice, but the kit
// barrel exports it from './agent/GateCard', which this file is in the terminal build.
export { GateAllowAll } from './gateAllowAll';

type T = ReturnType<typeof useStrings<typeof strings>>;

export const CardFrame: typeof Web.CardFrame = ({ label, children }) => (
  <Box dir="column" border borderColour="lineStrong" padX={1} shrink={0} sem={{ role: 'region', name: label }}>{children}</Box>
);
export const CardHead: typeof Web.CardHead = ({ children }) => <Text bold>{children}</Text>;
export const CardBody: typeof Web.CardBody = ({ children }) => <Box dir="column" shrink={0}>{children}</Box>;

const FILE_TOOLS = /^(write_file|write_minified_file|edit_file|edit_minified_file|delete_file)$/;
function actionKey(tool: string): 'agent.act.bash' | 'agent.act.file' | 'agent.act.workflow' | 'agent.act.tool' {
  return tool === 'bash' ? 'agent.act.bash' : FILE_TOOLS.test(tool) ? 'agent.act.file' : tool === 'upsert_workflow' ? 'agent.act.workflow' : 'agent.act.tool';
}
const ODD_KEY = { blank: 'agent.workflow.oddBlank', edge: 'agent.workflow.oddEdge', quote: 'agent.workflow.oddQuote' } as const;
function wfName(t: T, x: WfName): string {
  if (!x.odd) return x.text;
  return t(x.why ? ODD_KEY[x.why] : 'agent.workflow.odd', { text: x.text });
}

function Part({ p }: { p: InputPart }): ReactElement {
  const t = useStrings(strings);
  switch (p.k) {
    case 'wfNote': return <Text>{t(`agent.workflow.${p.note}`)}</Text>;
    case 'wfStep': return <Text><Text bold>{t('agent.workflow.stepName', { n: p.n, id: wfName(t, p.id) }) + '  '}</Text>{t(`agent.workflow.step.${p.kind}`, { arg: p.arg })}</Text>;
    case 'wfNext': {
      const to = p.end ? t('agent.workflow.end') : p.falls ? t('agent.workflow.falls') : p.n > 0 ? t('agent.workflow.stepName', { n: p.n, id: wfName(t, p.to) }) : wfName(t, p.to);
      const label = p.answer ? t(p.answer.odd ? 'agent.workflow.answerOdd' : 'agent.workflow.answer', { answer: wfName(t, p.answer) }) : t(p.otherwise ? 'agent.workflow.otherwise' : 'agent.workflow.next');
      return (
        <Text>
          <Text bold>{label + '  '}</Text>{to}
          {p.test.text ? <Text>{'  ' + t('agent.workflow.onlyIf') + ' '}<Text colour="acc">{wfName(t, p.test)}</Text></Text> : null}
        </Text>
      );
    }
    case 'wfMore': return <Text colour="muted">{t('agent.workflow.more', { n: p.n })}</Text>;
    case 'warn': return <Text colour="warn">{'! ' + p.text}</Text>;
    case 'path': return <Text colour="acc">{p.text}</Text>;
    case 'code': return <FoldedCode text={clean(p.src, undefined, { code: true }).text.replace(/\n+$/, '')} lang={p.tag} path={p.path} whole={p.marked} />;
    case 'kv': return <Text><Text colour="muted">{p.name + ': '}</Text>{p.value}</Text>;
    case 'rich': return <Prose text={p.text} />;
    case 'diff': {
      const text = p.parts.rows.map((r) => (r.t === '=' ? ' ' : r.t) + ' ' + r.s).join('\n');
      return (
        <Box dir="column" shrink={0}>
          <FoldedCode text={text} lang="diff" whole={p.marked} />
          {p.cut > 0 ? <Text colour="muted">{t('agent.cutMore', { n: p.cut })}</Text> : null}
        </Box>
      );
    }
  }
}

/** A card button: `[Label k]`, on the focus plate while focused (focusInk; bold and underlined in mono), `…` while busy, faint when it cannot act. */
function CardButton({ label, keyHint, busy, disabled, primary, onPress, onKey, handle }: {
  label: string; keyHint?: string; busy?: boolean; disabled?: boolean; primary?: boolean; onPress: () => void; onKey?: (k: Key) => boolean; handle?: { current: Focusable | null };
}): ReactElement {
  const off = !!disabled || !!busy;
  return (
    <Pressable
      disabled={!!disabled}
      onPress={() => { if (!off) onPress(); }}
      onKey={onKey}
      handle={handle}
      sem={{ name: label, disabled: !!disabled, busy: !!busy }}
    >
      {({ focused }) => (
        <Text bold={primary} colour={disabled ? 'faint' : primary ? 'acc' : 'ink'} {...focusInk(focused)}>
          {'[' + (busy ? '… ' : '') + label + (keyHint ? ' ' + keyHint : '') + ']'}
        </Text>
      )}
    </Pressable>
  );
}

function Unknown({ onCheck, checkUnavailable, onDismiss, t }: { onCheck: () => void; checkUnavailable?: string; onDismiss?: () => void; t: T }) {
  return (
    <Box dir="row" gapX={1} wrap>
      <Text colour="warn">{'? ' + t('agent.decisionUnknown')}</Text>
      <CardButton label={t('agent.checkAgain')} disabled={!!checkUnavailable} onPress={onCheck} />
      {checkUnavailable ? <Text colour="muted">{checkUnavailable}</Text> : null}
      {onDismiss ? <CardButton label={t('agent.dismissDecision')} onPress={onDismiss} /> : null}
    </Box>
  );
}

const LOST = { once: 'agent.lost.allow', session: 'agent.lost.allow', deny: 'agent.lost.deny' } as const;
function Lost({ question, sent, onCheck, checkUnavailable, onDismiss, t }: { question: boolean; sent?: GateChoice; onCheck: () => void; checkUnavailable?: string; onDismiss?: () => void; t: T }) {
  return (
    <Box dir="column" shrink={0}>
      <Text colour="warn">{'? ' + t(question ? 'agent.lost.answer' : sent ? LOST[sent] : 'agent.lost.decision')}</Text>
      <Box dir="row" gap={2}>
        <CardButton label={t('agent.checkAgain')} disabled={!!checkUnavailable} onPress={onCheck} />
        {onDismiss ? <CardButton label={t('agent.dismissDecision')} onPress={onDismiss} /> : null}
      </Box>
      {checkUnavailable ? <Text colour="muted">{checkUnavailable}</Text> : null}
    </Box>
  );
}

function InAgent({ agentUrl, t }: { agentUrl: string; t: T }) {
  return (
    <Box dir="row" gapX={1} wrap>
      <Text colour="muted">{t('agent.continueInAgent')}</Text>
      {agentUrl ? <Link href={agentUrl}>{t('agent.openAgent')}</Link> : null}
    </Box>
  );
}

function AskedBy({ helper, t }: { helper: CardProps['helper']; t: T }) {
  if (!helper || helper === true) return null;
  const name = clean(scrubSecrets(helper.name), 80).text.trim();
  return <Text colour="muted">{name ? t('agent.helperAsked', { name }) : t('agent.helperAskedAnon')}</Text>;
}

/** When the card first drew, and whether it takes presses yet; re-renders once when the window ends. */
function useArm(): { armed: () => boolean; holding: boolean } {
  const since = useRef(GATE_ARM.now());
  const [holding, setHolding] = useState(!gateArmed(since.current));
  useEffect(() => {
    if (!holding) return undefined;
    const id = setTimeout(() => setHolding(false), Math.max(0, GATE_ARM.ms - (GATE_ARM.now() - since.current)));
    return () => clearTimeout(id);
  }, [holding]);
  return { armed: () => gateArmed(since.current), holding };
}

/** A bare letter (no Ctrl, Alt, Meta), not a held key's repeat. */
const bare = (k: Key, ch: string): boolean => k.name === ch && !k.ctrl && !k.meta && !(k as { option?: boolean }).option && !(k as { repeated?: boolean }).repeated;

export const GateCard: typeof Web.GateCard = (p) => {
  const t = useStrings(strings);
  const blocked = p.gate.blocked === 'policy' || !!p.gate.invalid || p.helper === true;
  const busy = p.pending || p.unknown;
  const q = p.addressing || p.held ? { ...p, pending: true } : p;
  const confirm = p.gate.kind === 'confirm';
  const title = (p.helper ? t('agent.helperGate') : t('agent.needsYou'));
  return (
    <Box
      dir="column"
      border
      borderColour="warn"
      title={' ! ' + title + ' '}
      padX={1}
      shrink={0}
      sem={{ role: 'region', name: confirm ? t('agent.needsApproval') : t('agent.needsAnswer') }}
    >
      {confirm ? <Approval {...q} blocked={blocked} t={t} /> : <Question {...q} blocked={blocked} t={t} />}
      {p.addressing && !blocked ? <Text colour="muted">{t('agent.gateAddressing')}</Text> : null}
      {!p.addressing && p.held === 'full' && !blocked ? <Text colour="muted">{t('agent.gateHeldFull')}</Text> : null}
      {p.unavailable && !p.addressing && !p.held && !busy && !blocked ? <Text colour="muted">{p.unavailable}</Text> : null}
    </Box>
  );
};

function Approval({ gate, pending, unknown, gone, sent, helper, unavailable, agentUrl, typing, onDecide, onCheck, checkUnavailable, onDismiss, blocked, t }: CardProps & { blocked: boolean; t: T }) {
  const [reasonOpen, setReasonOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [pressed, setPressed] = useState<GateChoice | null>(null);
  const arm = useArm();
  const tool = gate.tool ?? '';
  const cwd = gate.params && typeof gate.params.cwd === 'string' && gate.params.cwd ? asLine(gate.params.cwd, 600) : null;
  // The folder shows once, as its own "in <folder>" line: its "cwd" row is left out (the web card shows both).
  // Its as-written mark is kept through `cwd` below.
  const parts = gateInput({ tool, params: gate.params, detail: gate.detail }).filter((x) => !(cwd && x.k === 'kv' && x.name === 'cwd'));
  const dir = cwd ? cwd.text : '';
  const dirs = (gate.dirs ?? []).map((d) => ({ raw: d, ...asLine(d, 300) }));
  const asShown = [...parts.flatMap((x) => ((x.k === 'code' || x.k === 'path' || x.k === 'kv' || x.k === 'diff' || x.k === 'wfMore') && x.marked ? [x] : [])), ...(cwd?.marked ? [cwd] : []), ...dirs.filter((d) => d.marked)];
  const marked = asShown.length > 0, blind = asShown.some((x) => !!x.blind);
  const onlyLong = marked && asShown.every((x) => 'long' in x && !!x.long);
  const sig = JSON.stringify([tool, gate.risk, !!gate.offerSession, !!helper, parts, dir, dirs.map((d) => d.text)]);
  const [seenSig, setSeenSig] = useState<string | null>(null);
  const allowShut = blind || (marked && seenSig !== sig);
  const busy = pending || unknown || !!unavailable;
  const session = gate.offerSession && !helper;
  const busyOn = (c: GateChoice) => pending && (pressed ?? 'once') === c;
  // Every decision goes through here: the arming window and the card's own state are checked at the press.
  const decide = (c: GateChoice) => {
    if (!arm.armed() || busy || blocked) return; // @guard:arm
    if (c !== 'deny' && allowShut) return;
    setPressed(c);
    if (c === 'deny') onDecide(c, reason.trim() || undefined);
    else onDecide(c);
  };
  // y / n while the focus is on one of the card's buttons.
  const keys = (k: Key): boolean => {
    if (bare(k, 'y')) { decide('once'); return true; }
    if (bare(k, 'n')) { decide('deny'); return true; }
    return false;
  };
  // Arrival: focus to Deny (the safe choice) unless the person is typing; never to Allow.
  const denyRef = useRef<Focusable | null>(null);
  const first = useRef(true);
  useEffect(() => {
    if (!first.current) return;
    first.current = false;
    if (typing) return; // @guard:typing
    denyRef.current?.focus();
  }, [typing]);
  return (
    <Box dir="column" shrink={0}>
      <Box dir="row" gapX={1} wrap>
        <Text bold inverse colour="warn">{' ' + t('agent.allowTitle') + ' '}</Text>
        <Text bold>{t(actionKey(tool))}</Text>
        {gate.risk ? <Text colour="warn">{'(' + clean(scrubSecrets(gate.risk), 60).text + ')'}</Text> : null}
      </Box>
      <Box dir="column" shrink={0} pad={{ top: 1 }}>
        {marked ? <Text colour="warn">{'! ' + t(blind ? (onlyLong ? 'agent.longBlind' : 'agent.asWrittenBlind') : onlyLong ? 'agent.longShown' : 'agent.asWritten')}</Text> : null}
        {parts.map((x, i) => <Part key={i} p={x} />)}
        {dir ? <Text colour="muted">{t('agent.inFolder', { dir })}</Text> : null}
        {dirs.length > 0 ? <Text colour="acc">{dirs.map((d) => d.text).join('  ')}</Text> : null}
        <AskedBy helper={helper} t={t} />
        {!helper && !blocked && !unknown ? <Text colour="muted">{t(session ? 'agent.coversSession' : 'agent.coversCall')}</Text> : null}
      </Box>
      {unknown && gone ? <Lost question={false} sent={sent} onCheck={onCheck} checkUnavailable={checkUnavailable} onDismiss={onDismiss} t={t} /> : blocked ? <InAgent agentUrl={agentUrl} t={t} /> : unknown ? <Unknown onCheck={onCheck} checkUnavailable={checkUnavailable} onDismiss={onDismiss} t={t} /> : (
        <Box dir="column" shrink={0}>
          {marked && !blind ? <Checkbox label={t(onlyLong ? 'agent.longSeen' : 'agent.asWrittenSeen')} isSelected={seenSig === sig} onChange={(v) => setSeenSig(v ? sig : null)} isDisabled={busy} /> : null}
          <Box dir="row" gapX={2} wrap>
            <CardButton label={t('agent.deny')} keyHint="n" busy={busyOn('deny')} disabled={busy} onPress={() => decide('deny')} onKey={keys} handle={denyRef} />
            <CardButton label={t('agent.allowOnce')} keyHint="y" primary busy={busyOn('once')} disabled={busy || allowShut} onPress={() => decide('once')} onKey={keys} />
            {session ? <CardButton label={t('agent.allowSession')} busy={busyOn('session')} disabled={busy || allowShut} onPress={() => decide('session')} onKey={keys} /> : null}
            {!reasonOpen ? <TextButton isDisabled={busy} onPress={() => setReasonOpen(true)}>{t('agent.addReason')}</TextButton> : null}
          </Box>
          {arm.holding && !busy ? <Text colour="faint">{t('agent.gateArming')}</Text> : null}
          {reasonOpen ? <TextField label={t('agent.reason')} multiline rows={2} maxLength={500} value={reason} onChange={setReason} isDisabled={busy} autoFocus /> : null}
        </Box>
      )}
    </Box>
  );
}

function Question({ gate, pending, unknown, gone, helper, unavailable, agentUrl, onAnswer, onCheck, checkUnavailable, onDismiss, blocked, t }: CardProps & { blocked: boolean; t: T }) {
  const groups = gate.questions && gate.questions.length
    ? gate.questions.map((q) => ({ id: q.id, text: q.question, options: q.options }))
    : [{ id: '', text: gate.question ?? '', options: gate.options ?? [] }];
  const [picked, setPicked] = useState<ReadonlyMap<string, string>>(new Map());
  const [other, setOther] = useState<ReadonlyMap<string, string>>(new Map());
  const arm = useArm();
  const put = (m: ReadonlyMap<string, string>, id: string, v: string): ReadonlyMap<string, string> => new Map(m).set(id, v);
  const value = (g: { id: string; options: string[] }): string => {
    const v = picked.get(g.id);
    if (g.options.length === 0 || v === ELSE) return (other.get(g.id) ?? '').trim();
    return v?.startsWith('o') ? v.slice(1) : '';
  };
  const ready = groups.every((g) => value(g));
  const busy = pending || unknown || !!unavailable;
  const send = () => {
    if (!ready || busy || !arm.armed()) return;
    if (groups.length === 1 && !groups[0]?.id) onAnswer(value(groups[0] as { id: string; options: string[] }));
    else onAnswer(Object.fromEntries(groups.map((g) => [g.id, value(g)])));
  };
  return (
    <Box dir="column" shrink={0}>
      <Text bold inverse colour="warn">{' ' + t('agent.questionTitle') + ' '}</Text>
      <Box dir="column" shrink={0} gap={1} pad={{ top: 1, bottom: 1 }}>
        {groups.map((g, gi) => (
          <Box key={g.id || gi} dir="column" shrink={0}>
            <Prose text={(groups.length > 1 ? `${gi + 1}. ` : '') + clean(scrubSecrets(g.text), 4000).text} />
            {g.options.length > 0 ? (
              <RadioGroup
                label={groups.length > 1 ? t('agent.questionN', { n: gi + 1 }) : t('agent.questionTitle')}
                isDisabled={busy || blocked}
                value={picked.get(g.id)}
                onChange={(v: string) => setPicked((m) => put(m, g.id, v))}
                options={questionChoices(g.options, (o) => clean(scrubSecrets(o), 300).text, t('agent.somethingElse'))}
              />
            ) : null}
            {g.options.length === 0 || picked.get(g.id) === ELSE ? (
              <TextField label={groups.length > 1 ? t('agent.somethingElseFieldN', { n: gi + 1 }) : t('agent.somethingElseField')} placeholder={gate.placeholder ? clean(scrubSecrets(gate.placeholder), 200).text : undefined} value={other.get(g.id) ?? ''} onChange={(v) => setOther((m) => put(m, g.id, v))} isDisabled={busy || blocked} />
            ) : null}
          </Box>
        ))}
        <AskedBy helper={helper} t={t} />
      </Box>
      {unknown && gone ? <Lost question onCheck={onCheck} checkUnavailable={checkUnavailable} onDismiss={onDismiss} t={t} /> : blocked ? <InAgent agentUrl={agentUrl} t={t} /> : unknown ? <Unknown onCheck={onCheck} checkUnavailable={checkUnavailable} onDismiss={onDismiss} t={t} /> : (
        <Box dir="row"><CardButton label={t('agent.sendAnswer')} primary busy={pending} disabled={!ready || busy} onPress={send} /></Box>
      )}
    </Box>
  );
}

const D_MARK = { once: '✓', session: '✓', deny: '✗', answered: '→', declined: '✗', elsewhere: '→', ended: '✗' } as const;
export const DecidedLine: typeof Web.DecidedLine = ({ d }: { d: DecidedView }) => {
  const t = useStrings(strings);
  const act = d.tool ? t(actionKey(d.tool)) : '';
  const text = d.text ? clean(scrubSecrets(d.text), 200).text.split('\n')[0] : '';
  const bits: ReactNode[] = [t(`agent.d.${d.kind}`)];
  if (act && d.kind !== 'deny') bits.push(act);
  if (text) bits.push(text);
  // An answered question names its question, then the option sent; an answer the person typed is never shown (it may hold a secret).
  if (d.kind === 'answered') {
    if (d.answer !== undefined) { const a = clean(scrubSecrets(d.answer), 200).text.split('\n')[0]; if (a) bits.push(a); }
    else if (d.typed) bits.push(t('agent.d.ownAnswer'));
    if (d.more) bits.push(t('agent.d.moreAnswers', { count: d.more, n: formatNumber(d.more) }));
  }
  return (
    <Text colour={d.kind === 'deny' ? 'danger' : 'muted'} truncate>
      {D_MARK[d.kind] + ' ' + bits.join(' · ')}
    </Text>
  );
};
