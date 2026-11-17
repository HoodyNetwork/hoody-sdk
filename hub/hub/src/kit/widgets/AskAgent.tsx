// "Ask the Agent": the one way a section asks the in-Hub Agent about what it shows (AgentHint is for a remote agent
// instead). A section-head action opens a drawer, or with `mode: 'step'` a step of the drawer the page already shows
// (one drawer at a time): where it asks, the request in plain words, what the Agent reads (shown open, part by part, each
// part's exact text one press away), Explain, an optional "Tell the Agent what you want", and one outcome line. Each question starts a new Ask dock conversation and is sent once per key; the page builds it and masks its own ids and secrets.
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { ComputerRow } from '@core';
import { hostEnv } from '../../core/host-env';
import { startAgentConversation, useAskDock, type AskStartOutcome } from '../ask';
import { Button } from '../controls/Button';
import { Disclosure } from '../controls/Disclosure';
import { CodeBlock, CopyButton } from '../data/Ids';
import { TextField } from '../forms/fields';
import { Outcome } from '../forms/Outcome';
import { ActionControl } from '../layouts/anatomy/ActionBar';
import { SubSection } from '../layouts/anatomy/Section';
import type { ActionSpec, SectionActions } from '../layouts/anatomy/types';
import { Row, Stack } from '../layouts/Stack';
import { ConfirmDialog, Drawer } from '../overlays/Overlays';
import { Band } from '../states/Band';
import type { OutcomeKind } from '../outcome';
import { useStrings } from '../strings';
import strings from './AskAgent.strings.en.json';
import st from './AskAgent.module.css';

/** One question as the page built it: the question, then the context the Agent reads (shown under it in the panel). */
export interface AgentQuestion {
  text: string;
  context?: string;
  /** The request in one line ("Check who can open these computers"): the Agent panel shows it as your message, with the
   *  question and the context one press away. Sent with the question. */
  title?: string;
  /** What the context is, in a few words ("access rules of 3 computers"): the panel's "Context sent: …" row. */
  contextLabel?: string;
}

/** How the drawer draws a text the Agent gets. 'data' (the default): in the monospace box, character for character
 *  (rules, listings, JSON: where alignment and exact characters matter). 'prose' (sentences): in the body font, one
 *  paragraph per line. Display only: what is sent and what Copy gives are the text as it is, either way. The page says
 *  which; the drawer never guesses it from the text. */
export type AgentTextKind = 'prose' | 'data';

/** One part of what the Agent reads, as the drawer lists it: a plain title, and its exact text behind a fold. Without
 *  `text` the row only says so (`note`: still being read, could not be read). */
export interface AgentReadPart {
  id: string;
  title: string;
  text?: string;
  note?: string;
  /** How its text is drawn (AgentTextKind); 'data' when not set. */
  kind?: AgentTextKind;
}

export type AskAgentKind = 'explain' | 'tell';

export interface UseAskAgentOptions {
  /** One question at a time per key (account, realm and what is asked about): the send-once hold. */
  askKey: string;
  /** What the section is about, in plain words ("atlas", "access on your computers"): the title and the action's name. */
  subject: string;
  /** The page's shown title, for the dock's "from" line; never a url or an id. */
  source: string;
  /** The computer to ask on. Without one, the computer shown now (none shown: nothing is sent, the line says so). */
  computer?: (ComputerRow & { readonly name: string }) | null;
  /** Explain: the page's fixed question. `run` gets `send`: call it with the question (now, or after a fresh read), or
   *  with null when it could not be built (nothing is sent; the line says the details could not be read). */
  explain: { busy?: boolean; run: (send: (q: AgentQuestion | null) => void) => void };
  /** "Tell the Agent what you want": the page's check answers the question to send, or the problem shown under the
   *  field (nothing is sent), or null while there is nothing to send. */
  tell?: { label: string; description?: string; disabledReason?: string; check: (text: string) => { q: AgentQuestion } | { problem: string } | null };
  /** Explain's request as the person reads it before sending: the one-line title the Agent panel will show, what it
   *  asks for in a sentence or two, and the exact instructions sent with it (behind a fold). */
  request?: { title: string; summary?: string; text?: string; textKind?: AgentTextKind };
  /** What the Agent will read, as the page builds it (the Explain context), shown open: one text, or its parts, each
   *  with its exact text behind a fold. The parts' texts, in order, are the context. */
  reads?: string | readonly AgentReadPart[];
  /** One line under the parts (when they were read; that sending reads them again). */
  readsNote?: string;
  /** Set: nothing can be asked now (a stale read, no rights); the reason shows on the action and in the drawer. */
  disabledReason?: string;
  /** With disabledReason: the action still opens the drawer, which says why and holds the page's way on in `after`
   *  (a failed re-read and its "Read the rules again"). Explain and Tell stay off. */
  opensDisabled?: boolean;
  /** Told each outcome of each question ('unknown' may later become 'sent'). */
  onOutcome?: (o: AskStartOutcome, kind: AskAgentKind) => void;
  /** Below the outcome: the page's follow-up (a re-read while the Agent may write, a Check now). */
  after?: ReactNode;
  /** 'drawer' (default): its own drawer. 'step': a step of the drawer the page shows (one drawer at a time). */
  mode?: 'drawer' | 'step';
}

