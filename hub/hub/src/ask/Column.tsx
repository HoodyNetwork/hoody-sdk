// Column.tsx: the conversation column: user blocks, step trails, replies, decided lines and
// outcomes, top to bottom. role="log"; only finished replies are announced (a hidden live region), never each
// streamed token. Auto-follow while the person is at the bottom; once they scroll up the view stays put and "New
// activity" offers the way back. It draws no gate card: a decision goes only through the active
// source, whose prerequisites (attachment hold, approver lease) the column does not have; dock sessions are drawn by
// DockSession (8b-3b).
import { Fragment, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { AttachChip, AttachList, Band, Button, CardBody, CardFrame, CardHead, DecidedLine, Link, Prose, ReasonButton, ReplyBox, ReplyFooter, TextButton, cx, formatNumber, useNow, useStrings } from '@kit';
import { StoredPicture } from '@kit/agent/StepPictures';
import { parseAskMessage } from '@kit/ask';
import { Author, SentText } from '@kit/agent/SentMessage';
import type { ConvBlock, StepView } from '@kit/agent/source';
import { StepTrail } from '@kit/agent/StepTrail';
import { SummaryNote } from '@kit/agent/SummaryNote';
import { links as aiLinks } from '../pages/ai/links';
import { ToPageButton } from './links';
import { clean, scrubSecrets } from './code';
import * as C from './conv';
import type { AskEngine, Snapshot } from './engine';
import { failureKey, type Step } from './logic';
import { hideSecrets } from './md';
import { canCheckRow, canEdit, canResend, canStopTracking, queuedWords, retryFor, unknownWords } from './rowActions';
import strings from './strings.en.json';
import s from './Ask.module.css';
import { hostEnv } from '@core';

type T = ReturnType<typeof useStrings<typeof strings>>;

/** Model text as drawn: controls, escapes and bidi overrides out. Scrubbed first, since cleaning can glue a key to the word before it. */
export function shownReply(text: string): string {
  return clean(scrubSecrets(C.withoutCloseMarker(text))).text;
}

export function duration(ms: number): string {
  const sec = Math.max(0, Math.round(ms / 1000));
  if (sec < 60) return `${sec} s`;
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m} m ${sec % 60} s`;
  return `${Math.floor(m / 60)} h ${m % 60} m`;
}
export function clock(iso: string): string {
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
}

// ---- user message ----
// The same parts as the kit's transcript (kit/agent SentMessage), so the first frame of a conversation reads like the rest:
// who wrote it and when, then the words. A typed message folds when long. A message an Ask the Agent action sent shows its
// one-line request; its instructions and the page's context are one press away under "Context sent", whole and as sent.
// 8000 UTF-16 units hold the agent's 4000 characters.
/** `onEdit`: a Not sent message with files goes back to the composer to be fixed (its text through this). */
export function UserBlock({ msg, eng, t, onEdit }: { msg: C.UserMsg; eng: AskEngine; t: T; onEdit?: (uid: string) => void }) {
  const [all, setAll] = useState(false);
  const sent = clean(msg.text, 8000).text;
  const m = parseAskMessage(sent);
  const words = m.title ?? m.text;
  const long = words.split('\n').length > 8 || words.length > 900;
  return (
    <div className={s.userWrap}>
      <Author who="you" at={msg.at} />
      <div className={s.user}>
        <SentText text={sent} fold={long && !all} />
        {msg.pics?.length || msg.imgs?.length || msg.files?.length ? (
          <AttachList label={t('ask.attSent')} big>
            {msg.pics?.map((p, i) => {
              const name = p.name || t('ask.attPicture', { n: i + 1 });
              return p.id
                ? <StoredPicture key={`pic${i}`} id={p.id} name={name} />
                : <AttachChip key={`pic${i}`} kind="image" url={null} name={name} meta={t('ask.attPictureNone')} />;
            })}
            {msg.imgs?.map((a) => (
              <AttachChip key={a.id} kind="image" url={a.url} name={a.name} meta={a.resized ? t('ask.attResizedShort') : undefined} />
            ))}
            {msg.files?.map((f) => (
              <AttachChip key={f.id} kind="text" name={f.name} meta={t('ask.attLines', { count: f.lines, n: formatNumber(f.lines) })} />
            ))}
          </AttachList>
        ) : null}
      </div>
      {long && <TextButton onPress={() => setAll((v) => !v)}>{all ? t('ask.showLess') : t('ask.showAll')}</TextButton>}
      <UserState msg={msg} eng={eng} t={t} onEdit={onEdit} />
    </div>
  );
}
/** The state line under a message (also the dock's SessionView tail, which draws it for the rows the kit's note cannot act on). */
export function UserState({ msg, eng, t, onEdit }: { msg: C.UserMsg; eng: AskEngine; t: T; onEdit?: (uid: string) => void }) {
  switch (msg.state) {
    case 'sending': return <p className={s.userState}>{t('ask.sending')}</p>;
    case 'queued':
      // Waiting for the agent's next step: read back by its command id, or dismissed (never sent again). Edit and Remove are the kit
      // transcript's (rowActions.ts actionsOf); this line says what taking it back came to.
      // The sentence on its own line, then the actions (a dot only between two), then the note on Stop tracking: run together,
      // a narrow dock wrapped a dot to the start of a line.
      {
        const check = canCheckRow(msg, eng.journaled), stop = canStopTracking(msg, eng.journaled);
        return (
          <p className={s.userState}>
            <span className={s.userLine}>{t(queuedWords(msg, !!eng.getSnapshot().gate))}{msg.reason && msg.reason !== 'ask.withdrawFailed' && <> {t(msg.reason as 'ask.checkFailed')}</>}</span>
            {check && <TextButton onPress={() => eng.check(msg.id)}>{t('ask.checkStatus')}</TextButton>}
            {check && stop && <span aria-hidden="true">·</span>}
            {stop && <><TextButton onPress={() => eng.dismiss(msg.id)}>{t('ask.stopTracking')}</TextButton><span className={s.userLine}>{t('ask.dismissNote')}</span></>}
          </p>
        );
      }
    case 'sent': return msg.text || msg.pics?.length ? null : <p className={s.userState}>{t('ask.reachedAgent')}</p>;
    case 'unknown':
      // A reload lost the text. A first message or turn takes the retyped text under its key; a follow-up never
      // does: it is read back by its command id, or, with none, the person dismisses it.
      return (
        <p className={s.userState}>
          <span>{t('ask.mayHave')}</span>
          {msg.reason && <><span aria-hidden="true">·</span><span>{t(msg.reason as 'ask.checkFailed')}</span></>}
          {unknownWords(msg, eng.journaled) && <><span aria-hidden="true">·</span><span>{t(unknownWords(msg, eng.journaled)!)}</span></>}
          {canCheckRow(msg, eng.journaled) && <><span aria-hidden="true">·</span><TextButton onPress={() => eng.check(msg.id)}>{t('ask.checkStatus')}</TextButton></>}
          {canStopTracking(msg, eng.journaled) && <><span aria-hidden="true">·</span><TextButton onPress={() => eng.dismiss(msg.id)}>{t('ask.stopTracking')}</TextButton><span aria-hidden="true">·</span><span>{t('ask.dismissNote')}</span></>}
        </p>
      );
    case 'notSent':
      return (
        <p className={cx(s.userState, s.bad)}>
          <span>{t('ask.notSent')}</span>
          {msg.reason && msg.reason !== 'ask.failed' && <><span aria-hidden="true">·</span><span>{t(msg.reason as 'ask.failed')}</span></>}
          {canResend(msg) && <><span aria-hidden="true">·</span><TextButton onPress={() => eng.resend(msg.id)}>{t('ask.sendAgain')}</TextButton></>}
          {(msg.text ? canEdit(msg) && onEdit : eng.journaled) && <><span aria-hidden="true">·</span><TextButton onPress={() => (msg.text ? onEdit?.(msg.id) : eng.dismiss(msg.id))}>{t(msg.text ? 'ask.attEdit' : 'ask.stopTracking')}</TextButton></>}
        </p>
      );
    case 'refused': return <p className={cx(s.userState, s.bad)}>{t((msg.reason || 'ask.refused') as 'ask.refused')}</p>;
    case 'superseded': return <p className={s.userState}>{t('ask.superseded')}</p>;
    default: return null;
  }
}

// ---- the step trail ----
// Plain verbs for the agent's own tools; another tool shows its name with spaces for underscores.
const VERBS = {
  bash: 'ask.tool.run', bash_job: 'ask.tool.run', bash_job_wait: 'ask.tool.wait', write_file: 'ask.tool.write', edit_file: 'ask.tool.edit',
  multi_edit: 'ask.tool.edit', read_file: 'ask.tool.read', list_files: 'ask.tool.list', glob: 'ask.tool.find', grep: 'ask.tool.search',
  web_fetch: 'ask.tool.fetch', web_search: 'ask.tool.webSearch', ask_question_to_user: 'ask.tool.ask', todo_write: 'ask.tool.plan',
} as const;
type Verb = (typeof VERBS)[keyof typeof VERBS];
export function toolVerb(name: string, t: T): string {
  const k = (VERBS as Record<string, Verb | undefined>)[name];
  return k ? t(k) : name.replace(/^mcp__[^_]+__/, '').replace(/_/g, ' ');
}
// A step's words (its summary, why it failed, a note) come from the model and its tools: keys are hidden first, then the text is
// cleaned (cleaning can glue a key to the word before it).
const stepState = (s: Step): StepView['state'] => (s.ok === null ? 'running' : s.unknown ? 'unknown' : s.ok ? 'ok' : 'failed');
/** Why a step failed: held hooks (the card below says why and points to the Agent app), an unknown outcome (it may have run;
 *  never "failed"), or the first line the tool answered, cleaned and cut. */
function stepNote(s: Step, t: T): string | undefined {
  if (s.ok !== false) return undefined;
  if (s.unknown) return t('ask.stepUnknown');
  if (s.held) return t('ask.stepHeld');
  const why = s.why ? clean(scrubSecrets(s.why), 160).text : '';
  return why ? t('ask.stepFailedWhy', { why }) : t('ask.stepFailed');
}
/** The agent records a summary of a call, not the call: it cuts a command at 500 bytes and ends it with three dots (daemon
 *  SummarizeToolInput, `$ ` or `[bg] $ ` before it). Read on the text as the agent sent it, before any key is hidden. */
const AGENT_COMMAND_BYTES = 500;
export function agentCutCommand(name: string, summary: string): boolean {
  if (name !== 'bash') return false;
  const m = /^(\[bg\] )?\$ /.exec(summary);
  if (!m || !summary.endsWith('...')) return false;
  return new TextEncoder().encode(summary.slice(m[0].length, -3)).length === AGENT_COMMAND_BYTES;
}
/** The host's own bound on a step's text. */
const STEP_TEXT_MAX = 1500;
function stepRow(s: Step, t: T): StepView {
  const c = clean(scrubSecrets(s.summary), STEP_TEXT_MAX);
  // The row is one line; the open row shows the text as recorded, line breaks kept.
  const summary = c.text.replace(/\n+/g, ' ');
  const note = stepNote(s, t);
  return {
    id: s.id, state: stepState(s), verb: toolVerb(s.name, t),
    ...(summary ? { summary } : {}),
    ...(c.text !== summary ? { text: c.text } : {}),
    ...(c.cut > 0 || agentCutCommand(s.name, s.summary) ? { cut: true } : {}),
    ...(s.at !== undefined && s.end !== undefined && s.end - s.at >= 1000 ? { time: duration(s.end - s.at) } : {}),
    ...(note ? { note } : {}),
    ...(s.pics?.length ? { pictures: s.pics.map((p) => ({ path: p.path, name: p.name, ...(p.bytes !== undefined ? { size: p.bytes } : {}) })) } : {}),
  };
}
/** One trail of the engine's column as the kit's steps block: the dock and the chat page draw the same rows (kit StepTrail). */
export function trailSteps(b: Extract<C.Block, { k: 'trail' }>, t: T): Extract<ConvBlock, { k: 'steps' }> {
  const count = t('ask.steps', { count: b.total });
  // Under a second says nothing ("0 s"): the count alone.
  const counted = b.ms !== null && b.ms >= 1000 ? t('ask.stepsTime', { steps: count, time: duration(b.ms) }) : count;
  const label = b.live ? clean(scrubSecrets(b.live.summary || b.live.name), 200).text : counted;
  const state = !b.done ? 'running' : b.failed ? 'failed' : b.unknown ? 'unknown' : 'ok';
  let n = 0;
  const rows = b.rows.map((r): StepView => (r.k === 'step' ? stepRow(r.step, t) : { id: `${b.key}:n${++n}`, state: 'ok', kind: 'note', verb: t('ask.note'), summary: clean(scrubSecrets(r.text), 600).text }));
  return { k: 'steps', key: b.key, label, count: counted, state, rows };
}

// ---- outcomes ----
function RetryAt({ at, onRetry, t }: { at: string; onRetry: (() => void) | null; t: T }) {
  const due = Date.parse(at);
  const now = useNow(Number.isFinite(due) && due > Date.now());
  const left = Number.isFinite(due) ? due - now : 0;
  if (!onRetry) return null;
  return left > 0
    ? <Button variant="secondary" size="sm" isDisabled>{t('ask.retryIn', { time: duration(left) })}</Button>
    : <Button variant="secondary" size="sm" onPress={onRetry}>{t('ask.tryAgain')}</Button>;
}
/** A New conversation button outside the header: like the header's, it waits for a first message still on its way (newWaits)
 *  and says why (the kit's ReasonButton: focusable, never acts, the reason is its description). The two states are different
 *  elements with one action key (data-action-id, as the kit's focus-follow rule): when the one that had the focus is replaced
 *  (focus fell to the page), the new one takes it; a person who had moved on keeps their place. */
export function NewConversation({ eng, size, t }: { eng: AskEngine; size?: 'sm'; t: T }) {
  const waits = eng.newWaits();
  const id = useId();
  const sel = `[data-action-id="${id}"]`;
  // Read while rendering, before a commit that may replace the element: whether this New has the focus now.
  const had = useRef(false);
  had.current = hostEnv().browserPage === true && !!document.activeElement?.matches(sel);
  useLayoutEffect(() => {
    if (!had.current) return;
    const on = document.activeElement;
    if (had.current && (on === null || on === document.body)) document.querySelector<HTMLElement>(sel)?.focus({ preventScroll: true });
  }, [waits, sel]);
  return waits
    ? <ReasonButton reason={t('ask.newWait')} size={size} actionId={id}>{t('ask.new')}</ReasonButton>
    : <Button variant="secondary" size={size} data-action-id={id} onPress={() => eng.newConversation()}>{t('ask.new')}</Button>;
}
/** The ways on after a failure no Retry helps: a new conversation when this one ran out of room, the models page when there is no model. */
export function FailureExtras({ kind, ended, eng, t }: { kind: string; ended: boolean; eng: AskEngine; t: T }) {
  return (
    <>
      {kind === 'ask.tooLong' && ended ? <NewConversation eng={eng} size="sm" t={t} /> : null}
      {/* An actions slot takes a Button or LinkButton, never a Link. */}
      {kind === 'ask.noModel' || kind === 'ask.tooLong' ? <ToPageButton page="ai" path={aiLinks.list} label={t('ask.openModels')} /> : null}
    </>
  );
}
function Failure({ code, retryAt, retry, ended, eng, t }: { code: string; retryAt: string | null; retry: string | null; ended: boolean; eng: AskEngine; t: T }) {
  const key = failureKey(code);
  const words = key === 'ask.rateLimited' && retryAt && clock(retryAt) ? t('ask.rateLimitedAt', { time: clock(retryAt) }) : t(key === 'ask.failed' ? 'ask.o.failed' : (key as 'ask.noModel'));
  // `retry` names the failed message (rowActions.retryFor: the newest failed turn, never one Retry cannot help): Retry sends its own text and files, never the composer's.
  const onRetry = retry ? () => eng.retryMsg(retry) : null;
  return (
    <Band
      tone="danger"
      size="table"
      actions={<>
        <FailureExtras kind={key} ended={ended} eng={eng} t={t} />
        {/* No plain Retry after a conversation got too long: the same prompt on the same model runs out of room again. */}
        {key === 'ask.rateLimited' && retryAt ? <RetryAt at={retryAt} onRetry={onRetry} t={t} /> : onRetry ? <Button variant="secondary" size="sm" onPress={onRetry}>{t('ask.retry')}</Button> : null}
      </>}
    >
      {words}
    </Band>
  );
}

/** Check again, after a turn whose end could not be read. */
export function CheckAgain({ eng, t }: { eng: AskEngine; t: T }) {
  return <Button variant="secondary" size="sm" onPress={() => eng.checkOutcome()}>{t('ask.checkAgain')}</Button>;
}

/** The reply block with the completed-turn index the conversation's producer will stamp on it (see kit/agent source.ts ConvBlock.turn). */
type TurnReply = Extract<C.Block, { k: 'reply' }> & { turn?: number };
/** The host's menu for one finished reply (the kit's TurnMenu shape). */
type TurnMenu = (t: { key: string; turn: number }) => ReactNode;

/** When the Agent finished its answer in the turn that block `i` belongs to: the time of that turn's last finished reply. */
function answeredAt(bs: readonly C.Block[], i: number): number | undefined {
  let at: number | undefined;
  for (let j = i; j < bs.length && (bs[j] as C.Block).k !== 'user'; j += 1) {
    const b = bs[j] as C.Block;
    if (b.k === 'reply' && b.final && !b.streaming && b.at !== null) at = b.at;
  }
  return at;
}

function BlockView({ b, eng, t, last, live, agentUrl, onEdit, turnMenu, headAt }: { b: C.Block; eng: AskEngine; t: T; last: boolean; live: boolean; agentUrl: string; onEdit?: (uid: string) => void; turnMenu?: TurnMenu; headAt?: number }): ReactNode {
  switch (b.k) {
    case 'user': return <UserBlock msg={b.msg} eng={eng} t={t} onEdit={onEdit} />;
    case 'trail': return <StepTrail b={trailSteps(b, t)} />;
    case 'reply': {
      const text = shownReply(b.text);
      if (!text) return null;
      return (
        <ReplyBox>
          <Prose text={text} caret={b.streaming && live} marks={!b.streaming} />
          {b.cut && <p className={s.muted}>{t('ask.replyCut')}</p>}
          {b.final && !b.streaming && <ReplyFooter text={text} cost={b.cost} at={b.at !== headAt ? b.at : null} menu={turnMenu && (b as TurnReply).turn !== undefined ? turnMenu({ key: b.key, turn: (b as TurnReply).turn as number }) : undefined} />}
        </ReplyBox>
      );
    }
    case 'decided': return <DecidedLine d={b.d} />;
    case 'outcome':
      if (b.state === 'completed') return null;
      if (b.state === 'failed') return <Failure code={b.code} retryAt={b.retryAt} retry={retryFor(b, last)} ended eng={eng} t={t} />;
      return <p className={s.outcome}>{t(b.state === 'cancelled' ? 'ask.o.cancelled' : 'ask.o.interrupted')}</p>;
    case 'error': return <Failure code={b.code} retryAt={b.retryAt} retry={null} ended={false} eng={eng} t={t} />;
    case 'unsure':
      return (
        // An outcome that could not be read is pending, never a failure (C9): the warn band, and only the read-back action.
        <Band tone="warn" size="table" actions={<CheckAgain eng={eng} t={t} />}>{t('ask.o.unsure')}</Band>
      );
    case 'stopUnsure': return <Band tone="warn" size="table" actions={<CheckAgain eng={eng} t={t} />}>{t('ask.stopUnsure')}</Band>;
    case 'hooks': return <HooksHeld agentUrl={agentUrl} t={t} />;
    // The agent's summary of the earlier conversation: folded, opened to the summary as a reply is drawn.
    case 'summary': { const text = shownReply(b.text); return text ? <SummaryNote text={text} /> : null; }
  }
}

/** Hooks in the computer's settings hold the agent until someone trusts them. The Hub only says so and
 *  points to the Agent app, where the hooks are shown and trusted: no trust is sent from here. */
export function HooksHeld({ agentUrl, t }: { agentUrl: string; t: T }) {
  return (
    <CardFrame label={t('ask.hooksTitle')}>
      <CardHead>{t('ask.hooksTitle')}</CardHead>
      <CardBody>
        <p className={s.hooksText}>{t('ask.hooksBody')}</p>
      </CardBody>
      {agentUrl && (
        <div className={s.errorActions}>
          <Link href={agentUrl} target="_blank" rel="noopener noreferrer" iconEnd="external">{t('ask.hooksOpenAgent')}</Link>
        </div>
      )}
    </CardFrame>
  );
}

export interface ColumnProps {
  eng: AskEngine;
  snap: Snapshot;
  agentUrl: string;
  /** Unused: the column draws no gate card. Kept so its callers need no change. */
  typing?: boolean;
  /** Shown when the conversation is empty (first use). */
  empty: ReactNode;
  /** A band at the top of the column (cannot reach, connection lost). */
  top?: ReactNode;
  /** A Not sent message with files goes back to the composer (AskPanel puts its text there). */
  onEdit?: (uid: string) => void;
  /** A menu on each finished reply that carries its turn index (Fork from here): the host owns the items. */
  turnMenu?: TurnMenu;
}

export function Column({ eng, snap, agentUrl, empty, top, onEdit, turnMenu }: ColumnProps) {
  const t = useStrings(strings);
  const live = snap.status !== null && snap.status !== 'waiting';
  const now = useNow(live);
  const bs = C.blocks(snap.conv, now);
  // Where the newest turn starts: its message (the whole log when there is none).
  const lastTurn = bs.reduce((at, b, i) => (b.k === 'user' ? i : at), 0);
  const scroller = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const [behind, setBehind] = useState(false);
  const size = bs.length + ':' + JSON.stringify(bs[bs.length - 1] ?? null).length;
  // Follow the bottom while the person is there; otherwise offer the way back.
  // Scroll positions are DOM members: a terminal draws the log in its own scroll box, which follows the bottom itself.
  const dom = hostEnv().browserPage === true;
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el || !dom) return;
    if (atBottom.current) el.scrollTop = el.scrollHeight;
    else setBehind(true);
  }, [size, dom]);
  const onScroll = () => {
    const el = scroller.current;
    if (!el || !dom) return;
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
    if (atBottom.current) setBehind(false);
  };
  useEffect(onScroll, [size, dom]);
  const toBottom = () => { const el = scroller.current; if (el && dom) { el.scrollTop = el.scrollHeight; atBottom.current = true; setBehind(false); } };
  // Announcement: a finished reply (polite).
  const lastReply = [...bs].reverse().find((b) => b.k === 'reply' && b.final && !b.streaming) as Extract<C.Block, { k: 'reply' }> | undefined;
  const nothing = !bs.length;
  return (
    <div className={s.columnWrap}>
      {top}
      <div ref={scroller} className={s.column} role="log" aria-label={t('ask.log')} onScroll={onScroll}>
        {snap.conv.gapTop && <p className={s.outcome}>{t('ask.gap')}</p>}
        {/* The newest turn's blocks (from its message on) are marked: its reply keeps its actions in sight (kit
            Conversation.module.css), as SessionView's newest turn. */}
        {nothing ? empty : bs.map((b, i) => {
          // Who answers and when it was finished: once per turn, above the Agent's first block, as SessionView draws it.
          const head = b.k !== 'user' && (i === 0 || (bs[i - 1] as C.Block).k === 'user');
          const headAt = b.k === 'user' ? undefined : answeredAt(bs, bs.slice(0, i + 1).reduce((at, x, j) => (x.k === 'user' ? j + 1 : at), 0));
          return (
            <Fragment key={b.key}>
              {head && <div className={s.blk} data-k="author" {...(i >= lastTurn ? { 'data-latest': '' } : {})}><Author who="agent" at={headAt} /></div>}
              <div className={cx(s.blk, b.k === 'user' && i > 0 && s.turnGap)} {...(i >= lastTurn ? { 'data-latest': '' } : {})}><BlockView b={b} eng={eng} t={t} last={i === bs.length - 1} live={snap.status === 'working'} agentUrl={agentUrl} onEdit={onEdit} turnMenu={turnMenu} headAt={headAt} /></div>
            </Fragment>
          );
        })}
        {snap.dormant && <p className={s.outcome}>{t('ask.dormant')}</p>}
      </div>
      {behind && (
        <div className={s.pillWrap}>
          <Button size="sm" variant="secondary" icon="arrow-down" onPress={toBottom}>{t('ask.newActivity')}</Button>
        </div>
      )}
      <div className={s.srOnly} aria-live="polite">{lastReply ? clean(hideSecrets(C.withoutCloseMarker(lastReply.text)), 300).text : ''}</div>
    </div>
  );
}