export interface AskAgent {
  /** The head action: give it to withAskAgent (a section head), or to a toolbar or a menu as it is. */
  action: ActionSpec;
  isOpen: boolean;
  open: () => void;
  close: () => void;
  /** The drawer title. */
  title: string;
  /** Where it asks, one line under the title: the own drawer's subtitle. A step keeps it as its panel's first line (the
   *  host's header is the host's); a host may show it under its own title instead. */
  subtitle: string;
  /** mode 'drawer': the drawer to render once (null while closed). mode 'step': null. */
  drawer: ReactNode;
  /** mode 'step': the body to show instead of the host's (Explain first in it), with the host's onBack = close. */
  panel: ReactNode;
}

// The send-once hold, per key, at module level so it outlives remounts and drawers (a reload forgets it). While a
// question may have reached the Agent ('unknown') or waits to be taken, `held` is true and nothing else is sent for
// that key; "Look in the Agent panel" and a warned "Stop tracking…" are the ways on. `id` tells a late answer of an
// older question from the current one.
type Start = { id: number; said: AskStartOutcome | 'unread' | null; held: boolean };
const starts = new Map<string, Start>();
const listeners = new Set<() => void>();
let seq = 0;
function setStart(key: string, v: Start | undefined): void {
  if (v) starts.set(key, v);
  else starts.delete(key);
  for (const fn of listeners) fn();
}
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
};
/** Tests: forget every key's question. */
export function resetAskAgentForTests(): void {
  starts.clear();
  seq = 0;
  for (const fn of listeners) fn();
}
/** Whether a question for this key may still reach the Agent (waiting to be taken, or unknown): nothing else is sent. */
export const askAgentHeld = (key: string): boolean => starts.get(key)?.held ?? false;

/** A section head's actions with Ask the Agent placed by the kit: a free secondary slot, else the top of the ⋯ menu
 *  (ActionBar folds secondaries on narrow screens). */
export function withAskAgent(actions: SectionActions | undefined, ask: ActionSpec): SectionActions {
  const a = actions ?? {};
  const secondary = a.secondary ?? [];
  if (secondary.length === 0) return { ...a, secondary: [ask] };
  if (secondary.length === 1) return { ...a, secondary: [secondary[0], ask] };
  const item = { id: ask.id, label: ask.name ?? ask.label, icon: ask.icon, opens: true, isDisabled: ask.disabledReason !== undefined, disabledReason: ask.disabledReason, onAction: ask.onPress };
  return { ...a, menu: a.menu?.length ? [item, '-', ...a.menu] : [item] };
}

/** A paragraph's lead-in ("Logs:"), set in bold when it is mechanical: the words before the paragraph's first ": ",
 *  when they are short and hold no sentence of their own. Otherwise none (the paragraph stays plain). */
const LEAD_MAX = 32;
function leadOf(paragraph: string): string | null {
  const at = paragraph.indexOf(': ');
  if (at < 1 || at > LEAD_MAX) return null;
  const words = paragraph.slice(0, at);
  return /^[A-Za-z][^.,;:!?"()[\]{}]*$/.test(words) && words.trim() === words ? `${words}:` : null;
}

/** A text the Agent reads, as its kind says (AgentTextKind): prose as paragraphs in the body font, split at its line
 *  breaks for the eye only; anything else in the kit's monospace box. Its Copy is the fold row's (ReadFold). */
function AgentText({ text, kind, label, tall }: { text: string; kind: AgentTextKind | undefined; label: string; tall?: boolean }) {
  if (kind !== 'prose') {
    return (
      <CodeBlock
        label={label}
        lang="plain" // reason: English text for the Agent, not a command
        wrap
        noCopy
        {...(tall ? { maxHeight: 'md' as const } : {})}
        code={text}
      />
    );
  }
  const paragraphs = text.split('\n').filter((line) => line.trim() !== '');
  return (
    <figure className={st.prose} aria-label={label} translate="no">
      {paragraphs.map((p, i) => {
        const lead = leadOf(p);
        return <p key={i}>{lead ? <><strong className={st.lead}>{lead}</strong>{p.slice(lead.length)}</> : p}</p>;
      })}
    </figure>
  );
}

/** One text the Agent reads behind a fold: the row names it and ends with Copy (the exact text, open or closed); open,
 *  the text takes the fold's width. */
function ReadFold({ title, note, text, kind, tall }: { title: string; note?: string | undefined; text: string; kind: AgentTextKind | undefined; tall?: boolean }) {
  const t = useStrings(strings);
  return (
    <div className={st.fold}>
      <Disclosure heading={false} title={title} description={note} className={st.foldBody}>
        <AgentText label={title} kind={kind} text={text} {...(tall ? { tall } : {})} />
      </Disclosure>
      <CopyButton text={text} label={t('aa.copyText')} className={st.foldCopy} />
    </div>
  );
}

/** The own drawer (mode 'drawer'), rendered once by the page. */
export function AskAgentDrawer({ ask }: { ask: AskAgent }) {
  return <>{ask.drawer}</>;
}

/** The step's body (mode 'step'), shown by the host drawer in place of its own while open. */
export function AskAgentPanel({ ask }: { ask: AskAgent }) {
  return <>{ask.panel}</>;
}

/** The action as a head button where the head is not a kit section head (a hand-made head, a drawer's header). */
export function AskAgentButton({ ask }: { ask: AskAgent }) {
  return <ActionControl action={ask.action} variant="secondary" size="sm" />;
}

/** Ask the Agent for one section: the head action, plus the drawer (or the step's panel) the page renders once. */
export function useAskAgent(o: UseAskAgentOptions): AskAgent {
  const t = useStrings(strings);
  const dock = useAskDock();
  const [isOpen, setOpen] = useState(false);
  // The words typed, per key, while the hook is mounted: another key (another computer) shows its own, and coming back
  // shows these again.
  const [drafts, setDrafts] = useState<ReadonlyMap<string, string>>(() => new Map());
  const request = drafts.get(o.askKey) ?? '';
  const setRequestOf = (key: string, f: (now: string) => string) =>
    setDrafts((m) => {
      const v = f(m.get(key) ?? '');
      if (v === (m.get(key) ?? '')) return m;
      const n = new Map(m);
      if (v) n.set(key, v);
      else n.delete(key);
      return n;
    });
  const setRequest = (v: string) => setRequestOf(o.askKey, () => v);
  const [releasing, setReleasing] = useState(false);
  const explainRef = useRef<HTMLButtonElement | null>(null);
  // Another key (the same section showing another computer): its own words, closed. The hold is the key's own.
  const [forKey, setForKey] = useState(o.askKey);
  if (forKey !== o.askKey) {
    setForKey(o.askKey);
    setOpen(false);
    setReleasing(false);
  }
  // The key this hook shows now: a late answer of another key (the section showed another computer since) closes
  // nothing and clears no words here.
  const shownKey = useRef(o.askKey);
  shownKey.current = o.askKey;
  const cur = useSyncExternalStore(subscribe, () => starts.get(o.askKey), () => starts.get(o.askKey));
  const held = cur?.held ?? false;
  const said = cur?.said ?? null;
  const mode = o.mode ?? 'drawer';
  const title = t('aa.title', { subject: o.subject });
  const subtitle = o.computer ? t('aa.on', { computer: o.computer.name }) : t('aa.onShown');
  const close = () => setOpen(false);
  const open = () => setOpen(true);
  // Open, then Enter: Explain takes focus once the drawer (or the step) shows.
  useEffect(() => {
    // A web page only: the terminal's drawer puts focus on its first control itself, and has no animation frame.
    if (!isOpen || hostEnv().browserPage !== true) return;
    const f = window.requestAnimationFrame(() => explainRef.current?.focus());
    return () => window.cancelAnimationFrame(f);
  }, [isOpen]);
  // A definite outcome already said is not said again on the next open; a hold stays.
  useEffect(() => {
    if (isOpen) return;
    const was = starts.get(o.askKey);
    if (was && !was.held && was.said) setStart(o.askKey, { ...was, said: null });
  }, [isOpen, o.askKey]);

  const send = (kind: AskAgentKind, q: AgentQuestion | null, asked?: string) => {
    const key = o.askKey;
    if (starts.get(key)?.held) return;
    const id = ++seq;
    if (!q) {
      setStart(key, { id, said: 'unread', held: false });
      return;
    }
    setStart(key, { id, said: null, held: true });
    startAgentConversation({
      text: q.text,
      ...(q.context ? { context: q.context } : {}),
      ...(q.title ? { title: q.title } : {}),
      ...(q.contextLabel ? { contextLabel: q.contextLabel } : {}),
      source: o.source,
      ...(o.computer ? { computer: o.computer } : {}),
      onStart: (out) => {
        // An older question's late answer neither speaks nor lifts the hold.
        const was = starts.get(key);
        if (was?.id !== id) return;
        setStart(key, { id, said: out, held: out === 'unknown' });
        o.onOutcome?.(out, kind);
        // Sent: the words asked are done with, on their own key only (newer words typed since stay).
        if (out === 'sent' && kind === 'tell') setRequestOf(key, (now) => (now === asked ? '' : now));
        if (out === 'sent' && shownKey.current === key) {
          // The Agent panel holds the conversation now: the drawer (or the step, back to the host) has done its job. A
          // late "sent" after "may have reached it" closes nothing: the person may be reading or typing here since.
          if (was.said !== 'unknown') setOpen(false);
        }
      },
    });
  };
  const blocked = o.disabledReason !== undefined;
  const pressExplain = () => {
    if (blocked || held || o.explain.busy) return;
    o.explain.run((q) => send('explain', q));
  };
  const told = o.tell && request.trim() ? o.tell.check(request) : null;
  const problem = told && 'problem' in told ? told.problem : undefined;
  const tellOff = blocked || held || o.tell?.disabledReason !== undefined;
  const pressTell = () => {
    if (tellOff || !told || !('q' in told)) return;
    send('tell', told.q, request);
  };

  const action: ActionSpec = {
    id: 'ask-agent',
    label: t('aa.label'),
    name: t('aa.name', { subject: o.subject }),
    icon: 'sparkle',
    opens: 'dialog',
    ...(o.disabledReason !== undefined && !o.opensDisabled ? { disabledReason: o.disabledReason } : {}),
    onPress: open,
  };

  // One primary per mode: Explain (the page's fixed question). Send to the Agent is a text action.
  const primary = (
    <Button ref={explainRef} variant="primary" icon="sparkle" busy={o.explain.busy} isDisabled={blocked || held} onPress={pressExplain}>
      {t('aa.explain')}
    </Button>
  );
  // One outcome line: the disabled reason first in it when both show; the reason alone otherwise. A step shows it as
  // one Band in its panel (the host drawer owns its footer). The own drawer shows it in its footer, as the kit Outcome
  // line or, while only the reason shows, the footer's reason line; its body holds no Band, and the Look / Stop tracking
  // actions are a row at the body's end (the `sm` drawer's footer has no room for them beside the line, Close and Explain).
  const looks = held ? (
    <>
      <Button size="sm" variant="ghost" onPress={() => dock.open()}>{t('aa.look')}</Button>
      <Button size="sm" variant="ghost" onPress={() => setReleasing(true)}>{t('aa.release')}</Button>
    </>
  ) : said === 'sent' ? <Button size="sm" variant="ghost" onPress={() => dock.open()}>{t('aa.look')}</Button> : undefined;
  const line = said || held || blocked ? (
    <Band
      /* noDetails: the kit's start answer (sent, notSent, unknown) carries no facts; 'unread' is the page's own refusal */
      tone={said === 'sent' && !blocked ? 'neutral' : 'warn'}
      size="table"
      actions={looks}
    >
      {blocked ? <span>{o.disabledReason}</span> : null}
      {blocked && (said || held) ? ' ' : null}
      {said || held ? <span role="status">{said ? t(`aa.${said}`) : t('aa.waiting')}</span> : null}
      {held ? <> <span>{t('aa.held')}</span></> : null}
    </Band>
  ) : null;
  const footKind: OutcomeKind | null =
    said === 'sent' ? 'done' : said === 'notSent' || said === 'unread' ? 'not_sent' : said === 'unknown' || held ? 'pending' : null;
  const footOutcome = footKind ? (
    <Outcome
      outcome={footKind}
      wrap
      title={said ? t(`aa.${said}`) : t('aa.waiting')}
      {...(blocked || held
        ? {
            detail: (
              <>
                {blocked ? o.disabledReason : null}
                {held && blocked ? ' ' : null}
                {held ? t('aa.held') : null}
              </>
            ),
          }
        : {})}
    />
  ) : undefined;
  const panel = isOpen ? (
    <Stack gap={4}>
      {mode === 'step' ? <p>{subtitle}</p> : null}
      {o.request ? (
        <SubSection title={t('aa.request')}>
          <p className={st.title}>{o.request.title}</p>
          {o.request.summary ? <p className={st.summary}>{o.request.summary}</p> : null}
          {o.request.text ? <ReadFold title={t('aa.requestExact')} kind={o.request.textKind} text={o.request.text} /> : null}
        </SubSection>
      ) : null}
      {o.reads ? (
        <SubSection title={t('aa.reads')}>
          {typeof o.reads === 'string' ? (
            <CodeBlock
              label={t('aa.reads')}
              lang="plain" // reason: English context for the Agent, not a command
              wrap
              maxHeight="md"
              code={o.reads}
            />
          ) : (
            <ul className={st.parts} aria-label={t('aa.reads')}>
              {o.reads.map((part) => (
                <li key={part.id} className={st.part}>
                  {part.text !== undefined ? (
                    <ReadFold title={part.title} note={part.note} kind={part.kind} text={part.text} tall />
                  ) : (
                    <p className={st.partPlain}><span>{part.title}</span>{part.note ? <span className={st.summary}>{part.note}</span> : null}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
          {o.readsNote ? <p className={st.summary}>{o.readsNote}</p> : null}
        </SubSection>
      ) : null}
      {mode === 'step' ? <div>{primary}</div> : null}
      {o.tell ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            pressTell();
          }}
        >
          <Stack gap={2}>
            <TextField label={o.tell.label} description={o.tell.description} multiline rows={3} value={request} onChange={setRequest} errorMessage={problem} />
            <div>
              <Button size="sm" variant="ghost" type="submit" isDisabled={tellOff || !told || !('q' in told)} {...(o.tell.disabledReason !== undefined && !blocked ? { disabledReason: o.tell.disabledReason } : {})}>{t('aa.send')}</Button>
            </div>
          </Stack>
        </form>
      ) : null}
      {mode === 'step' ? line : looks ? <Row gap={2} wrap>{looks}</Row> : null}
      {o.after}
      <ConfirmDialog
        overlayId="kit-ask-agent-release"
        isOpen={releasing}
        onOpenChange={setReleasing}
        title={t('aa.releaseTitle')}
        body={t('aa.releaseBody')}
        confirmLabel={t('aa.releaseGo')}
        onConfirm={() => {
          setReleasing(false);
          const now = starts.get(o.askKey);
          if (now) setStart(o.askKey, { ...now, held: false });
        }}
      />
    </Stack>
  ) : null;
  const drawer = mode === 'drawer' && isOpen ? (
    <Drawer
      isOpen
      onOpenChange={(v) => { if (!v) close(); }}
      title={title}
      subtitle={subtitle}
      size="sm"
      // One Ask the Agent drawer in the Hub: one remembered width, one overlay name (one drawer at a time).
      resizeKey="kit-ask-agent"
      overlayId="kit-ask-agent"
      primary={primary}
      outcome={footOutcome}
      {...(blocked && !footOutcome ? { reason: o.disabledReason } : {})}
      cancel={t('aa.close')}
      // Not dirty: the words live in this hook, not in the drawer, so closing keeps them for the next open (nothing to
      // discard; a "Discard changes?" here would ask about words that stay).
    >
      {panel}
    </Drawer>
  ) : null;
  return { action, isOpen, open, close, title, subtitle, drawer, panel: mode === 'step' ? panel : null };
}
